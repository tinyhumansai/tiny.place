//! Pure payout arithmetic for job settlement, isolated for unit testing and
//! formal verification (Kani). The handlers call `rake`, so the verified logic
//! is the deployed logic. See `contracts-sol/FORMAL_VERIFICATION.md`.

pub const BPS_DENOMINATOR: u64 = 10_000;

/// Split an available balance into `(amount_to_recipient, fee)`.
///
/// When `take_fee` is false (e.g. a refund), the recipient gets everything and
/// the fee is zero. Otherwise `fee = available * fee_bps / 10_000` and the
/// recipient gets the remainder. Returns `None` only on arithmetic overflow.
///
/// Guarantees (proven below): `amount + fee == available` exactly (conservation
/// — no funds created or destroyed) and `fee <= available`.
#[inline]
pub fn rake(available: u64, fee_bps: u16, take_fee: bool) -> Option<(u64, u64)> {
    if !take_fee {
        return Some((available, 0));
    }
    let fee = (available as u128)
        .checked_mul(fee_bps as u128)?
        .checked_div(BPS_DENOMINATOR as u128)? as u64;
    let amount = available.checked_sub(fee)?;
    Some((amount, fee))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refund_takes_no_fee() {
        assert_eq!(rake(1000, 250, false), Some((1000, 0)));
    }

    #[test]
    fn rake_splits_correctly() {
        // 2.5% of 1000 = 25; recipient gets 975.
        assert_eq!(rake(1000, 250, true), Some((975, 25)));
        // Zero fee_bps means no fee even when taking.
        assert_eq!(rake(1000, 0, true), Some((1000, 0)));
    }

    #[test]
    fn rake_conserves_funds() {
        for &avail in &[0u64, 1, 999, 1000, u64::MAX] {
            for &bps in &[0u16, 1, 250, 9_999] {
                let (amount, fee) = rake(avail, bps, true).unwrap();
                assert_eq!(amount + fee, avail, "conservation broken");
                assert!(fee <= avail);
            }
        }
    }
}

#[cfg(kani)]
mod proofs {
    use super::*;

    /// CONSERVATION: the recipient amount plus fee always equals the available
    /// balance — settlement neither creates nor destroys funds.
    #[kani::proof]
    fn rake_conserves_value() {
        let available: u64 = kani::any();
        let fee_bps: u16 = kani::any();
        let take_fee: bool = kani::any();
        // fee_bps is validated < 10_000 at job creation.
        kani::assume((fee_bps as u64) < BPS_DENOMINATOR);

        if let Some((amount, fee)) = rake(available, fee_bps, take_fee) {
            assert!(amount.checked_add(fee) == Some(available));
            assert!(fee <= available);
        }
    }

    /// A refund (take_fee = false) never withholds a fee.
    #[kani::proof]
    fn refund_has_no_fee() {
        let available: u64 = kani::any();
        let fee_bps: u16 = kani::any();
        let (amount, fee) = rake(available, fee_bps, false).unwrap();
        assert!(fee == 0);
        assert!(amount == available);
    }
}
