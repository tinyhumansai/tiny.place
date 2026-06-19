//! Hardcoded Solana asset registry for x402 payments.
//!
//! The backend's 402 challenge advertises the on-chain SPL *mint address* in the
//! `asset` field (per the x402 exact-scheme spec), not a symbol like `"USDC"`. A
//! client echoes that mint address back to the server (which this SDK already
//! does — `asset` passes straight through [`crate::x402`]), but when displaying a
//! payment to a user it should show the friendly symbol. These helpers map
//! between the two with a small hardcoded table; a `/solana`-backed resolver can
//! replace it later, but the mints are stable.
//!
//! CASH has no fixed mainnet mint baked into the SDK (it is resolved per
//! environment), so it is intentionally absent here.

/// Mainnet USDC SPL mint (6 decimals).
pub const SOLANA_USDC_MINT: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
/// Mainnet wrapped-SOL (WSOL) SPL mint (9 decimals).
pub const SOLANA_WSOL_MINT: &str = "So11111111111111111111111111111111111111112";
/// The native SOL asset symbol (a lamport transfer, no SPL mint).
pub const SOLANA_NATIVE_ASSET: &str = "SOL";

/// A resolved Solana settlement asset.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SolanaAsset {
    /// Display symbol, e.g. `"USDC"`.
    pub symbol: &'static str,
    /// On-chain SPL mint; empty for native SOL.
    pub mint: &'static str,
    pub decimals: u8,
    pub native: bool,
}

const REGISTRY: &[SolanaAsset] = &[
    SolanaAsset {
        symbol: "SOL",
        mint: "",
        decimals: 9,
        native: true,
    },
    SolanaAsset {
        symbol: "USDC",
        mint: SOLANA_USDC_MINT,
        decimals: 6,
        native: false,
    },
    SolanaAsset {
        symbol: "WSOL",
        mint: SOLANA_WSOL_MINT,
        decimals: 9,
        native: false,
    },
];

/// Returns `true` when the value looks like a base58 SPL mint address rather
/// than a symbol (32–44 base58 characters).
pub fn is_likely_mint_address(value: &str) -> bool {
    let trimmed = value.trim();
    let len = trimmed.chars().count();
    if !(32..=44).contains(&len) {
        return false;
    }
    trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() && !matches!(c, '0' | 'O' | 'I' | 'l'))
}

/// Resolves an x402 `asset` — a symbol (`"USDC"`) or, as the 402 challenge now
/// advertises, an on-chain SPL mint address — to its [`SolanaAsset`], matching
/// both fields case-insensitively. Returns `None` for an empty value or an
/// unknown non-address symbol.
pub fn resolve_solana_asset(value: &str) -> Option<SolanaAsset> {
    let raw = value.trim();
    if raw.is_empty() {
        return None;
    }
    for asset in REGISTRY {
        if asset.symbol.eq_ignore_ascii_case(raw) {
            return Some(asset.clone());
        }
        if !asset.mint.is_empty() && asset.mint.eq_ignore_ascii_case(raw) {
            return Some(asset.clone());
        }
    }
    None
}

/// Friendly display symbol for an x402 `asset` (symbol or mint address). Returns
/// the trimmed input unchanged when it matches no known asset, so an unknown but
/// base58-shaped mint surfaces verbatim rather than as a wrong symbol.
pub fn solana_asset_symbol(value: &str) -> String {
    match resolve_solana_asset(value) {
        Some(asset) => asset.symbol.to_string(),
        None => value.trim().to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_by_symbol_and_mint() {
        assert_eq!(resolve_solana_asset("USDC").unwrap().mint, SOLANA_USDC_MINT);
        assert_eq!(resolve_solana_asset("usdc").unwrap().decimals, 6);
        // The 402 challenge advertises the mint address; it must resolve back.
        assert_eq!(
            resolve_solana_asset(SOLANA_USDC_MINT).unwrap().symbol,
            "USDC"
        );
        assert!(resolve_solana_asset("SOL").unwrap().native);
        assert!(resolve_solana_asset("DOGE").is_none());
        assert!(resolve_solana_asset("").is_none());
    }

    #[test]
    fn maps_mint_to_symbol_for_display() {
        assert_eq!(solana_asset_symbol(SOLANA_USDC_MINT), "USDC");
        assert_eq!(solana_asset_symbol("usdc"), "USDC");
        assert_eq!(solana_asset_symbol("DOGE"), "DOGE");
    }

    #[test]
    fn detects_mint_addresses() {
        assert!(is_likely_mint_address(SOLANA_USDC_MINT));
        assert!(is_likely_mint_address(SOLANA_WSOL_MINT));
        assert!(!is_likely_mint_address("USDC"));
        assert!(!is_likely_mint_address("USDC-mint"));
    }
}
