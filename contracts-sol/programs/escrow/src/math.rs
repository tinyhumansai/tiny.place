//! Pure settlement arithmetic for the escrow custody program.
//!
//! This logic is deliberately isolated from the Solana runtime so it can be
//! exhaustively unit-tested and formally verified (Kani) on the host. The
//! instruction handlers call these functions, so the verified logic *is* the
//! deployed logic. See `contracts-sol/FORMAL_VERIFICATION.md` for the
//! invariants these functions are proven to uphold.

/// Funds currently held by a vault and not yet disbursed.
/// Returns `None` if accounting is inconsistent (`disbursed > deposited`),
/// which the disburse path treats as an overflow error.
#[inline]
pub fn available(deposited: u64, disbursed: u64) -> Option<u64> {
    deposited.checked_sub(disbursed)
}

/// Compute the new `disbursed` total after releasing `amount` plus `fee`.
///
/// Returns `None` (rejecting the release) if the math would overflow or if
/// `amount + fee` exceeds the available balance. This is the single enforcement
/// point of the **solvency invariant**: escrow never releases more than it
/// holds, and `disbursed` never exceeds `deposited`.
#[inline]
pub fn apply_disburse(deposited: u64, disbursed: u64, amount: u64, fee: u64) -> Option<u64> {
    let total = amount.checked_add(fee)?;
    let avail = available(deposited, disbursed)?;
    if total > avail {
        return None;
    }
    let new_disbursed = disbursed.checked_add(total)?;
    Some(new_disbursed)
}

/// Replay protection: a deposit nonce is accepted iff strictly greater than the
/// last seen nonce. The new last-seen value is always the accepted nonce.
#[inline]
pub fn nonce_ok(last: u64, candidate: u64) -> bool {
    candidate > last
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn available_is_balance() {
        assert_eq!(available(100, 30), Some(70));
        assert_eq!(available(100, 100), Some(0));
        // disbursed must never exceed deposited; if it does, signal inconsistency.
        assert_eq!(available(30, 100), None);
    }

    #[test]
    fn disburse_within_balance() {
        // Release 60 + 5 fee from a vault holding 100, nothing disbursed yet.
        assert_eq!(apply_disburse(100, 0, 60, 5), Some(65));
        // Exactly drain the vault.
        assert_eq!(apply_disburse(100, 0, 95, 5), Some(100));
    }

    #[test]
    fn disburse_rejects_overspend() {
        // 96 + 5 > 100 available.
        assert_eq!(apply_disburse(100, 0, 96, 5), None);
        // Already disbursed 80, only 20 left; 25 requested.
        assert_eq!(apply_disburse(100, 80, 25, 0), None);
    }

    #[test]
    fn disburse_rejects_overflow() {
        assert_eq!(apply_disburse(u64::MAX, 0, u64::MAX, 1), None);
        assert_eq!(apply_disburse(u64::MAX, u64::MAX - 1, 1, 1), None);
    }

    #[test]
    fn disburse_never_exceeds_deposited() {
        // Property spot-check: new disbursed <= deposited whenever Some.
        for &(dep, dis, amt, fee) in &[
            (100u64, 0u64, 50u64, 0u64),
            (100, 50, 30, 20),
            (1, 0, 1, 0),
            (u64::MAX, 1000, 1000, 1000),
        ] {
            if let Some(new) = apply_disburse(dep, dis, amt, fee) {
                assert!(new <= dep, "solvency broken: {new} > {dep}");
                assert!(new >= dis, "disbursed went backwards");
            }
        }
    }

    #[test]
    fn nonce_monotonic() {
        assert!(nonce_ok(0, 1));
        assert!(nonce_ok(5, 6));
        assert!(!nonce_ok(5, 5)); // replay
        assert!(!nonce_ok(5, 4)); // stale
    }
}

// --- Formal verification harnesses (run with `cargo kani`) ---
// These encode the escrow invariants over symbolic inputs. They are gated on
// cfg(kani) so they never affect normal builds or `cargo test`.
#[cfg(kani)]
mod proofs {
    use super::*;

    /// SOLVENCY: a successful disburse can never push `disbursed` past
    /// `deposited`, and `disbursed` is monotonically non-decreasing.
    #[kani::proof]
    fn disburse_preserves_solvency() {
        let deposited: u64 = kani::any();
        let disbursed: u64 = kani::any();
        let amount: u64 = kani::any();
        let fee: u64 = kani::any();
        // Precondition: accounting is consistent on entry.
        kani::assume(disbursed <= deposited);

        if let Some(new_disbursed) = apply_disburse(deposited, disbursed, amount, fee) {
            assert!(new_disbursed <= deposited);
            assert!(new_disbursed >= disbursed);
        }
    }

    /// NO-OVERSPEND: the amount released to recipient + fee never exceeds the
    /// balance available at the time of the call.
    #[kani::proof]
    fn disburse_never_overspends() {
        let deposited: u64 = kani::any();
        let disbursed: u64 = kani::any();
        let amount: u64 = kani::any();
        let fee: u64 = kani::any();
        kani::assume(disbursed <= deposited);

        if apply_disburse(deposited, disbursed, amount, fee).is_some() {
            let avail = deposited - disbursed;
            // amount + fee did not overflow and is within balance.
            let total = amount.checked_add(fee).unwrap();
            assert!(total <= avail);
        }
    }

    /// REPLAY-SAFETY: accepting a nonce implies it is strictly greater than the
    /// last, so a replayed or stale nonce is always rejected.
    #[kani::proof]
    fn nonce_rejects_replay() {
        let last: u64 = kani::any();
        let candidate: u64 = kani::any();
        if nonce_ok(last, candidate) {
            assert!(candidate > last);
        } else {
            assert!(candidate <= last);
        }
    }
}
