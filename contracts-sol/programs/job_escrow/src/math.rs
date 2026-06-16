//! Pure arithmetic for job escrow accounting.

pub const BPS_DENOMINATOR: u64 = 10_000;

#[inline]
pub fn available(deposited: u64, disbursed: u64) -> Option<u64> {
    deposited.checked_sub(disbursed)
}

#[inline]
pub fn apply_disburse(deposited: u64, disbursed: u64, amount: u64, fee: u64) -> Option<u64> {
    let total = amount.checked_add(fee)?;
    let avail = available(deposited, disbursed)?;
    if total > avail {
        return None;
    }
    Some(disbursed + total)
}

#[inline]
pub fn nonce_ok(last: u64, candidate: u64) -> bool {
    candidate > last
}

#[inline]
pub fn rake(available: u64, fee_bps: u16, take_fee: bool) -> Option<(u64, u64)> {
    if !take_fee {
        return Some((available, 0));
    }
    let fee = ((available as u128) * (fee_bps as u128) / (BPS_DENOMINATOR as u128)) as u64;
    let amount = available.checked_sub(fee)?;
    Some((amount, fee))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nonce_is_strictly_monotonic() {
        assert!(nonce_ok(0, 1));
        assert!(nonce_ok(5, 6));
        assert!(!nonce_ok(5, 5));
        assert!(!nonce_ok(5, 4));
    }

    #[test]
    fn disburse_preserves_solvency() {
        assert_eq!(apply_disburse(100, 0, 60, 5), Some(65));
        assert_eq!(apply_disburse(100, 0, 95, 5), Some(100));
        assert_eq!(apply_disburse(100, 0, 96, 5), None);
        assert_eq!(apply_disburse(100, 80, 25, 0), None);
        assert_eq!(apply_disburse(u64::MAX, 0, u64::MAX, 1), None);
        assert_eq!(apply_disburse(50, 100, 0, 0), None);
    }

    #[test]
    fn rake_conserves_value() {
        assert_eq!(rake(1000, 250, true), Some((975, 25)));
        assert_eq!(rake(1000, 0, true), Some((1000, 0)));
        assert_eq!(rake(1000, 250, false), Some((1000, 0)));
        assert_eq!(rake(100, 20_000, true), None);
    }
}
