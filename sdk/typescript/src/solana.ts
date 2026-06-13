import { ed25519 } from "@noble/curves/ed25519.js";

import type { SigningKey } from "./auth.js";
import type { X402AuthorizationFields } from "./x402.js";
import {
  buildX402PaymentMap,
  type X402PaymentMap,
  type X402PaymentMapOptions,
} from "./x402.js";

export const SOLANA_MAINNET_NETWORK =
  "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
export const SOLANA_USDC_MINT =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const SOLANA_TOKEN_PROGRAM_ID =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
/** The System program, used to transfer native SOL (lamports). */
export const SOLANA_SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
/** Default asset symbol that denotes a native SOL (lamports) transfer. */
export const SOLANA_NATIVE_ASSET = "SOL";
/** Decimals of native SOL (1 SOL = 1e9 lamports). */
export const SOLANA_NATIVE_DECIMALS = 9;

export interface SolanaPaymentExecutionOptions {
  rpcUrl: string;
  secretKey: string | Uint8Array;
  payment: Pick<
    X402AuthorizationFields,
    "network" | "asset" | "amount" | "to"
  >;
  /**
   * Expected x402 network. When set, the payment's network must match it
   * exactly; when omitted, any `solana:*` network is accepted (so the same
   * client works against the mainnet network id served over a local validator
   * RPC). Defaults to accepting any Solana network.
   */
  network?: string;
  /**
   * Asset symbol (case-insensitive) that denotes a native SOL transfer rather
   * than an SPL-token transfer. Defaults to {@link SOLANA_NATIVE_ASSET} ("SOL").
   */
  nativeAsset?: string;
  mint?: string;
  decimals?: number;
  sourceTokenAccount?: string;
  destinationTokenAccount?: string;
  commitment?: "processed" | "confirmed" | "finalized";
  /**
   * How many times to poll for the transaction to reach `commitment` (500ms
   * apart) before giving up. Defaults to {@link DEFAULT_CONFIRMATION_POLLS}.
   * Raise it when waiting for `finalized` (e.g. SPL settlements the backend
   * reads on-chain at finalized commitment, which can take ~30s on a validator).
   */
  confirmationPolls?: number;
  fetch?: typeof globalThis.fetch;
}

export interface SolanaPaymentExecution {
  signature: string;
  from: string;
  to: string;
  mint: string;
  amount: string;
  sourceTokenAccount: string;
  destinationTokenAccount: string;
}

export interface SolanaX402PaymentExecutionOptions
  extends Omit<SolanaPaymentExecutionOptions, "payment"> {
  signer: SigningKey;
  payment: X402PaymentMapOptions;
}

export interface SolanaX402PaymentExecution extends SolanaPaymentExecution {
  payment: X402PaymentMap;
}

type JsonRpcResponse<T> = {
  result?: T;
  error?: { code?: number; message?: string };
};

type TokenAccountResponse = {
  value: Array<{
    pubkey: string;
    account: {
      data: {
        parsed?: {
          info?: {
            tokenAmount?: {
              amount?: string;
            };
          };
        };
      };
    };
  }>;
};

type LatestBlockhashResponse = {
  value: {
    blockhash: string;
  };
};

type SignatureStatusesResponse = {
  value: Array<{
    confirmationStatus?: string;
    err?: unknown;
  } | null>;
};

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/** Default number of 500ms confirmation polls (≈10s) before giving up. */
export const DEFAULT_CONFIRMATION_POLLS = 20;

export async function executeSolanaPayment(
  options: SolanaPaymentExecutionOptions,
): Promise<SolanaPaymentExecution> {
  if (options.network !== undefined) {
    if (options.payment.network !== options.network) {
      throw new Error(
        `Unexpected Solana network: ${options.payment.network} (expected ${options.network})`,
      );
    }
  } else if (!options.payment.network.startsWith("solana:")) {
    throw new Error(`Unsupported Solana network: ${options.payment.network}`);
  }

  const nativeAsset = (options.nativeAsset ?? SOLANA_NATIVE_ASSET).toUpperCase();
  const isNative = (options.payment.asset ?? "").toUpperCase() === nativeAsset;
  if (!isNative && options.payment.asset !== "USDC" && !options.mint) {
    throw new Error(
      `Unsupported Solana asset: ${options.payment.asset} (provide a mint, or use the native "${nativeAsset}" asset)`,
    );
  }

  const secretKey = solanaSecretKeyBytes(options.secretKey);
  const seed = secretKey.slice(0, 32);
  const publicKey = ed25519.getPublicKey(seed);
  if (secretKey.length === 64 && !bytesEqual(publicKey, secretKey.slice(32))) {
    throw new Error("Solana secret key public key does not match seed");
  }

  const fetchFn = options.fetch ?? globalThis.fetch;
  const commitment = options.commitment ?? "confirmed";
  const polls = options.confirmationPolls ?? DEFAULT_CONFIRMATION_POLLS;
  const payer = encodeBase58(publicKey);
  const amount = normalizedAmount(options.payment.amount);

  // Native SOL: a System-program lamport transfer, payer -> recipient wallet.
  // No mint, no token accounts.
  if (isNative) {
    const latest = await rpc<LatestBlockhashResponse>(
      fetchFn,
      options.rpcUrl,
      "getLatestBlockhash",
      [{ commitment }],
    );
    const message = nativeTransferMessage({
      payer,
      to: options.payment.to,
      amount,
      recentBlockhash: latest.value.blockhash,
    });
    const txSignature = await sendSignedMessage(
      fetchFn,
      options.rpcUrl,
      message,
      seed,
      commitment,
      polls,
    );
    return {
      signature: txSignature,
      from: payer,
      to: options.payment.to,
      mint: nativeAsset,
      amount,
      sourceTokenAccount: payer,
      destinationTokenAccount: options.payment.to,
    };
  }

  // SPL token transfer (e.g. USDC) via transferChecked. Token-account lookups
  // happen before fetching the blockhash to match the historical RPC order.
  const mint = options.mint ?? SOLANA_USDC_MINT;
  const sourceTokenAccount =
    options.sourceTokenAccount ??
    (await findTokenAccount({
      fetchFn,
      rpcUrl: options.rpcUrl,
      owner: payer,
      mint,
      minimumAmount: amount,
    }));
  const destinationTokenAccount =
    options.destinationTokenAccount ??
    (await findTokenAccount({
      fetchFn,
      rpcUrl: options.rpcUrl,
      owner: options.payment.to,
      mint,
    }));

  const latest = await rpc<LatestBlockhashResponse>(
    fetchFn,
    options.rpcUrl,
    "getLatestBlockhash",
    [{ commitment }],
  );
  const message = legacyTransferCheckedMessage({
    payer,
    sourceTokenAccount,
    destinationTokenAccount,
    mint,
    amount,
    decimals: options.decimals ?? 6,
    recentBlockhash: latest.value.blockhash,
  });
  const txSignature = await sendSignedMessage(
    fetchFn,
    options.rpcUrl,
    message,
    seed,
    commitment,
      polls,
  );

  return {
    signature: txSignature,
    from: payer,
    to: options.payment.to,
    mint,
    amount,
    sourceTokenAccount,
    destinationTokenAccount,
  };
}

/** Sign a serialized legacy message, submit it, and wait for confirmation. */
async function sendSignedMessage(
  fetchFn: typeof globalThis.fetch,
  rpcUrl: string,
  message: Uint8Array,
  seed: Uint8Array,
  commitment: string,
  polls: number,
): Promise<string> {
  const signature = ed25519.sign(message, seed);
  const transaction = concatBytes(shortVec(1), signature, message);
  // Preflight simulation runs at "confirmed" regardless of the (possibly
  // stricter) confirmation commitment: a "finalized" preflight would fail to
  // see recently-confirmed funding (e.g. a just-landed airdrop) and reject the
  // send with "no record of a prior credit". Confirmation still waits for the
  // requested commitment below.
  const preflightCommitment =
    commitment === "processed" ? "processed" : "confirmed";
  const txSignature = await rpc<string>(fetchFn, rpcUrl, "sendTransaction", [
    bytesToBase64(transaction),
    { encoding: "base64", preflightCommitment },
  ]);
  await confirmSignature(fetchFn, rpcUrl, txSignature, commitment, polls);
  return txSignature;
}

export async function executeSolanaX402Payment(
  options: SolanaX402PaymentExecutionOptions,
): Promise<SolanaX402PaymentExecution> {
  const execution = await executeSolanaPayment({
    ...options,
    payment: options.payment,
  });
  const payment = await buildX402PaymentMap(options.signer, {
    ...options.payment,
    onChainTx: execution.signature,
    tx: execution.signature,
    transaction: execution.signature,
  });

  return {
    ...execution,
    payment,
  };
}

async function findTokenAccount(options: {
  fetchFn: typeof globalThis.fetch;
  rpcUrl: string;
  owner: string;
  mint: string;
  minimumAmount?: string;
}): Promise<string> {
  const response = await rpc<TokenAccountResponse>(
    options.fetchFn,
    options.rpcUrl,
    "getTokenAccountsByOwner",
    [
      options.owner,
      { mint: options.mint },
      { encoding: "jsonParsed", commitment: "confirmed" },
    ],
  );
  const minimumAmount = options.minimumAmount
    ? BigInt(options.minimumAmount)
    : undefined;
  for (const account of response.value) {
    const amountValue =
      account.account.data.parsed?.info?.tokenAmount?.amount ?? "0";
    if (minimumAmount === undefined || BigInt(amountValue) >= minimumAmount) {
      return account.pubkey;
    }
  }
  throw new Error(`No token account found for ${options.owner}`);
}

async function confirmSignature(
  fetchFn: typeof globalThis.fetch,
  rpcUrl: string,
  signature: string,
  commitment: string,
  polls: number,
): Promise<void> {
  for (let attempt = 0; attempt < polls; attempt += 1) {
    const statuses = await rpc<SignatureStatusesResponse>(
      fetchFn,
      rpcUrl,
      "getSignatureStatuses",
      [[signature], { searchTransactionHistory: true }],
    );
    const status = statuses.value[0];
    if (status?.err) {
      throw new Error(`Solana transaction failed: ${JSON.stringify(status.err)}`);
    }
    if (
      status?.confirmationStatus === commitment ||
      status?.confirmationStatus === "finalized" ||
      (commitment === "processed" && status)
    ) {
      return;
    }
    await sleep(500);
  }
  throw new Error(`Solana transaction was not ${commitment}: ${signature}`);
}

function nativeTransferMessage(options: {
  payer: string;
  to: string;
  amount: string;
  recentBlockhash: string;
}): Uint8Array {
  // accountKeys: [payer (signer, writable), recipient (writable), SystemProgram
  // (readonly)]. Header = 1 required signature, 0 readonly-signed, 1
  // readonly-unsigned (the System program).
  const accountKeys = [options.payer, options.to, SOLANA_SYSTEM_PROGRAM_ID];
  // System "Transfer" instruction: u32 LE discriminant (2) + u64 LE lamports.
  const instructionData = new Uint8Array(12);
  instructionData[0] = 2;
  writeU64Le(instructionData, 4, BigInt(options.amount));
  return concatBytes(
    new Uint8Array([1, 0, 1]),
    shortVec(accountKeys.length),
    ...accountKeys.map((key) => decodeBase58(key)),
    decodeBase58(options.recentBlockhash),
    shortVec(1),
    new Uint8Array([2]),
    shortVec(2),
    new Uint8Array([0, 1]),
    shortVec(instructionData.length),
    instructionData,
  );
}

function legacyTransferCheckedMessage(options: {
  payer: string;
  sourceTokenAccount: string;
  destinationTokenAccount: string;
  mint: string;
  amount: string;
  decimals: number;
  recentBlockhash: string;
}): Uint8Array {
  const accountKeys = [
    options.payer,
    options.sourceTokenAccount,
    options.destinationTokenAccount,
    options.mint,
    SOLANA_TOKEN_PROGRAM_ID,
  ];
  const instructionData = new Uint8Array(10);
  instructionData[0] = 12;
  writeU64Le(instructionData, 1, BigInt(options.amount));
  instructionData[9] = options.decimals;
  return concatBytes(
    new Uint8Array([1, 0, 2]),
    shortVec(accountKeys.length),
    ...accountKeys.map((key) => decodeBase58(key)),
    decodeBase58(options.recentBlockhash),
    shortVec(1),
    new Uint8Array([4]),
    shortVec(4),
    new Uint8Array([1, 3, 2, 0]),
    shortVec(instructionData.length),
    instructionData,
  );
}

async function rpc<T>(
  fetchFn: typeof globalThis.fetch,
  rpcUrl: string,
  method: string,
  params: Array<unknown>,
): Promise<T> {
  const response = await fetchFn(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: method, method, params }),
  });
  if (!response.ok) {
    throw new Error(`Solana RPC ${method} failed with HTTP ${response.status}`);
  }
  const payload = (await response.json()) as JsonRpcResponse<T>;
  if (payload.error) {
    throw new Error(
      `Solana RPC ${method} failed: ${payload.error.message ?? payload.error.code ?? "unknown error"}`,
    );
  }
  if (payload.result === undefined) {
    throw new Error(`Solana RPC ${method} returned no result`);
  }
  return payload.result;
}

function solanaSecretKeyBytes(secretKey: string | Uint8Array): Uint8Array {
  const secretBytes =
    typeof secretKey === "string" ? decodeBase58(secretKey) : secretKey;
  if (secretBytes.length !== 32 && secretBytes.length !== 64) {
    throw new Error(
      `Solana secret key must be 32 or 64 bytes, got ${secretBytes.length}`,
    );
  }
  return secretBytes;
}

function normalizedAmount(amount: string): string {
  const trimmed = amount.trim();
  if (!/^[0-9]+$/.test(trimmed) || BigInt(trimmed) <= 0n) {
    throw new Error(`Solana payment amount must be a positive integer: ${amount}`);
  }
  return trimmed;
}

function writeU64Le(target: Uint8Array, offset: number, value: bigint): void {
  for (let index = 0; index < 8; index += 1) {
    target[offset + index] = Number((value >> BigInt(index * 8)) & 0xffn);
  }
}

function concatBytes(...parts: Array<Uint8Array>): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function shortVec(value: number): Uint8Array {
  const bytes: Array<number> = [];
  let current = value;
  do {
    let byte = current & 0x7f;
    current >>= 7;
    if (current > 0) {
      byte |= 0x80;
    }
    bytes.push(byte);
  } while (current > 0);
  return new Uint8Array(bytes);
}

function decodeBase58(value: string): Uint8Array {
  if (value.length === 0) {
    return new Uint8Array();
  }
  let decoded = 0n;
  for (const char of value) {
    const digit = BASE58_ALPHABET.indexOf(char);
    if (digit === -1) {
      throw new Error(`Invalid base58 character: ${char}`);
    }
    decoded = decoded * 58n + BigInt(digit);
  }
  const bytes: Array<number> = [];
  while (decoded > 0n) {
    bytes.push(Number(decoded & 0xffn));
    decoded >>= 8n;
  }
  bytes.reverse();
  let leadingZeroes = 0;
  for (const char of value) {
    if (char !== "1") break;
    leadingZeroes += 1;
  }
  const result = new Uint8Array(leadingZeroes + bytes.length);
  result.set(bytes, leadingZeroes);
  return result;
}

function encodeBase58(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) + BigInt(byte);
  }
  let encoded = "";
  while (value > 0n) {
    const digit = Number(value % 58n);
    encoded = BASE58_ALPHABET[digit]! + encoded;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = "1" + encoded;
  }
  return encoded || "1";
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index]! ^ right[index]!;
  }
  return diff === 0;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
