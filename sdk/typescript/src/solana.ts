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

/** Default compute unit limit for the facilitator transfer (matches the web app). */
export const FACILITATOR_COMPUTE_UNIT_LIMIT = 40_000;
/** Default compute unit price in microlamports/CU (well under the 5,000,000 cap). */
export const FACILITATOR_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS = "1";

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
 * partially signs it with the agent's keypair — the SDK counterpart to the web
 * app's wallet-signed builder. The transaction is
 * `[SetComputeUnitLimit, SetComputeUnitPrice, TransferChecked]` with the
 * facilitator (CDP/PayAI) as fee payer (account 0) and the agent as the transfer
 * authority (a read-only second signer). Only the agent signature is filled; the
 * fee-payer signature slot is left empty (zeroed) for the facilitator to co-sign
 * and broadcast at settle time. Returns the base64 wire transaction to attach as
 * the x402 payment's `metadata.delegatedTx`.
 *
 * The payee's destination token account must already exist — the exact scheme
 * forbids ATA creation in the payment transaction.
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

  // Sign as the authority (signer index 1). The fee-payer slot (index 0) is left
  // empty for the facilitator to fill at settle time.
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

/**
 * Serializes a two-signer legacy message for the facilitator transfer. Account
 * ordering follows Solana's rules: writable signers, then read-only signers,
 * then writable non-signers, then read-only non-signers. The fee payer must be
 * account 0; the transfer authority is a read-only signer at index 1.
 */
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
  // 0: feePayer (writable signer), 1: authority (read-only signer),
  // 2: source, 3: destination (writable non-signers),
  // 4: mint, 5: token program, 6: compute budget program (read-only non-signers).
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

  // SetComputeUnitLimit: u8 discriminant (2) + u32 LE limit.
  const computeLimitData = new Uint8Array(5);
  computeLimitData[0] = 2;
  writeU32Le(computeLimitData, 1, options.computeUnitLimit);
  // SetComputeUnitPrice: u8 discriminant (3) + u64 LE microlamports.
  const computePriceData = new Uint8Array(9);
  computePriceData[0] = 3;
  writeU64Le(computePriceData, 1, BigInt(options.computeUnitPriceMicroLamports));
  // TransferChecked: u8 discriminant (12) + u64 LE amount + u8 decimals.
  const transferData = new Uint8Array(10);
  transferData[0] = 12;
  writeU64Le(transferData, 1, BigInt(options.amount));
  transferData[9] = options.decimals;

  return concatBytes(
    header,
    shortVec(accountKeys.length),
    ...accountKeys.map((key) => decodeBase58(key)),
    decodeBase58(options.recentBlockhash),
    // Three instructions.
    shortVec(3),
    // ComputeBudget SetComputeUnitLimit (program index 6, no accounts).
    new Uint8Array([6]),
    shortVec(0),
    shortVec(computeLimitData.length),
    computeLimitData,
    // ComputeBudget SetComputeUnitPrice (program index 6, no accounts).
    new Uint8Array([6]),
    shortVec(0),
    shortVec(computePriceData.length),
    computePriceData,
    // Token TransferChecked (program index 5): source, mint, dest, authority.
    new Uint8Array([5]),
    shortVec(4),
    new Uint8Array([2, 4, 3, 1]),
    shortVec(transferData.length),
    transferData,
  );
}

export interface DelegatedX402PaymentMapOptions
  extends Omit<PayerSignedDelegatedTxOptions, "payee" | "amount"> {
  /** The agent identity signer (signs the x402 authorization fields). */
  signer: SigningKey;
  /** The payment requirements parsed from the 402 challenge. */
  payment: Pick<
    X402AuthorizationFields,
    "network" | "asset" | "amount" | "to"
  > & { metadata?: Record<string, string> };
  /** The payer wallet address recorded on the authorization (defaults to the agent id). */
  from?: string;
}

/**
 * Convenience wrapper: builds the agent-signed facilitator transfer and folds it
 * into a complete x402 payment map (with the wire transaction under
 * `metadata.delegatedTx`), ready to resubmit to the paid endpoint. The backend
 * routes any payment carrying `metadata.delegatedTx` to the facilitator.
 */
export async function buildDelegatedX402PaymentMap(
  options: DelegatedX402PaymentMapOptions,
): Promise<X402PaymentMap> {
  const wire = await buildPayerSignedDelegatedTx({
    ...options,
    amount: options.payment.amount,
    payee: options.payment.to,
  });
  return buildX402PaymentMap(options.signer, {
    network: options.payment.network,
    asset: options.payment.asset,
    amount: options.payment.amount,
    to: options.payment.to,
    from: options.from,
    metadata: {
      ...options.payment.metadata,
      delegatedTx: wire,
    },
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
