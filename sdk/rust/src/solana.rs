//! Solana (SVM) transaction building for the standard x402 `exact` scheme.
//! Mirrors `sdk/typescript/src/solana.ts`.
//!
//! Unlike the rest of the Rust SDK (a REST wrapper), this module hand-builds the
//! exact byte layout of a legacy Solana transaction — the partially-signed
//! `TransferChecked` the facilitator co-signs (as fee payer) and broadcasts. The
//! client never broadcasts it; it ships base64 in the x402 `PaymentPayload`.

use base64::Engine as _;
use ed25519_dalek::{Signer as _, SigningKey as DalekSigningKey};
use rand::RngCore as _;
use sha2::{Digest, Sha256};

use crate::crypto::decode_base58;
use crate::error::{Error, Result};

/// Mainnet Solana network CAIP-2 id.
pub const SOLANA_MAINNET_NETWORK: &str = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
/// Mainnet USDC SPL mint.
pub const SOLANA_USDC_MINT: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
/// The SPL Token program.
pub const SOLANA_TOKEN_PROGRAM_ID: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
/// The ComputeBudget program (sets the compute unit limit + price).
pub const SOLANA_COMPUTE_BUDGET_PROGRAM_ID: &str = "ComputeBudget111111111111111111111111111111";
/// The SPL Associated Token Account program (derives a wallet's canonical ATA).
pub const SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID: &str = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
/// The SPL Memo program — the exact-SVM scheme requires a Memo for tx uniqueness.
pub const SOLANA_MEMO_PROGRAM_ID: &str = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

/// Default compute unit limit for the facilitator transfer (matches the web app).
pub const FACILITATOR_COMPUTE_UNIT_LIMIT: u32 = 40_000;
/// Default compute unit price in microlamports/CU (well under the cap).
pub const FACILITATOR_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS: u64 = 1;

const PDA_MARKER: &[u8] = b"ProgramDerivedAddress";

/// True when `bytes` (a 32-byte candidate) lies on the ed25519 curve, i.e. is a
/// valid public key. Program-Derived Addresses must be OFF the curve, so this is
/// the rejection test in [`find_program_address`].
fn is_on_curve(bytes: &[u8; 32]) -> bool {
    curve25519_dalek::edwards::CompressedEdwardsY(*bytes)
        .decompress()
        .is_some()
}

/// Derive a Program-Derived Address (and bump) from seeds under a program,
/// exactly as Solana's `findProgramAddress` does: hash `seeds || [bump] ||
/// programId || "ProgramDerivedAddress"` for bump 255..=0 and return the first
/// off-curve result.
fn find_program_address(seeds: &[&[u8]], program_id: &[u8]) -> Result<([u8; 32], u8)> {
    for bump in (0u8..=255).rev() {
        let mut hasher = Sha256::new();
        for seed in seeds {
            hasher.update(seed);
        }
        hasher.update([bump]);
        hasher.update(program_id);
        hasher.update(PDA_MARKER);
        let hash: [u8; 32] = hasher.finalize().into();
        if !is_on_curve(&hash) {
            return Ok((hash, bump));
        }
    }
    Err(Error::InvalidArgument(
        "unable to find a viable program-derived address (no off-curve bump)".into(),
    ))
}

/// Derive the canonical Associated Token Account address (base58) for `owner`
/// holding `mint` under the SPL Token program. This matches the destination ATA
/// the x402 exact-SVM facilitator derives from `payTo`+`asset`, so the client
/// must transfer to exactly this account.
pub fn derive_associated_token_address(owner: &str, mint: &str) -> Result<String> {
    derive_associated_token_address_with_program(owner, mint, SOLANA_TOKEN_PROGRAM_ID)
}

/// [`derive_associated_token_address`] with an explicit token program.
pub fn derive_associated_token_address_with_program(
    owner: &str,
    mint: &str,
    token_program: &str,
) -> Result<String> {
    let owner_bytes = decode_b58(owner, "owner")?;
    let token_program_bytes = decode_b58(token_program, "tokenProgram")?;
    let mint_bytes = decode_b58(mint, "mint")?;
    let ata_program = decode_b58(SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID, "ataProgram")?;
    let (address, _bump) = find_program_address(
        &[&owner_bytes, &token_program_bytes, &mint_bytes],
        &ata_program,
    )?;
    Ok(bs58::encode(address).into_string())
}

/// Inputs to [`build_exact_svm_transfer_transaction`].
#[derive(Debug, Clone)]
pub struct ExactSvmTransferOptions {
    /// The payer's Solana secret key (32-byte seed or 64-byte keypair).
    pub secret_key: Vec<u8>,
    /// The facilitator/sponsor fee payer (base58), from `extra.feePayer`.
    pub fee_payer: String,
    /// The recipient wallet (base58), from the challenge `payTo`.
    pub pay_to: String,
    /// The SPL mint (base58), from the challenge `asset`.
    pub mint: String,
    /// The exact transfer amount in the mint's smallest unit (decimal string).
    pub amount: String,
    /// The mint's decimals (USDC/CASH = 6).
    pub decimals: u8,
    /// A recent blockhash (base58) the transaction is anchored to.
    pub recent_blockhash: String,
    /// The Memo data: the challenge `extra.memo` when present, else a random
    /// >=16-byte hex nonce is generated.
    pub memo: Option<String>,
    /// Override the payer's source token account (defaults to its derived ATA).
    pub source_token_account: Option<String>,
    /// Compute unit limit (defaults to [`FACILITATOR_COMPUTE_UNIT_LIMIT`]).
    pub compute_unit_limit: Option<u32>,
    /// Compute unit price, microlamports/CU (defaults to the facilitator const).
    pub compute_unit_price_micro_lamports: Option<u64>,
}

/// Result of [`build_exact_svm_transfer_transaction`].
#[derive(Debug, Clone)]
pub struct ExactSvmTransfer {
    /// Base64 of the partially-signed (payer-only) legacy transaction.
    pub transaction: String,
    /// The payer (authority) wallet, base58.
    pub from: String,
    /// The derived source token account (payer's ATA unless overridden).
    pub source_token_account: String,
    /// The derived destination ATA (payTo + mint).
    pub destination_token_account: String,
    /// The Memo string actually embedded (echoed `extra.memo` or a nonce).
    pub memo: String,
}

/// Build the x402 `exact` payment transaction for Solana (SVM), per
/// `specs/schemes/exact/scheme_exact_svm.md`: a legacy transaction with the
/// static instruction layout `[SetComputeUnitLimit, SetComputeUnitPrice,
/// TransferChecked, Memo]`, fee payer = `extra.feePayer` (account index 0, left
/// UNSIGNED for the facilitator to co-sign), and the payer signing only as the
/// transfer authority. The destination is the ATA derived from `payTo`+`mint`.
///
/// The returned base64 transaction goes into the x402 `PaymentPayload`'s
/// `payload.transaction`; the client does NOT broadcast it.
pub fn build_exact_svm_transfer_transaction(
    options: ExactSvmTransferOptions,
) -> Result<ExactSvmTransfer> {
    let amount = normalized_amount(&options.amount)?;
    let (signing_key, authority_key) = signing_key_from_secret(&options.secret_key)?;
    let authority = bs58::encode(authority_key).into_string();

    if authority == options.fee_payer {
        return Err(Error::InvalidArgument(
            "x402 exact-SVM: fee payer must differ from the paying authority".into(),
        ));
    }

    let source_token_account = match &options.source_token_account {
        Some(account) => account.clone(),
        None => derive_associated_token_address(&authority, &options.mint)?,
    };
    let destination_token_account =
        derive_associated_token_address(&options.pay_to, &options.mint)?;
    let memo = match options.memo.as_ref().map(|m| m.trim()) {
        Some(memo) if !memo.is_empty() => options.memo.clone().unwrap(),
        _ => random_memo_nonce(),
    };

    // Account layout (signers first, then writable non-signers, then readonly
    // non-signers). Fee payer is index 0; authority is a readonly signer; the
    // token accounts are writable non-signers; mint + programs readonly.
    let account_keys = [
        options.fee_payer.as_str(),         // 0: writable signer (fee payer)
        authority.as_str(),                 // 1: readonly signer (authority)
        source_token_account.as_str(),      // 2: writable non-signer
        destination_token_account.as_str(), // 3: writable non-signer
        options.mint.as_str(),              // 4: readonly non-signer
        SOLANA_TOKEN_PROGRAM_ID,            // 5: readonly non-signer
        SOLANA_COMPUTE_BUDGET_PROGRAM_ID,   // 6: readonly non-signer
        SOLANA_MEMO_PROGRAM_ID,             // 7: readonly non-signer
    ];
    // header: 2 required signatures, 1 readonly signed (authority), 4 readonly
    // unsigned (mint, token, compute-budget, memo programs).
    let header = [2u8, 1u8, 4u8];

    let mut compute_limit_data = vec![2u8]; // SetComputeUnitLimit discriminator
    compute_limit_data.extend_from_slice(
        &options
            .compute_unit_limit
            .unwrap_or(FACILITATOR_COMPUTE_UNIT_LIMIT)
            .to_le_bytes(),
    );
    let mut compute_price_data = vec![3u8]; // SetComputeUnitPrice discriminator
    compute_price_data.extend_from_slice(
        &options
            .compute_unit_price_micro_lamports
            .unwrap_or(FACILITATOR_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS)
            .to_le_bytes(),
    );
    let mut transfer_data = vec![12u8]; // TransferChecked discriminator
    transfer_data.extend_from_slice(&amount.to_le_bytes());
    transfer_data.push(options.decimals);
    let memo_data = memo.as_bytes().to_vec();

    let mut message: Vec<u8> = Vec::new();
    message.extend_from_slice(&header);
    message.extend_from_slice(&short_vec(account_keys.len() as u64));
    for key in &account_keys {
        message.extend_from_slice(&decode_b58(key, "accountKey")?);
    }
    message.extend_from_slice(&decode_b58(&options.recent_blockhash, "recentBlockhash")?);
    message.extend_from_slice(&short_vec(4));
    // SetComputeUnitLimit (program 6, no accounts)
    message.extend_from_slice(&encode_instruction(6, &[], &compute_limit_data));
    // SetComputeUnitPrice (program 6, no accounts)
    message.extend_from_slice(&encode_instruction(6, &[], &compute_price_data));
    // TransferChecked (program 5): source, mint, destination, authority
    message.extend_from_slice(&encode_instruction(5, &[2, 4, 3, 1], &transfer_data));
    // Memo (program 7, no accounts)
    message.extend_from_slice(&encode_instruction(7, &[], &memo_data));

    // Sign only as the authority (signatures[1]); leave the fee payer slot
    // (signatures[0]) zeroed for the facilitator to fill before broadcasting.
    let authority_signature = signing_key.sign(&message).to_bytes();
    let mut transaction: Vec<u8> = Vec::new();
    transaction.extend_from_slice(&short_vec(2));
    transaction.extend_from_slice(&[0u8; 64]); // empty fee-payer signature
    transaction.extend_from_slice(&authority_signature);
    transaction.extend_from_slice(&message);

    Ok(ExactSvmTransfer {
        transaction: base64::engine::general_purpose::STANDARD.encode(&transaction),
        from: authority,
        source_token_account,
        destination_token_account,
        memo,
    })
}

/// Encode one compiled instruction: programIdIndex, account indexes, data.
fn encode_instruction(program_id_index: u8, account_indexes: &[u8], data: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    out.push(program_id_index);
    out.extend_from_slice(&short_vec(account_indexes.len() as u64));
    out.extend_from_slice(account_indexes);
    out.extend_from_slice(&short_vec(data.len() as u64));
    out.extend_from_slice(data);
    out
}

/// A random >=16-byte hex memo nonce (the exact-SVM uniqueness requirement).
fn random_memo_nonce() -> String {
    let mut random = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut random);
    random.iter().map(|b| format!("{b:02x}")).collect()
}

/// Solana short-vec (compact-u16) length prefix.
fn short_vec(value: u64) -> Vec<u8> {
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

fn decode_b58(value: &str, label: &str) -> Result<Vec<u8>> {
    decode_base58(value)
        .map_err(|err| Error::InvalidArgument(format!("invalid base58 {label}: {err}")))
}

fn normalized_amount(amount: &str) -> Result<u64> {
    let trimmed = amount.trim();
    let parsed: u64 = trimmed.parse().map_err(|_| {
        Error::InvalidArgument(format!(
            "Solana payment amount must be a u64 integer: {amount}"
        ))
    })?;
    if parsed == 0 {
        return Err(Error::InvalidArgument(format!(
            "Solana payment amount must be a positive integer: {amount}"
        )));
    }
    Ok(parsed)
}

/// Build a [`DalekSigningKey`] from a 32-byte seed or 64-byte secret key,
/// returning the key and its 32-byte public key. Validates the embedded public
/// key for a 64-byte input.
fn signing_key_from_secret(secret: &[u8]) -> Result<(DalekSigningKey, [u8; 32])> {
    if secret.len() != 32 && secret.len() != 64 {
        return Err(Error::InvalidArgument(format!(
            "Solana secret key must be 32 or 64 bytes, got {}",
            secret.len()
        )));
    }
    let mut seed = [0u8; 32];
    seed.copy_from_slice(&secret[..32]);
    let signing_key = DalekSigningKey::from_bytes(&seed);
    let public_key = signing_key.verifying_key().to_bytes();
    if secret.len() == 64 && public_key != secret[32..] {
        return Err(Error::InvalidArgument(
            "Solana secret key public key does not match seed".into(),
        ));
    }
    Ok((signing_key, public_key))
}

// --- recent blockhash via RPC ------------------------------------------------

#[derive(serde::Serialize)]
struct RpcRequest<'a> {
    jsonrpc: &'a str,
    id: &'a str,
    method: &'a str,
    params: serde_json::Value,
}

#[derive(serde::Deserialize)]
struct RpcResponse {
    result: Option<LatestBlockhashResult>,
    error: Option<RpcError>,
}

#[derive(serde::Deserialize)]
struct RpcError {
    #[serde(default)]
    code: i64,
    #[serde(default)]
    message: String,
}

#[derive(serde::Deserialize)]
struct LatestBlockhashResult {
    value: LatestBlockhashValue,
}

#[derive(serde::Deserialize)]
struct LatestBlockhashValue {
    blockhash: String,
}

/// Fetch a recent blockhash (base58) to anchor a transaction to. Used when
/// building an x402 exact-SVM payment the facilitator (not the client)
/// broadcasts.
pub async fn get_recent_blockhash(
    client: &reqwest::Client,
    rpc_url: &str,
    commitment: &str,
) -> Result<String> {
    let body = RpcRequest {
        jsonrpc: "2.0",
        id: "getLatestBlockhash",
        method: "getLatestBlockhash",
        params: serde_json::json!([{ "commitment": commitment }]),
    };
    let response = client.post(rpc_url).json(&body).send().await?;
    if !response.status().is_success() {
        return Err(Error::Rpc(format!(
            "Solana RPC getLatestBlockhash failed with HTTP {}",
            response.status().as_u16()
        )));
    }
    let payload: RpcResponse = response.json().await?;
    if let Some(error) = payload.error {
        return Err(Error::Rpc(format!(
            "Solana RPC getLatestBlockhash failed: {} (code {})",
            error.message, error.code
        )));
    }
    payload
        .result
        .map(|r| r.value.blockhash)
        .ok_or_else(|| Error::Rpc("Solana RPC getLatestBlockhash returned no result".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ata_matches_go_oracle_vector() {
        // Oracle from the exact Go lib the facilitator uses.
        let ata = derive_associated_token_address(
            "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
            SOLANA_USDC_MINT,
        )
        .unwrap();
        assert_eq!(ata, "FGETo8T8wMcN2wCjav8VK6eh3dLk63evNDPxzLSJra8B");
    }

    #[test]
    fn short_vec_encoding() {
        assert_eq!(short_vec(0), vec![0]);
        assert_eq!(short_vec(1), vec![1]);
        assert_eq!(short_vec(127), vec![127]);
        assert_eq!(short_vec(128), vec![0x80, 0x01]);
    }
}
