//! Pure pot arithmetic for poker settlement, isolated for unit testing and
//! formal verification (Kani). The handlers call `pot_split`, so the verified
//! logic is the deployed logic. See `contracts-sol/FORMAL_VERIFICATION.md`.

pub const BPS_DENOMINATOR: u64 = 10_000;

/// Split a winner-take-all pot into `(payout_to_winner, fee)`.
///
/// `fee = pot * fee_bps / 10_000`; the winner gets the remainder. Returns
/// `None` only on overflow. Guarantees (proven below): `payout + fee == pot`
/// (conservation) and `fee <= pot`.
#[inline]
pub fn pot_split(pot: u64, fee_bps: u16) -> Option<(u64, u64)> {
    let fee = (pot as u128)
        .checked_mul(fee_bps as u128)?
        .checked_div(BPS_DENOMINATOR as u128)? as u64;
    let payout = pot.checked_sub(fee)?;
    Some((payout, fee))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_pot() {
        // 5% rake on a 2000 pot = 100; winner gets 1900.
        assert_eq!(pot_split(2000, 500), Some((1900, 100)));
        assert_eq!(pot_split(2000, 0), Some((2000, 0)));
    }

    #[test]
    fn conserves_pot() {
        for &pot in &[0u64, 1, 333, 2000, u64::MAX] {
            for &bps in &[0u16, 1, 500, 9_999] {
                let (payout, fee) = pot_split(pot, bps).unwrap();
                assert_eq!(payout + fee, pot, "pot not conserved");
                assert!(fee <= pot);
            }
        }
    }
}

#[cfg(kani)]
mod proofs {
    use super::*;

    /// CONSERVATION: winner payout plus rake always equals the pot.
    #[kani::proof]
    fn pot_split_conserves_value() {
        let pot: u64 = kani::any();
        let fee_bps: u16 = kani::any();
        kani::assume((fee_bps as u64) < BPS_DENOMINATOR);

        if let Some((payout, fee)) = pot_split(pot, fee_bps) {
            assert!(payout.checked_add(fee) == Some(pot));
            assert!(fee <= pot);
        }
    }
}
