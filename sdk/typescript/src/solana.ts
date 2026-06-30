import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";

import type { X402AuthorizationFields } from "./x402.js";
import {
  buildX402PaymentMap,
  encodeX402SvmPaymentHeader,
  type X402PaymentMap,
  type X402PaymentMapOptions,
} from "./x402.js";
import type { SigningKey } from "./auth.js";

export const SOLANA_MAINNET_NETWORK =
  "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
export const SOLANA_USDC_MINT =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
/**
 * The CASH stablecoin ($1, 6 decimals) SPL mint. CASH has no fixed mainnet
 * mint baked into the SDK — it is configured per environment (a dev mint
 * locally, the real mint in production), so this constant is empty and callers
 * resolve the mint from configuration (e.g. NEXT_PUBLIC_SOLANA_CASH_MINT).
 */
export const SOLANA_CASH_MINT = "";
/** Decimals of the CASH stablecoin (matches USDC at 6 dp). */
export const SOLANA_CASH_DECIMALS = 6;
export const SOLANA_TOKEN_PROGRAM_ID =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
/** The System program, used to transfer native SOL (lamports). */
export const SOLANA_SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
/** The ComputeBudget program (sets the compute unit limit + price). */
export const SOLANA_COMPUTE_BUDGET_PROGRAM_ID =
  "ComputeBudget111111111111111111111111111111";
/** Default asset symbol that denotes a native SOL (lamports) transfer. */
export const SOLANA_NATIVE_ASSET = "SOL";
/** Decimals of native SOL (1 SOL = 1e9 lamports). */
export const SOLANA_NATIVE_DECIMALS = 9;
/** Mainnet wrapped-SOL (WSOL) SPL mint. */
export const SOLANA_WSOL_MINT =
  "So11111111111111111111111111111111111111112";
/** The SPL Associated Token Account program (derives a wallet's canonical ATA). */
export const SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID =
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
/** The SPL Memo program — the exact-SVM scheme requires a Memo for tx uniqueness. */
export const SOLANA_MEMO_PROGRAM_ID =
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

/**
 * True when `bytes` (a 32-byte candidate address) lies on the ed25519 curve, i.e.
 * is a valid public key. Program-Derived Addresses must be OFF the curve, so this
 * is the rejection test in {@link findProgramAddress}: decoding throws for an
 * off-curve value, which is exactly what we want a PDA to be.
 */
function isOnCurve(bytes: Uint8Array): boolean {
  try {
    ed25519.Point.fromBytes(bytes);
    return true;
  } catch {
    return false;
  }
}

const PDA_MARKER = new TextEncoder().encode("ProgramDerivedAddress");

/**
 * Derive a Program-Derived Address (and bump) from seeds under a program, exactly
 * as Solana's `findProgramAddress` does: hash `seeds || [bump] || programId ||
 * "ProgramDerivedAddress"` for bump 255..0 and return the first off-curve result.
 */
function findProgramAddress(
  seeds: Array<Uint8Array>,
  programId: Uint8Array,
): { address: Uint8Array; bump: number } {
  for (let bump = 255; bump >= 0; bump -= 1) {
    const hash = sha256(
      concatBytes(...seeds, new Uint8Array([bump]), programId, PDA_MARKER),
    );
    if (!isOnCurve(hash)) {
      return { address: hash, bump };
    }
  }
  throw new Error("unable to find a viable program-derived address (no off-curve bump)");
}

/**
 * Derive the canonical Associated Token Account address for `owner` holding
 * `mint` under `tokenProgram` (defaults to the SPL Token program). This matches
 * the destination ATA the x402 exact-SVM facilitator derives from `payTo`+`asset`
 * when verifying, so the client must transfer to exactly this account.
 */
export function deriveAssociatedTokenAddress(
  owner: string,
  mint: string,
  tokenProgram: string = SOLANA_TOKEN_PROGRAM_ID,
): string {
  const { address } = findProgramAddress(
    [decodeBase58(owner), decodeBase58(tokenProgram), decodeBase58(mint)],
    decodeBase58(SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID),
  );
  return encodeBase58(address);
}

/**
 * A Solana settlement asset: its display symbol, on-chain SPL mint (empty for
 * native SOL or an unconfigured CASH mint), and decimals.
 */
export interface SolanaAssetInfo {
  symbol: string;
  mint: string;
  decimals: number;
  native: boolean;
}

// Hardcoded asset table. The x402 challenge now advertises the on-chain SPL
// *mint address* in `asset` (per the exact-scheme spec), not a symbol like
// "USDC", so clients must map between the mint they echo back to the server and
// the symbol they show to users. A `/solana`-backed resolver can replace this
// table later; these mints are stable. CASH has no fixed mainnet mint baked in
// (resolved per environment), so its mint is left empty here.
const SOLANA_ASSETS: ReadonlyArray<SolanaAssetInfo> = [
  { symbol: "SOL", mint: "", decimals: SOLANA_NATIVE_DECIMALS, native: true },
  { symbol: "USDC", mint: SOLANA_USDC_MINT, decimals: 6, native: false },
  {
    symbol: "WSOL",
    mint: SOLANA_WSOL_MINT,
    decimals: SOLANA_NATIVE_DECIMALS,
    native: false,
  },
  {
    symbol: "CASH",
    mint: SOLANA_CASH_MINT,
    decimals: SOLANA_CASH_DECIMALS,
    native: false,
  },
];

const BASE58_MINT_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** True when the value looks like a base58 SPL mint address (not a symbol). */
export function isLikelyMintAddress(value: string): boolean {
  return BASE58_MINT_PATTERN.test(value.trim());
}

/**
 * Resolves an x402 `asset` value — either a symbol ("USDC") or an on-chain SPL
 * mint address (what the 402 challenge now advertises) — to its asset info,
 * case-insensitively. An unknown but base58-shaped value is treated as a bare
 * mint (decimals default to 6) so a payment can still settle. Returns undefined
 * for an empty value or an unknown non-address symbol.
 */
export function resolveSolanaAsset(
  value: string | undefined,
): SolanaAssetInfo | undefined {
  const raw = (value ?? "").trim();
  if (raw === "") {
    return undefined;
  }
  const upper = raw.toUpperCase();
  for (const asset of SOLANA_ASSETS) {
    if (asset.symbol === upper) {
      return asset;
    }
    if (asset.mint && asset.mint.toLowerCase() === raw.toLowerCase()) {
      return asset;
    }
  }
  if (isLikelyMintAddress(raw)) {
    return { symbol: raw, mint: raw, decimals: 6, native: false };
  }
  return undefined;
}

/**
 * Friendly display symbol for an x402 `asset` (symbol or mint address). Echoes
 * the trimmed input back when it matches no known asset.
 */
export function solanaAssetSymbol(value: string | undefined): string {
  return resolveSolanaAsset(value)?.symbol ?? (value ?? "").trim();
}

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
  const assetValue = (options.payment.asset ?? "").trim();
  const isNative = assetValue.toUpperCase() === nativeAsset;
  // Resolve the SPL mint + decimals from the challenge asset, which now carries
  // the mint address directly. An explicit `mint`/`decimals` option still wins
  // (e.g. a devnet override). Native SOL needs no mint.
  const resolved = isNative ? undefined : resolveSolanaAsset(assetValue);
  const mint = options.mint ?? resolved?.mint ?? "";
  const decimals = options.decimals ?? resolved?.decimals ?? 6;
  if (!isNative && !mint) {
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
  // happen before fetching the blockhash to match the historical RPC order. The
  // mint + decimals were resolved from the challenge asset above.
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
    decimals,
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

/**
 * Fetch a recent blockhash (base58) to anchor a transaction to. Used when
 * building an x402 exact-SVM payment the facilitator (not the client) broadcasts.
 */
export async function getRecentBlockhash(
  rpcUrl: string,
  options?: {
    commitment?: "processed" | "confirmed" | "finalized";
    fetch?: typeof globalThis.fetch;
  },
): Promise<string> {
  const fetchFn = options?.fetch ?? globalThis.fetch;
  const latest = await rpc<LatestBlockhashResponse>(
    fetchFn,
    rpcUrl,
    "getLatestBlockhash",
    [{ commitment: options?.commitment ?? "confirmed" }],
  );
  return latest.value.blockhash;
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

/** Default compute unit limit for the facilitator transfer (matches the web app). */
export const FACILITATOR_COMPUTE_UNIT_LIMIT = 40_000;
/** Default compute unit price in microlamports/CU (well under the 5,000,000 cap). */
export const FACILITATOR_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS = "1";

/** Inputs to {@link buildExactSvmTransferTransaction}. */
export interface ExactSvmTransferOptions {
  /** The payer's Solana secret key (32-byte seed or 64-byte keypair). */
  secretKey: string | Uint8Array;
  /** The facilitator/sponsor fee payer (base58), from the challenge `extra.feePayer`. */
  feePayer: string;
  /** The recipient wallet (base58), from the challenge `payTo`. */
  payTo: string;
  /** The SPL mint (base58), from the challenge `asset`. */
  mint: string;
  /** The exact transfer amount in the mint's smallest unit (decimal string). */
  amount: string;
  /** The mint's decimals (USDC/CASH = 6). */
  decimals: number;
  /** A recent blockhash (base58) the transaction is anchored to. */
  recentBlockhash: string;
  /**
   * The Memo instruction data the exact-SVM scheme requires for tx uniqueness:
   * the challenge `extra.memo` when present, else a random ≥16-byte hex nonce is
   * generated. The facilitator rejects a transfer whose memo doesn't match a
   * server-supplied `extra.memo`.
   */
  memo?: string;
  /** Override the payer's source token account (defaults to its derived ATA). */
  sourceTokenAccount?: string;
  /** Compute unit limit (defaults to {@link FACILITATOR_COMPUTE_UNIT_LIMIT}). */
  computeUnitLimit?: number;
  /** Compute unit price, microlamports/CU (defaults to the facilitator constant). */
  computeUnitPriceMicroLamports?: string;
}

/** Result of {@link buildExactSvmTransferTransaction}. */
export interface ExactSvmTransfer {
  /** Base64 of the partially-signed (payer-only) versioned-legacy transaction. */
  transaction: string;
  /** The payer (authority) wallet, base58. */
  from: string;
  /** The derived source token account (payer's ATA unless overridden). */
  sourceTokenAccount: string;
  /** The derived destination ATA (payTo + mint). */
  destinationTokenAccount: string;
  /** The Memo string actually embedded (echoed `extra.memo` or generated nonce). */
  memo: string;
}

/**
 * Build the x402 `exact` payment transaction for Solana (SVM), per
 * `specs/schemes/exact/scheme_exact_svm.md`: a legacy transaction with the static
 * fast-path instruction layout `[SetComputeUnitLimit, SetComputeUnitPrice,
 * TransferChecked, Memo]`, fee payer = the facilitator's `extra.feePayer` (account
 * index 0, left UNSIGNED for the facilitator to co-sign), and the payer signing
 * only as the transfer authority. The destination is the ATA derived from
 * `payTo`+`mint` (what the facilitator verifies); the transfer amount equals the
 * required amount exactly.
 *
 * The returned base64 transaction goes into the x402 `PaymentPayload`'s
 * `payload.transaction`; the client does NOT broadcast it — the facilitator
 * co-signs as fee payer and submits it.
 */
export function buildExactSvmTransferTransaction(
  options: ExactSvmTransferOptions,
): ExactSvmTransfer {
  const amount = normalizedAmount(options.amount);
  const secretKey = solanaSecretKeyBytes(options.secretKey);
  const seed = secretKey.slice(0, 32);
  const authorityKey = ed25519.getPublicKey(seed);
  if (secretKey.length === 64 && !bytesEqual(authorityKey, secretKey.slice(32))) {
    throw new Error("Solana secret key public key does not match seed");
  }
  const authority = encodeBase58(authorityKey);

  if (authority === options.feePayer) {
    // Fee-payer isolation: the sponsor must not be the transfer authority/source.
    throw new Error(
      "x402 exact-SVM: fee payer must differ from the paying authority",
    );
  }

  const sourceTokenAccount =
    options.sourceTokenAccount ??
    deriveAssociatedTokenAddress(authority, options.mint);
  const destinationTokenAccount = deriveAssociatedTokenAddress(
    options.payTo,
    options.mint,
  );
  const memo = options.memo?.trim() ? options.memo : randomMemoNonce();

  // Account layout (signers first, then writable non-signers, then readonly
  // non-signers). The fee payer MUST be index 0; the authority is a readonly
  // signer; the token accounts are writable non-signers; mint + programs are
  // readonly non-signers.
  const accountKeys = [
    options.feePayer, //          0: writable signer (fee payer)
    authority, //                 1: readonly signer (transfer authority)
    sourceTokenAccount, //        2: writable non-signer
    destinationTokenAccount, //   3: writable non-signer
    options.mint, //              4: readonly non-signer
    SOLANA_TOKEN_PROGRAM_ID, //   5: readonly non-signer
    SOLANA_COMPUTE_BUDGET_PROGRAM_ID, // 6: readonly non-signer
    SOLANA_MEMO_PROGRAM_ID, //    7: readonly non-signer
  ];
  // header: 2 required signatures, 1 readonly signed (authority), 4 readonly
  // unsigned (mint, token, compute-budget, memo programs).
  const header = new Uint8Array([2, 1, 4]);

  const computeLimitData = new Uint8Array(5);
  computeLimitData[0] = 2; // SetComputeUnitLimit discriminator
  writeU32Le(
    computeLimitData,
    1,
    options.computeUnitLimit ?? FACILITATOR_COMPUTE_UNIT_LIMIT,
  );
  const computePriceData = new Uint8Array(9);
  computePriceData[0] = 3; // SetComputeUnitPrice discriminator
  writeU64Le(
    computePriceData,
    1,
    BigInt(
      options.computeUnitPriceMicroLamports ??
        FACILITATOR_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS,
    ),
  );
  const transferData = new Uint8Array(10);
  transferData[0] = 12; // TransferChecked discriminator
  writeU64Le(transferData, 1, BigInt(amount));
  transferData[9] = options.decimals;
  const memoData = new TextEncoder().encode(memo);

  const message = concatBytes(
    header,
    shortVec(accountKeys.length),
    ...accountKeys.map((key) => decodeBase58(key)),
    decodeBase58(options.recentBlockhash),
    shortVec(4),
    // SetComputeUnitLimit (program 6, no accounts)
    encodeInstruction(6, [], computeLimitData),
    // SetComputeUnitPrice (program 6, no accounts)
    encodeInstruction(6, [], computePriceData),
    // TransferChecked (program 5): source, mint, destination, authority
    encodeInstruction(5, [2, 4, 3, 1], transferData),
    // Memo (program 7, no accounts)
    encodeInstruction(7, [], memoData),
  );

  // Sign only as the authority (signatures[1]); leave the fee payer slot
  // (signatures[0]) zeroed for the facilitator to fill before broadcasting.
  const authoritySignature = ed25519.sign(message, seed);
  const emptyFeePayerSignature = new Uint8Array(64);
  const transaction = concatBytes(
    shortVec(2),
    emptyFeePayerSignature,
    authoritySignature,
    message,
  );

  return {
    transaction: bytesToBase64(transaction),
    from: authority,
    sourceTokenAccount,
    destinationTokenAccount,
    memo,
  };
}

/** Encode one compiled instruction: programIdIndex, account indexes, data. */
function encodeInstruction(
  programIdIndex: number,
  accountIndexes: Array<number>,
  data: Uint8Array,
): Uint8Array {
  return concatBytes(
    new Uint8Array([programIdIndex]),
    shortVec(accountIndexes.length),
    new Uint8Array(accountIndexes),
    shortVec(data.length),
    data,
  );
}

/** A random ≥16-byte hex memo nonce (the exact-SVM uniqueness requirement). */
function randomMemoNonce(): string {
  const random = new Uint8Array(16);
  globalThis.crypto.getRandomValues(random);
  return Array.from(random)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface PayerSignedDelegatedTxOptions {
  rpcUrl: string;
  /** The facilitator's fee-payer pubkey (from the 402 challenge `metadata.feePayer`). */
  feePayer: string;
  /** The payee/recipient owner address (the challenge `to` / `payTo`). */
  payee: string;
  /** Amount in the asset's base units. */
  amount: string;
  /** The SPL mint to transfer. */
  mint: string;
  /** Token decimals (USDC/CASH = 6). */
  decimals: number;
  /** The agent's Solana secret key (32-byte seed or 64-byte key); signs as the transfer authority. */
  secretKey: string | Uint8Array;
  /** Overrides the payer's source token account (defaults to an RPC lookup of the agent's ATA). */
  sourceTokenAccount?: string;
  /** Overrides the payee's destination token account (defaults to an RPC lookup). */
  destinationTokenAccount?: string;
  computeUnitLimit?: number;
  computeUnitPriceMicroLamports?: string;
  fetch?: typeof globalThis.fetch;
}

/**
 * Builds a standard x402 "exact" Solana payment for an autonomous agent and
 * partially signs it with the agent's keypair. This legacy helper preserves the
 * pre-memo delegated transfer shape used by the gasless registration/bounty
 * flows: `[SetComputeUnitLimit, SetComputeUnitPrice, TransferChecked]`, with the
 * facilitator as fee payer and the agent as transfer authority.
 */
export async function buildPayerSignedDelegatedTx(
  options: PayerSignedDelegatedTxOptions,
): Promise<string> {
  const secretKey = solanaSecretKeyBytes(options.secretKey);
  const seed = secretKey.slice(0, 32);
  const publicKey = ed25519.getPublicKey(seed);
  if (secretKey.length === 64 && !bytesEqual(publicKey, secretKey.slice(32))) {
    throw new Error("Solana secret key public key does not match seed");
  }
  const payer = encodeBase58(publicKey);
  const amount = normalizedAmount(options.amount);
  const fetchFn = options.fetch ?? globalThis.fetch;

  const sourceTokenAccount =
    options.sourceTokenAccount ??
    (await findTokenAccount({
      fetchFn,
      rpcUrl: options.rpcUrl,
      owner: payer,
      mint: options.mint,
      minimumAmount: amount,
    }));
  const destinationTokenAccount =
    options.destinationTokenAccount ??
    (await findTokenAccount({
      fetchFn,
      rpcUrl: options.rpcUrl,
      owner: options.payee,
      mint: options.mint,
    }));

  const latest = await rpc<LatestBlockhashResponse>(
    fetchFn,
    options.rpcUrl,
    "getLatestBlockhash",
    [{ commitment: "confirmed" }],
  );

  const message = twoSignerFacilitatorMessage({
    feePayer: options.feePayer,
    authority: payer,
    sourceTokenAccount,
    destinationTokenAccount,
    mint: options.mint,
    amount,
    decimals: options.decimals,
    computeUnitLimit: options.computeUnitLimit ?? FACILITATOR_COMPUTE_UNIT_LIMIT,
    computeUnitPriceMicroLamports:
      options.computeUnitPriceMicroLamports ??
      FACILITATOR_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS,
    recentBlockhash: latest.value.blockhash,
  });

  const authoritySignature = ed25519.sign(message, seed);
  const emptyFeePayerSignature = new Uint8Array(64);
  const wire = concatBytes(
    shortVec(2),
    emptyFeePayerSignature,
    authoritySignature,
    message,
  );
  return bytesToBase64(wire);
}

function twoSignerFacilitatorMessage(options: {
  feePayer: string;
  authority: string;
  sourceTokenAccount: string;
  destinationTokenAccount: string;
  mint: string;
  amount: string;
  decimals: number;
  computeUnitLimit: number;
  computeUnitPriceMicroLamports: string;
  recentBlockhash: string;
}): Uint8Array {
  const accountKeys = [
    options.feePayer,
    options.authority,
    options.sourceTokenAccount,
    options.destinationTokenAccount,
    options.mint,
    SOLANA_TOKEN_PROGRAM_ID,
    SOLANA_COMPUTE_BUDGET_PROGRAM_ID,
  ];
  const header = new Uint8Array([2, 1, 3]);

  const computeLimitData = new Uint8Array(5);
  computeLimitData[0] = 2;
  writeU32Le(computeLimitData, 1, options.computeUnitLimit);
  const computePriceData = new Uint8Array(9);
  computePriceData[0] = 3;
  writeU64Le(computePriceData, 1, BigInt(options.computeUnitPriceMicroLamports));
  const transferData = new Uint8Array(10);
  transferData[0] = 12;
  writeU64Le(transferData, 1, BigInt(options.amount));
  transferData[9] = options.decimals;

  return concatBytes(
    header,
    shortVec(accountKeys.length),
    ...accountKeys.map((key) => decodeBase58(key)),
    decodeBase58(options.recentBlockhash),
    shortVec(3),
    encodeInstruction(6, [], computeLimitData),
    encodeInstruction(6, [], computePriceData),
    encodeInstruction(5, [2, 4, 3, 1], transferData),
  );
}

export interface DelegatedX402PaymentHeaderOptions
  extends Omit<PayerSignedDelegatedTxOptions, "payee" | "amount" | "feePayer"> {
  /** The payment requirements parsed from the 402 challenge. */
  payment: Pick<
    X402AuthorizationFields,
    "network" | "asset" | "amount" | "to"
  > & { metadata?: Record<string, string> };
  /**
   * The facilitator's fee-payer pubkey. Defaults to the challenge's
   * `payment.metadata.feePayer` (equivalently `accepts[].extra.feePayer`).
   */
  feePayer?: string;
}

/**
 * Builds the agent-signed facilitator transfer and encodes it into the standard
 * x402 v2 SVM "exact" `PAYMENT-SIGNATURE` header value (the partially-signed
 * transaction in `payload.transaction`, the fee payer in
 * `accepted.extra.feePayer`). Replaces the proprietary `metadata.delegatedTx`
 * payment map — the sponsored register/bounty flows attach this header and send
 * NO `payment` field in the request body. The `asset` echoed in the envelope is
 * the on-chain SPL mint used to build the transaction.
 */
export async function buildDelegatedX402PaymentHeader(
  options: DelegatedX402PaymentHeaderOptions,
): Promise<string> {
  const feePayer = options.feePayer ?? options.payment.metadata?.["feePayer"];
  if (!feePayer) {
    throw new Error(
      "delegated payment requires a facilitator fee payer (challenge metadata.feePayer)",
    );
  }
  const wire = await buildPayerSignedDelegatedTx({
    ...options,
    feePayer,
    amount: options.payment.amount,
    payee: options.payment.to,
  });
  return encodeX402SvmPaymentHeader({
    network: options.payment.network,
    amount: options.payment.amount,
    assetMint: options.mint,
    payTo: options.payment.to,
    feePayer,
    transaction: wire,
  });
}

function writeU32Le(target: Uint8Array, offset: number, value: number): void {
  for (let index = 0; index < 4; index += 1) {
    target[offset + index] = (value >>> (index * 8)) & 0xff;
  }
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
