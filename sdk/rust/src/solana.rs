//! Delegated (gasless facilitator) x402 Solana settlement. Mirrors
//! `sdk/typescript/src/solana.ts` (`buildPayerSignedDelegatedTx` /
//! `buildDelegatedX402PaymentMap`).
//!
//! The Rust SDK does not depend on the heavy `solana-sdk` crate; the legacy
//! transaction wire format (shortvec length prefixes, message header, account
//! keys, blockhash, compiled instructions) is hand-rolled here, reusing the
//! Ed25519 signer, `bs58`, and `sha2` already pulled in for auth. The backend
//! decodes these legacy transactions by hand too.
//!
//! The "delegated" transaction is the standard x402 *exact*-scheme Solana
//! payment: instructions `[SetComputeUnitLimit, SetComputeUnitPrice,
//! TransferChecked]`, account 0 (the fee payer) is the **facilitator** (CDP /
//! PayAI) and the **payer** signs only as the SPL `TransferChecked` authority
//! (a read-only second signer). The fee-payer signature slot is left zeroed for
//! the backend to co-sign and broadcast at settle time — the agent never pays
//! the network fee. Only USDC/CASH-style SPL transfers go through this path.

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use base64::Engine as _;
use ed25519_dalek::{Signer as _, SigningKey as DalekSigningKey};
use serde_json::json;

use crate::crypto::{decode_base58, to_base64};
use crate::error::{Error, PaymentChallenge, Result};
use crate::x402::X402_PAYMENT_HEADER;

/// Canonical mainnet Solana network id (the `solana:<genesis>` form).
pub const SOLANA_MAINNET_NETWORK: &str = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
/// Mainnet USDC SPL mint.
pub const SOLANA_USDC_MINT: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
/// The SPL Token program.
pub const SOLANA_TOKEN_PROGRAM_ID: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
/// The System program (native SOL transfers).
pub const SOLANA_SYSTEM_PROGRAM_ID: &str = "11111111111111111111111111111111";
/// The ComputeBudget program (sets the compute unit limit + price).
pub const SOLANA_COMPUTE_BUDGET_PROGRAM_ID: &str = "ComputeBudget111111111111111111111111111111";
/// The Associated Token Account program (deterministic ATA derivation).
pub const SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID: &str = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
/// The SPL Memo program.
pub const SOLANA_MEMO_PROGRAM_ID: &str = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

/// Default compute unit limit for the facilitator transfer (matches the web app).
pub const FACILITATOR_COMPUTE_UNIT_LIMIT: u32 = 40_000;
/// Default compute unit price in microlamports/CU (well under the 5,000,000 cap).
pub const FACILITATOR_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS: u64 = 1;

/// An async JSON-RPC callback: `(method, params) -> result`. Lets callers route
/// blockhash + token-account lookups through their own transport (e.g. the
/// backend's `/solana/rpc` proxy). [`default_rpc_request`] provides a direct
/// reqwest-backed implementation against a Solana RPC URL.
pub type RpcRequest = Arc<
    dyn Fn(
            String,
            serde_json::Value,
        ) -> Pin<Box<dyn Future<Output = Result<serde_json::Value>> + Send>>
        + Send
        + Sync,
>;

/// Options for [`build_payer_signed_delegated_tx`].
pub struct PayerSignedDelegatedTxOptions {
    /// The facilitator's fee-payer pubkey (the 402 challenge `metadata.feePayer`).
    pub fee_payer: String,
    /// The payee/recipient owner address (the challenge `to` / `payTo`).
    pub payee: String,
    /// Amount in the asset's base units (a positive integer string).
    pub amount: String,
    /// The SPL mint to transfer.
    pub mint: String,
    /// Token decimals (USDC/CASH = 6).
    pub decimals: u8,
    /// The agent's Solana secret key (32-byte seed or 64-byte key); signs as the
    /// transfer authority.
    pub secret_key: Vec<u8>,
    /// Overrides the payer's source token account (defaults to the agent's ATA).
    pub source_token_account: Option<String>,
    /// Overrides the payee's destination token account (defaults to its ATA).
    pub destination_token_account: Option<String>,
    /// Override the compute unit limit (defaults to [`FACILITATOR_COMPUTE_UNIT_LIMIT`]).
    pub compute_unit_limit: Option<u32>,
    /// Override the compute unit price (defaults to
    /// [`FACILITATOR_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS`]).
    pub compute_unit_price_micro_lamports: Option<u64>,
    /// A recent blockhash. When `None` it is fetched via `rpc`.
    pub recent_blockhash: Option<String>,
    /// JSON-RPC transport for blockhash + ATA lookups. Required unless
    /// `recent_blockhash` and both token accounts are supplied.
    pub rpc: Option<RpcRequest>,
}

/// Builds the standard x402 "exact" Solana payment for an autonomous agent and
/// partially signs it with the agent's keypair — the SDK counterpart to the web
/// app's wallet-signed builder. The transaction is
/// `[SetComputeUnitLimit, SetComputeUnitPrice, TransferChecked]` with the
/// facilitator as fee payer (account 0) and the agent as the transfer authority
/// (a read-only second signer). Only the agent signature is filled; the
/// fee-payer signature slot is left zeroed for the facilitator to co-sign and
/// broadcast at settle time. Returns the base64 wire transaction to carry in the
/// standard x402 `PaymentPayload` envelope's `payload.transaction`.
///
/// The payee's destination token account must already exist — the exact scheme
/// forbids ATA creation in the payment transaction.
pub async fn build_payer_signed_delegated_tx(
    options: PayerSignedDelegatedTxOptions,
) -> Result<String> {
    let signing_key = signing_key_from_secret(&options.secret_key)?;
    let payer = bs58::encode(signing_key.verifying_key().to_bytes()).into_string();
    let amount = normalized_amount(&options.amount)?;

    let source_token_account = match options.source_token_account.clone() {
        Some(account) => account,
        None => associated_token_account(&payer, &options.mint)?,
    };
    let destination_token_account = match options.destination_token_account.clone() {
        Some(account) => account,
        None => associated_token_account(&options.payee, &options.mint)?,
    };

    let recent_blockhash = match options.recent_blockhash.clone() {
        Some(blockhash) => blockhash,
        None => {
            let rpc = options.rpc.clone().ok_or_else(|| {
                Error::InvalidArgument(
                    "a recent_blockhash or rpc transport is required".to_string(),
                )
            })?;
            fetch_latest_blockhash(&rpc).await?
        }
    };

    let message = two_signer_facilitator_message(&FacilitatorMessage {
        fee_payer: &options.fee_payer,
        authority: &payer,
        source_token_account: &source_token_account,
        destination_token_account: &destination_token_account,
        mint: &options.mint,
        amount,
        decimals: options.decimals,
        compute_unit_limit: options
            .compute_unit_limit
            .unwrap_or(FACILITATOR_COMPUTE_UNIT_LIMIT),
        compute_unit_price_micro_lamports: options
            .compute_unit_price_micro_lamports
            .unwrap_or(FACILITATOR_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS),
        recent_blockhash: &recent_blockhash,
        memo: "",
    })?;

    // Sign as the authority (signer index 1). The fee-payer slot (index 0) is
    // left zeroed for the facilitator to fill at settle time.
    let authority_signature = signing_key.sign(&message).to_bytes();
    let mut wire = Vec::with_capacity(2 + 64 + 64 + message.len());
    wire.extend_from_slice(&short_vec(2));
    wire.extend_from_slice(&[0u8; 64]); // empty fee-payer signature
    wire.extend_from_slice(&authority_signature);
    wire.extend_from_slice(&message);
    Ok(to_base64(&wire))
}

/// Build the standard x402 `PaymentPayload` envelope (`x402Version` 2) for a
/// sponsored SPL transfer. The partially-signed transaction travels in
/// `payload.transaction`; the fee payer is advertised in `accepted.extra.feePayer`.
/// `asset` is the on-chain SPL mint (base58), not a symbol.
pub fn build_delegated_x402_envelope(
    network: &str,
    amount: &str,
    asset_mint: &str,
    pay_to: &str,
    fee_payer: &str,
    transaction: &str,
) -> serde_json::Value {
    json!({
        "x402Version": 2,
        "accepted": {
            "scheme": "exact",
            "network": network,
            "amount": amount,
            "asset": asset_mint,
            "payTo": pay_to,
            "maxTimeoutSeconds": 60,
            "extra": { "feePayer": fee_payer },
        },
        "payload": { "transaction": transaction },
    })
}

/// Encode a standard x402 `PaymentPayload` envelope as the
/// [`X402_PAYMENT_HEADER`] (`PAYMENT-SIGNATURE`) header value: standard base64
/// (with padding) of the UTF-8 JSON.
pub fn encode_delegated_x402_payment_header(envelope: &serde_json::Value) -> String {
    let raw = serde_json::to_vec(envelope).expect("envelope serialization cannot fail");
    base64::engine::general_purpose::STANDARD.encode(raw)
}

/// Options for [`build_delegated_x402_payment_header`].
pub struct DelegatedX402PaymentHeaderOptions {
    /// The facilitator's fee-payer pubkey (the 402 challenge `metadata.feePayer`).
    pub fee_payer: String,
    /// The SPL mint to transfer.
    pub mint: String,
    /// Token decimals (USDC/CASH = 6).
    pub decimals: u8,
    /// The agent's Solana secret key (32-byte seed or 64-byte key).
    pub secret_key: Vec<u8>,
    pub source_token_account: Option<String>,
    pub destination_token_account: Option<String>,
    pub compute_unit_limit: Option<u32>,
    pub compute_unit_price_micro_lamports: Option<u64>,
    pub recent_blockhash: Option<String>,
    pub rpc: Option<RpcRequest>,
    /// The x402 network id (`solana:<genesis>`).
    pub network: String,
    /// The SPL mint advertised as the envelope `asset` (defaults to `mint`).
    pub asset: Option<String>,
    /// Amount in base units (string).
    pub amount: String,
    /// The recipient (`payTo`).
    pub to: String,
}

/// Convenience wrapper: builds the agent-signed facilitator transfer and folds
/// it into the standard x402 `PaymentPayload` envelope, returning the
/// `(header_name, header_value)` pair to attach to the paid endpoint POST. The
/// backend reads the standard `PAYMENT-SIGNATURE` header and routes the
/// transaction to the facilitator; no body `payment` map is sent.
pub async fn build_delegated_x402_payment_header(
    options: DelegatedX402PaymentHeaderOptions,
) -> Result<(String, String)> {
    let transaction = build_payer_signed_delegated_tx(PayerSignedDelegatedTxOptions {
        fee_payer: options.fee_payer.clone(),
        payee: options.to.clone(),
        amount: options.amount.clone(),
        mint: options.mint.clone(),
        decimals: options.decimals,
        secret_key: options.secret_key,
        source_token_account: options.source_token_account,
        destination_token_account: options.destination_token_account,
        compute_unit_limit: options.compute_unit_limit,
        compute_unit_price_micro_lamports: options.compute_unit_price_micro_lamports,
        recent_blockhash: options.recent_blockhash,
        rpc: options.rpc,
    })
    .await?;

    let asset = options.asset.unwrap_or_else(|| options.mint.clone());
    let envelope = build_delegated_x402_envelope(
        &options.network,
        &options.amount,
        &asset,
        &options.to,
        &options.fee_payer,
        &transaction,
    );
    Ok((
        X402_PAYMENT_HEADER.to_string(),
        encode_delegated_x402_payment_header(&envelope),
    ))
}

/// A direct reqwest-backed [`RpcRequest`] against a Solana JSON-RPC URL. Mirrors
/// the TS/Python SDK's built-in transport.
pub fn default_rpc_request(rpc_url: impl Into<String>) -> RpcRequest {
    let rpc_url = rpc_url.into();
    let client = reqwest::Client::new();
    Arc::new(move |method: String, params: serde_json::Value| {
        let rpc_url = rpc_url.clone();
        let client = client.clone();
        Box::pin(async move {
            let body = json!({
                "jsonrpc": "2.0",
                "id": method,
                "method": method,
                "params": params,
            });
            let response = client.post(&rpc_url).json(&body).send().await?;
            if !response.status().is_success() {
                return Err(Error::Rpc(format!(
                    "Solana RPC {method} failed with HTTP {}",
                    response.status().as_u16()
                )));
            }
            let payload: serde_json::Value = response.json().await?;
            if let Some(error) = payload.get("error") {
                let message = error
                    .get("message")
                    .and_then(|m| m.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| error.to_string());
                return Err(Error::Rpc(format!("Solana RPC {method} failed: {message}")));
            }
            payload
                .get("result")
                .cloned()
                .ok_or_else(|| Error::Rpc(format!("Solana RPC {method} returned no result")))
        }) as Pin<Box<dyn Future<Output = Result<serde_json::Value>> + Send>>
    })
}

/// Resolve `owner`'s token account for `mint` over the RPC transport, returning
/// the first account holding at least `minimum_amount` (when set). Mirrors the
/// TS/Python `findTokenAccount`. The delegated builder uses the deterministic
/// ATA instead, but this is exported for callers that need an existing account.
pub async fn find_token_account(
    rpc: &RpcRequest,
    owner: &str,
    mint: &str,
    minimum_amount: Option<&str>,
) -> Result<String> {
    let params = json!([
        owner,
        { "mint": mint },
        { "encoding": "jsonParsed", "commitment": "confirmed" },
    ]);
    let result = rpc("getTokenAccountsByOwner".to_string(), params).await?;
    let minimum: Option<u128> = minimum_amount.and_then(|m| m.parse().ok());
    let accounts = result
        .get("value")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    for account in accounts {
        let amount = account
            .pointer("/account/data/parsed/info/tokenAmount/amount")
            .and_then(|v| v.as_str())
            .unwrap_or("0")
            .parse::<u128>()
            .unwrap_or(0);
        if minimum.is_none_or(|min| amount >= min) {
            if let Some(pubkey) = account.get("pubkey").and_then(|v| v.as_str()) {
                return Ok(pubkey.to_string());
            }
        }
    }
    Err(Error::Rpc(format!("No token account found for {owner}")))
}

async fn fetch_latest_blockhash(rpc: &RpcRequest) -> Result<String> {
    let params = json!([{ "commitment": "confirmed" }]);
    let result = rpc("getLatestBlockhash".to_string(), params).await?;
    result
        .pointer("/value/blockhash")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| Error::Rpc("getLatestBlockhash returned no blockhash".to_string()))
}

/// Derive the associated token account (ATA) for `owner` + `mint` under the
/// SPL Associated Token program, by `find_program_address` over the seeds
/// `[owner, TOKEN_PROGRAM, mint]`.
pub fn associated_token_account(owner: &str, mint: &str) -> Result<String> {
    let owner_bytes = decode_pubkey(owner)?;
    let token_program = decode_pubkey(SOLANA_TOKEN_PROGRAM_ID)?;
    let mint_bytes = decode_pubkey(mint)?;
    let program = decode_pubkey(SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID)?;
    let seeds = [
        owner_bytes.as_slice(),
        token_program.as_slice(),
        mint_bytes.as_slice(),
    ];
    let (address, _bump) = find_program_address(&seeds, &program)?;
    Ok(bs58::encode(address).into_string())
}

/// Find a valid program-derived address (PDA) for `seeds` under `program_id`,
/// returning `(address, bump)`. Hand-rolled to avoid the `solana-sdk` crate.
fn find_program_address(seeds: &[&[u8]], program_id: &[u8; 32]) -> Result<([u8; 32], u8)> {
    use sha2::{Digest, Sha256};
    for bump in (0u8..=255).rev() {
        let mut hasher = Sha256::new();
        for seed in seeds {
            hasher.update(seed);
        }
        hasher.update([bump]);
        hasher.update(program_id);
        hasher.update(b"ProgramDerivedAddress");
        let hash: [u8; 32] = hasher.finalize().into();
        if !is_on_curve(&hash) {
            return Ok((hash, bump));
        }
    }
    Err(Error::InvalidArgument(
        "unable to find a program-derived address (no off-curve bump)".to_string(),
    ))
}

/// True when `bytes` is a valid Ed25519 curve point (i.e. NOT a valid PDA). A
/// PDA must be off-curve. Uses `curve25519-dalek` (already a dependency).
fn is_on_curve(bytes: &[u8; 32]) -> bool {
    curve25519_dalek::edwards::CompressedEdwardsY(*bytes)
        .decompress()
        .is_some()
}

struct FacilitatorMessage<'a> {
    fee_payer: &'a str,
    authority: &'a str,
    source_token_account: &'a str,
    destination_token_account: &'a str,
    mint: &'a str,
    amount: u64,
    decimals: u8,
    compute_unit_limit: u32,
    compute_unit_price_micro_lamports: u64,
    recent_blockhash: &'a str,
    /// SPL Memo embedded for tx uniqueness. The exact-SVM scheme requires it (the
    /// facilitator rejects a transfer whose memo doesn't match the server-supplied
    /// `extra.memo`). An empty string emits no Memo instruction.
    memo: &'a str,
}

/// Serialize a two-signer legacy message for the facilitator transfer. Account
/// ordering follows Solana's rules: writable signers, then read-only signers,
/// then writable non-signers, then read-only non-signers. The fee payer must be
/// account 0; the transfer authority is a read-only signer at index 1.
fn two_signer_facilitator_message(options: &FacilitatorMessage<'_>) -> Result<Vec<u8>> {
    let has_memo = !options.memo.is_empty();
    // 0: feePayer (writable signer), 1: authority (read-only signer),
    // 2: source, 3: destination (writable non-signers),
    // 4: mint, 5: token program, 6: compute budget program[, 7: memo program]
    // (read-only non-signers).
    let mut account_keys = vec![
        options.fee_payer,
        options.authority,
        options.source_token_account,
        options.destination_token_account,
        options.mint,
        SOLANA_TOKEN_PROGRAM_ID,
        SOLANA_COMPUTE_BUDGET_PROGRAM_ID,
    ];
    if has_memo {
        account_keys.push(SOLANA_MEMO_PROGRAM_ID);
    }
    // 2 required signatures; the authority is the lone read-only SIGNED account;
    // the trailing mint + program keys are read-only unsigned (3, or 4 with memo).
    let header = [2u8, 1u8, if has_memo { 4u8 } else { 3u8 }];

    // SetComputeUnitLimit: u8 discriminant (2) + u32 LE limit.
    let mut compute_limit_data = Vec::with_capacity(5);
    compute_limit_data.push(2u8);
    compute_limit_data.extend_from_slice(&options.compute_unit_limit.to_le_bytes());
    // SetComputeUnitPrice: u8 discriminant (3) + u64 LE microlamports.
    let mut compute_price_data = Vec::with_capacity(9);
    compute_price_data.push(3u8);
    compute_price_data.extend_from_slice(&options.compute_unit_price_micro_lamports.to_le_bytes());
    // TransferChecked: u8 discriminant (12) + u64 LE amount + u8 decimals.
    let mut transfer_data = Vec::with_capacity(10);
    transfer_data.push(12u8);
    transfer_data.extend_from_slice(&options.amount.to_le_bytes());
    transfer_data.push(options.decimals);

    let blockhash = decode_blockhash(options.recent_blockhash)?;

    let mut message = Vec::new();
    message.extend_from_slice(&header);
    message.extend_from_slice(&short_vec(account_keys.len() as u32));
    for key in account_keys {
        message.extend_from_slice(&decode_pubkey(key)?);
    }
    message.extend_from_slice(&blockhash);
    // Instructions: [SetComputeUnitLimit, SetComputeUnitPrice, TransferChecked]
    // plus a trailing Memo when one is supplied.
    message.extend_from_slice(&short_vec(if has_memo { 4 } else { 3 }));
    // ComputeBudget SetComputeUnitLimit (program index 6, no accounts).
    message.push(6);
    message.extend_from_slice(&short_vec(0));
    message.extend_from_slice(&short_vec(compute_limit_data.len() as u32));
    message.extend_from_slice(&compute_limit_data);
    // ComputeBudget SetComputeUnitPrice (program index 6, no accounts).
    message.push(6);
    message.extend_from_slice(&short_vec(0));
    message.extend_from_slice(&short_vec(compute_price_data.len() as u32));
    message.extend_from_slice(&compute_price_data);
    // Token TransferChecked (program index 5): source, mint, dest, authority.
    message.push(5);
    message.extend_from_slice(&short_vec(4));
    message.extend_from_slice(&[2u8, 4u8, 3u8, 1u8]);
    message.extend_from_slice(&short_vec(transfer_data.len() as u32));
    message.extend_from_slice(&transfer_data);
    // SPL Memo (program index 7, no accounts): the memo string is the instruction data.
    if has_memo {
        message.push(7);
        message.extend_from_slice(&short_vec(0));
        message.extend_from_slice(&short_vec(options.memo.len() as u32));
        message.extend_from_slice(options.memo.as_bytes());
    }
    Ok(message)
}

/// Encode a length as a Solana shortvec / compact-u16 (little-endian base-128).
fn short_vec(value: u32) -> Vec<u8> {
    let mut bytes = Vec::new();
    let mut current = value;
    loop {
        let mut byte = (current & 0x7f) as u8;
        current >>= 7;
        if current > 0 {
            byte |= 0x80;
        }
        bytes.push(byte);
        if current == 0 {
            break;
        }
    }
    bytes
}

/// Decode a base58 pubkey into exactly 32 bytes.
fn decode_pubkey(value: &str) -> Result<[u8; 32]> {
    let bytes = decode_base58(value)
        .map_err(|err| Error::InvalidArgument(format!("invalid base58 pubkey {value}: {err}")))?;
    bytes.as_slice().try_into().map_err(|_| {
        Error::InvalidArgument(format!(
            "pubkey {value} does not decode to 32 bytes (got {})",
            bytes.len()
        ))
    })
}

/// Decode a base58 blockhash into exactly 32 bytes.
fn decode_blockhash(value: &str) -> Result<[u8; 32]> {
    let bytes = decode_base58(value)
        .map_err(|err| Error::InvalidArgument(format!("invalid base58 blockhash: {err}")))?;
    bytes.as_slice().try_into().map_err(|_| {
        Error::InvalidArgument(format!(
            "blockhash does not decode to 32 bytes (got {})",
            bytes.len()
        ))
    })
}

fn signing_key_from_secret(secret: &[u8]) -> Result<DalekSigningKey> {
    if secret.len() != 32 && secret.len() != 64 {
        return Err(Error::InvalidArgument(format!(
            "Solana secret key must be 32 or 64 bytes, got {}",
            secret.len()
        )));
    }
    let mut seed = [0u8; 32];
    seed.copy_from_slice(&secret[..32]);
    let signing_key = DalekSigningKey::from_bytes(&seed);
    if secret.len() == 64 && signing_key.verifying_key().to_bytes() != secret[32..] {
        return Err(Error::InvalidArgument(
            "Solana secret key public key does not match seed".to_string(),
        ));
    }
    Ok(signing_key)
}

fn normalized_amount(amount: &str) -> Result<u64> {
    let trimmed = amount.trim();
    let value: u64 = trimmed.parse().map_err(|_| {
        Error::InvalidArgument(format!(
            "Solana payment amount must be an integer: {amount}"
        ))
    })?;
    if value == 0 {
        return Err(Error::InvalidArgument(format!(
            "Solana payment amount must be a positive integer: {amount}"
        )));
    }
    Ok(value)
}

/// Options bridging a parsed 402 [`PaymentChallenge`] to the standard x402
/// `PAYMENT-SIGNATURE` header: only the SPL transfer secret + RPC transport are
/// needed, since the fee payer, amount, recipient, asset, and network come from
/// the challenge.
pub struct ChallengeDelegatedPaymentOptions {
    /// The agent's Solana secret key (32-byte seed or 64-byte key).
    pub secret_key: Vec<u8>,
    /// Token decimals (USDC/CASH = 6). Defaults to 6.
    pub decimals: Option<u8>,
    /// JSON-RPC transport for blockhash + token-account lookups. When omitted, a
    /// direct reqwest transport against `rpc_url` is used.
    pub rpc: Option<RpcRequest>,
    /// Solana RPC URL used to build the default transport when `rpc` is unset.
    pub rpc_url: Option<String>,
    /// Override the SPL mint (defaults to the challenge `asset`).
    pub mint: Option<String>,
    pub source_token_account: Option<String>,
    pub destination_token_account: Option<String>,
}

/// Build the standard x402 `PAYMENT-SIGNATURE` header `(name, value)` from a
/// parsed 402 [`PaymentChallenge`]. Reads the facilitator fee payer from
/// `metadata.feePayer` (equivalently `accepts[].extra.feePayer`), and the
/// recipient/amount/asset(mint)/network from the challenge; signs the SPL
/// `TransferChecked` as the transfer authority and wraps the partially-signed
/// transaction in the standard `PaymentPayload` envelope. No body `payment` map
/// is produced. Shared by the bounty + registry Solana-payment flows.
pub async fn build_delegated_payment_header_from_challenge(
    challenge: &PaymentChallenge,
    options: ChallengeDelegatedPaymentOptions,
) -> Result<(String, String)> {
    let metadata = challenge.metadata.clone().unwrap_or_default();
    let fee_payer = metadata.get("feePayer").cloned().ok_or_else(|| {
        Error::InvalidArgument(
            "402 challenge is missing metadata.feePayer (required for delegated settlement)"
                .to_string(),
        )
    })?;
    let amount = challenge
        .amount
        .clone()
        .ok_or_else(|| Error::InvalidArgument("402 challenge is missing an amount".to_string()))?;
    let to = challenge.to.clone().ok_or_else(|| {
        Error::InvalidArgument("402 challenge is missing a recipient".to_string())
    })?;
    let network = challenge
        .network
        .clone()
        .unwrap_or_else(|| SOLANA_MAINNET_NETWORK.to_string());
    let mint = options
        .mint
        .clone()
        .or_else(|| challenge.asset.clone())
        .unwrap_or_default();

    let rpc = options
        .rpc
        .clone()
        .or_else(|| options.rpc_url.clone().map(default_rpc_request));

    build_delegated_x402_payment_header(DelegatedX402PaymentHeaderOptions {
        fee_payer,
        mint: mint.clone(),
        decimals: options.decimals.unwrap_or(6),
        secret_key: options.secret_key,
        source_token_account: options.source_token_account,
        destination_token_account: options.destination_token_account,
        compute_unit_limit: None,
        compute_unit_price_micro_lamports: None,
        recent_blockhash: None,
        rpc,
        network,
        // The envelope `asset` must be the on-chain SPL mint used to build the
        // tx, not a symbol.
        asset: Some(mint),
        amount,
        to,
    })
    .await
}

/// Extract the x402 [`PaymentChallenge`] from a `402` error, surfacing any other
/// error unchanged. Used to drive the challenge → delegated-payment → resubmit
/// flow.
pub fn payment_challenge(error: Error) -> Result<PaymentChallenge> {
    if error.status() == Some(402) {
        if let Some(required) = error.payment_required() {
            return Ok(required.payment.clone());
        }
    }
    Err(error)
}

/// Backward-compatible name for callers that use the exact-SVM helper surface.
pub fn derive_associated_token_address(owner: &str, mint: &str) -> Result<String> {
    associated_token_account(owner, mint)
}

/// Options for [`build_exact_svm_transfer_transaction`].
#[derive(Debug, Clone)]
pub struct ExactSvmTransferOptions {
    pub secret_key: Vec<u8>,
    pub fee_payer: String,
    pub pay_to: String,
    pub mint: String,
    pub amount: String,
    pub decimals: u8,
    pub recent_blockhash: String,
    pub memo: Option<String>,
    pub source_token_account: Option<String>,
    pub compute_unit_limit: Option<u32>,
    pub compute_unit_price_micro_lamports: Option<u64>,
}

/// Result of [`build_exact_svm_transfer_transaction`].
#[derive(Debug, Clone)]
pub struct ExactSvmTransfer {
    pub transaction: String,
    pub from: String,
    pub source_token_account: String,
    pub destination_token_account: String,
    pub memo: String,
}

/// Build a payer-signed x402 Solana transfer transaction from an already-fetched
/// blockhash. This compatibility wrapper shares the delegated transfer encoder
/// used by the sponsored-payment path.
pub fn build_exact_svm_transfer_transaction(
    options: ExactSvmTransferOptions,
) -> Result<ExactSvmTransfer> {
    let signing_key = signing_key_from_secret(&options.secret_key)?;
    let authority = bs58::encode(signing_key.verifying_key().to_bytes()).into_string();
    if authority == options.fee_payer {
        return Err(Error::InvalidArgument(
            "x402 exact-SVM: fee payer must differ from the paying authority".to_string(),
        ));
    }

    let amount = normalized_amount(&options.amount)?;
    let memo = options.memo.clone().unwrap_or_default();
    let source_token_account = options
        .source_token_account
        .unwrap_or_else(|| associated_token_account(&authority, &options.mint).unwrap_or_default());
    let destination_token_account = associated_token_account(&options.pay_to, &options.mint)?;
    let message = two_signer_facilitator_message(&FacilitatorMessage {
        fee_payer: &options.fee_payer,
        authority: &authority,
        source_token_account: &source_token_account,
        destination_token_account: &destination_token_account,
        mint: &options.mint,
        amount,
        decimals: options.decimals,
        compute_unit_limit: options
            .compute_unit_limit
            .unwrap_or(FACILITATOR_COMPUTE_UNIT_LIMIT),
        compute_unit_price_micro_lamports: options
            .compute_unit_price_micro_lamports
            .unwrap_or(FACILITATOR_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS),
        recent_blockhash: &options.recent_blockhash,
        memo: &memo,
    })?;
    let authority_signature = signing_key.sign(&message).to_bytes();
    let mut wire = Vec::with_capacity(2 + 64 + 64 + message.len());
    wire.extend_from_slice(&short_vec(2));
    wire.extend_from_slice(&[0u8; 64]);
    wire.extend_from_slice(&authority_signature);
    wire.extend_from_slice(&message);
    Ok(ExactSvmTransfer {
        transaction: to_base64(&wire),
        from: authority,
        source_token_account,
        destination_token_account,
        memo,
    })
}

/// Fetch a recent blockhash through a direct reqwest Solana JSON-RPC call.
pub async fn get_recent_blockhash(
    client: &reqwest::Client,
    rpc_url: &str,
    commitment: &str,
) -> Result<String> {
    let response = client
        .post(rpc_url)
        .json(&json!({
            "jsonrpc": "2.0",
            "id": "getLatestBlockhash",
            "method": "getLatestBlockhash",
            "params": [{ "commitment": commitment }],
        }))
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(Error::Rpc(format!(
            "Solana RPC getLatestBlockhash failed with HTTP {}",
            response.status().as_u16()
        )));
    }
    let payload: serde_json::Value = response.json().await?;
    if let Some(error) = payload.get("error") {
        return Err(Error::Rpc(format!(
            "Solana RPC getLatestBlockhash failed: {error}"
        )));
    }
    payload
        .pointer("/result/value/blockhash")
        .and_then(|value| value.as_str())
        .map(ToString::to_string)
        .ok_or_else(|| Error::Rpc("Solana RPC getLatestBlockhash returned no result".to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::from_base64;
    use crate::signer::LocalSigner;

    /// A fixed 32-byte seed so the wire bytes are deterministic.
    fn test_signer() -> LocalSigner {
        LocalSigner::from_seed(&[7u8; 32]).expect("seed")
    }

    /// Decode a shortvec from `bytes` at `offset`, returning `(value, new_offset)`.
    fn read_short_vec(bytes: &[u8], mut offset: usize) -> (u32, usize) {
        let mut value: u32 = 0;
        let mut shift = 0;
        loop {
            let byte = bytes[offset];
            offset += 1;
            value |= ((byte & 0x7f) as u32) << shift;
            if byte & 0x80 == 0 {
                break;
            }
            shift += 7;
        }
        (value, offset)
    }

    #[test]
    fn ata_derivation_matches_known_vector() {
        // ATA for owner 9WzD…AWWM + USDC mint under the SPL Associated Token
        // program. Cross-checked with an independent ed25519 find_program_address
        // reference (bump 254) and consistent with @solana/spl-token.
        let owner = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
        let mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
        let ata = associated_token_account(owner, mint).expect("ata");
        assert_eq!(ata, "FGETo8T8wMcN2wCjav8VK6eh3dLk63evNDPxzLSJra8B");
    }

    #[tokio::test]
    async fn delegated_payment_header_carries_standard_envelope_and_decodes() {
        let signer = test_signer();
        let fee_payer = "GThUX1Atko4tqhN2NaiTazWSeFWMuiUvfFnyJyUghFMJ"; // arbitrary
        let payee = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
        let mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
        // A valid base58 32-byte blockhash (reuse a pubkey-shaped value),
        // served by a stub RPC so the build stays offline + deterministic.
        let blockhash = "11111111111111111111111111111111";
        let rpc: RpcRequest = Arc::new(move |method: String, _params| {
            Box::pin(async move {
                assert_eq!(method, "getLatestBlockhash");
                Ok(json!({ "value": { "blockhash": blockhash } }))
            }) as Pin<Box<dyn Future<Output = Result<serde_json::Value>> + Send>>
        });

        // Build the challenge → standard PAYMENT-SIGNATURE header, mirroring the
        // register/bounty flows. The fee payer is read from metadata.feePayer.
        let mut metadata = std::collections::HashMap::new();
        metadata.insert("feePayer".to_string(), fee_payer.to_string());
        let challenge = PaymentChallenge {
            network: Some(SOLANA_MAINNET_NETWORK.to_string()),
            asset: Some(mint.to_string()),
            amount: Some("1000000".to_string()),
            to: Some(payee.to_string()),
            metadata: Some(metadata),
            ..Default::default()
        };

        let (header_name, header_value) = build_delegated_payment_header_from_challenge(
            &challenge,
            ChallengeDelegatedPaymentOptions {
                secret_key: signer.seed().to_vec(),
                decimals: Some(6),
                rpc: Some(rpc),
                rpc_url: None,
                mint: None,
                source_token_account: None,
                destination_token_account: None,
            },
        )
        .await
        .expect("payment header");

        // Submitted via the standard x402 PAYMENT-SIGNATURE header.
        assert_eq!(header_name, X402_PAYMENT_HEADER);
        assert_eq!(header_name, "PAYMENT-SIGNATURE");

        // The header is standard padded base64 of the UTF-8 JSON envelope.
        let envelope_bytes = base64::engine::general_purpose::STANDARD
            .decode(&header_value)
            .expect("standard padded base64");
        let envelope: serde_json::Value =
            serde_json::from_slice(&envelope_bytes).expect("utf-8 json envelope");

        // The standard PaymentPayload envelope (x402Version 2, exact scheme).
        assert_eq!(envelope["x402Version"], 2);
        assert_eq!(envelope["accepted"]["scheme"], "exact");
        assert_eq!(envelope["accepted"]["network"], SOLANA_MAINNET_NETWORK);
        assert_eq!(envelope["accepted"]["amount"], "1000000");
        // `asset` is the on-chain SPL mint, not a symbol.
        assert_eq!(envelope["accepted"]["asset"], mint);
        assert_eq!(envelope["accepted"]["payTo"], payee);
        assert_eq!(envelope["accepted"]["maxTimeoutSeconds"], 60);
        assert_eq!(envelope["accepted"]["extra"]["feePayer"], fee_payer);
        // No legacy metadata.delegatedTx transport anywhere in the envelope.
        assert!(envelope.get("metadata").is_none());
        assert!(envelope["accepted"]["extra"].get("delegatedTx").is_none());

        // The partially-signed tx travels in payload.transaction.
        let wire_b64 = envelope["payload"]["transaction"]
            .as_str()
            .expect("payload.transaction string");
        assert!(
            !wire_b64.is_empty(),
            "payload.transaction must be non-empty"
        );
        let wire = from_base64(wire_b64).expect("base64");

        // Wire = shortvec(signatures=2) ++ feePayerSig[64](zero) ++ authoritySig[64] ++ message.
        let (sig_count, mut offset) = read_short_vec(&wire, 0);
        assert_eq!(sig_count, 2);
        let fee_payer_sig = &wire[offset..offset + 64];
        assert!(
            fee_payer_sig.iter().all(|b| *b == 0),
            "fee-payer signature slot must be zeroed for the facilitator to co-sign"
        );
        offset += 64; // fee-payer sig
        offset += 64; // authority sig
        let message = &wire[offset..];

        // Message header: 2 required signatures, 1 readonly-signed, 3 readonly-unsigned.
        assert_eq!(&message[0..3], &[2, 1, 3]);
        let (account_count, mut m) = read_short_vec(message, 3);
        assert_eq!(account_count, 7);

        // Account 0 (fee payer) is the facilitator.
        let fee_payer_key = bs58::encode(&message[m..m + 32]).into_string();
        assert_eq!(fee_payer_key, fee_payer);
        m += 32 * account_count as usize; // skip all account keys
        m += 32; // skip blockhash

        // Three instructions in order: ComputeUnitLimit, ComputeUnitPrice, TransferChecked.
        let (ix_count, mut ix) = read_short_vec(message, m);
        assert_eq!(ix_count, 3);

        // Instruction 1: program index 6 (compute budget), data[0] == 2 (SetComputeUnitLimit).
        let (prog0, after_prog0) = (message[ix], ix + 1);
        assert_eq!(prog0, 6);
        let (acct_len0, after_acct0) = read_short_vec(message, after_prog0);
        assert_eq!(acct_len0, 0);
        let (data_len0, data0_start) = read_short_vec(message, after_acct0);
        assert_eq!(message[data0_start], 2);
        ix = data0_start + data_len0 as usize;

        // Instruction 2: program index 6, data[0] == 3 (SetComputeUnitPrice).
        let prog1 = message[ix];
        assert_eq!(prog1, 6);
        let (acct_len1, after_acct1) = read_short_vec(message, ix + 1);
        assert_eq!(acct_len1, 0);
        let (data_len1, data1_start) = read_short_vec(message, after_acct1);
        assert_eq!(message[data1_start], 3);
        ix = data1_start + data_len1 as usize;

        // Instruction 3: program index 5 (token), data[0] == 12 (TransferChecked).
        let prog2 = message[ix];
        assert_eq!(prog2, 5);
        let (acct_len2, after_acct2) = read_short_vec(message, ix + 1);
        assert_eq!(acct_len2, 4);
        // Accounts: [source(2), mint(4), dest(3), authority(1)].
        assert_eq!(&message[after_acct2..after_acct2 + 4], &[2, 4, 3, 1]);
        let (_data_len2, data2_start) = read_short_vec(message, after_acct2 + 4);
        assert_eq!(message[data2_start], 12);
    }
}
