import type { HttpClient } from "../http.js";
import type { SupportedAsset } from "../types/index.js";
import { SOLANA_NATIVE_ASSET, SOLANA_NATIVE_DECIMALS } from "../solana.js";
import { asArray } from "../safe.js";

export interface SolanaRPCInfo {
  url: string;
  rateLimitPerMin: number;
  fallbacks: boolean;
}

export interface SolanaChainInfo {
  network: string;
  name: string;
  kind: "solana";
  nativeAsset: string;
  explorerUrl: string;
  confirmations: number;
  assets: Array<SupportedAsset>;
  rpc: SolanaRPCInfo;
}

export type SolanaRPCID = string | number | null;

export interface SolanaRPCRequest {
  jsonrpc: "2.0";
  id?: SolanaRPCID;
  method: string;
  params?: unknown;
}

export interface SolanaRPCError {
  code: number;
  message: string;
  data?: unknown;
}

export interface SolanaRPCResponse<T = unknown> {
  jsonrpc: "2.0";
  id?: SolanaRPCID;
  result?: T;
  error?: SolanaRPCError;
}

export type SolanaRPCBatchResponse<T = unknown> = Array<SolanaRPCResponse<T>>;

/** A single asset's on-chain balance for a wallet address. */
export interface AssetBalance {
  /** Asset symbol, e.g. `SOL` or `USDC`. */
  symbol: string;
  /** Human-readable amount as a decimal string, e.g. `"1.5"`. */
  amount: string;
  /** Raw amount in the asset's smallest unit (lamports / token base units). */
  raw: string;
  /** Number of decimals used to scale `raw` into `amount`. */
  decimals: number;
  /** SPL mint address; absent for the native SOL balance. */
  mint?: string;
}

/** A wallet's full on-chain balance snapshot across the chain's known assets. */
export interface OnChainBalances {
  /** The wallet address these balances belong to (base58). */
  address: string;
  /** CAIP-2-style network id, e.g. `solana:5eykt4Us…`. */
  network: string;
  /** Human-readable network name, e.g. `Solana`. */
  name: string;
  /** Block explorer base URL for the network. */
  explorerUrl: string;
  /** Native SOL balance plus a balance entry for every configured SPL asset. */
  balances: Array<AssetBalance>;
}

interface SolanaBalanceResult {
  value: number;
}

interface SolanaTokenAccountsResult {
  value: Array<{
    account?: {
      data?: {
        parsed?: {
          info?: {
            tokenAmount?: {
              amount?: string;
              decimals?: number;
            };
          };
        };
      };
    };
  }>;
}

/**
 * Scales an integer amount in base units into a human-readable decimal string
 * without floating-point error (uses BigInt division, trims trailing zeros).
 */
export function formatTokenAmount(raw: bigint, decimals: number): string {
  if (decimals <= 0) {
    return raw.toString();
  }
  const negative = raw < 0n;
  const digits = (negative ? -raw : raw).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, "");
  const value = fraction ? `${whole}.${fraction}` : whole;
  return negative ? `-${value}` : value;
}

export class SolanaApi {
  constructor(private readonly http: HttpClient) {}

  info(): Promise<SolanaChainInfo> {
    return this.http.get<SolanaChainInfo>("/solana").then((result) => ({
      ...result,
      // `assets` is `.filter`-ed/`.map`-ed in balances(); degrade a
      // missing/null/non-array value to [] so it never throws.
      assets: asArray<SupportedAsset>(result?.assets),
    }));
  }

  rpc<T = unknown>(
    request: SolanaRPCRequest,
  ): Promise<SolanaRPCResponse<T>>;
  rpc<T = unknown>(
    request: Array<SolanaRPCRequest>,
  ): Promise<SolanaRPCBatchResponse<T>>;
  rpc<T = unknown>(
    request: SolanaRPCRequest | Array<SolanaRPCRequest>,
  ): Promise<SolanaRPCResponse<T> | SolanaRPCBatchResponse<T>> {
    return this.http.postPublic<
      SolanaRPCResponse<T> | SolanaRPCBatchResponse<T>
    >("/solana/rpc", request);
  }

  async call<T = unknown>(
    method: string,
    params?: unknown,
    id: SolanaRPCID = method,
  ): Promise<T> {
    const response = await this.rpc<T>({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });
    if (Array.isArray(response)) {
      throw new Error("Solana JSON-RPC batch response returned for single call");
    }
    if (response.error) {
      throw new Error(
        `Solana JSON-RPC ${response.error.code}: ${response.error.message}`,
      );
    }
    return response.result as T;
  }

  /**
   * Reads a wallet's on-chain balances: native SOL plus every SPL asset the
   * chain advertises via `/solana`. Issues a single batched JSON-RPC request
   * (one `getBalance` + one `getTokenAccountsByOwner` per SPL mint) to stay
   * within the proxy's rate limit.
   *
   * @param owner - The wallet's base58 address (the agent's `agentId`).
   * @returns The network metadata and a balance entry per known asset.
   */
  async balances(owner: string): Promise<OnChainBalances> {
    const info = await this.info();
    const splAssets = info.assets.filter(
      (asset): asset is SupportedAsset & { address: string } =>
        typeof asset.address === "string" &&
        asset.address.length > 0 &&
        asset.symbol.toUpperCase() !== info.nativeAsset.toUpperCase(),
    );

    // Single JSON-RPC calls fired in parallel — batch requests are rejected by
    // the upstream RPC's free plan, so one request per asset is the portable path.
    const [native, ...tokens] = await Promise.all([
      this.call<SolanaBalanceResult>("getBalance", [owner], "native"),
      ...splAssets.map((asset, index) =>
        this.call<SolanaTokenAccountsResult>(
          "getTokenAccountsByOwner",
          [owner, { mint: asset.address }, { encoding: "jsonParsed" }],
          `spl:${index}`,
        ),
      ),
    ]);

    const balances: Array<AssetBalance> = [];

    const lamports = BigInt(native?.value ?? 0);
    balances.push({
      symbol: info.nativeAsset || SOLANA_NATIVE_ASSET,
      raw: lamports.toString(),
      decimals: SOLANA_NATIVE_DECIMALS,
      amount: formatTokenAmount(lamports, SOLANA_NATIVE_DECIMALS),
    });

    splAssets.forEach((asset, index) => {
      const accounts = tokens[index]?.value ?? [];
      let total = 0n;
      for (const entry of accounts) {
        const amount =
          entry.account?.data?.parsed?.info?.tokenAmount?.amount ?? "0";
        total += BigInt(amount);
      }
      balances.push({
        symbol: asset.symbol,
        mint: asset.address,
        raw: total.toString(),
        decimals: asset.decimals,
        amount: formatTokenAmount(total, asset.decimals),
      });
    });

    return {
      address: owner,
      network: info.network,
      name: info.name,
      explorerUrl: info.explorerUrl,
      balances,
    };
  }
}
