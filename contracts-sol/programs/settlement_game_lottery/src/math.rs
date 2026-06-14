//! Pure ticket arithmetic for lottery settlement, isolated for unit testing and
//! formal verification (Kani). The handlers call `tickets_for`, so the verified
//! logic is the deployed logic. See `contracts-sol/FORMAL_VERIFICATION.md`.
//!
//! The lottery's *payout curve* (which winners, how much each) is computed
//! off-chain by the trusted drawer and passed in as explicit amounts; the chain
//! only custodies funds and enforces solvency via `escrow::disburse`. So the
//! sole on-chain arithmetic is converting a USDC deposit into a whole ticket
//! count.

/// Convert a deposit `amount` (token base units) into a ticket count at
/// `ticket_price` base units per ticket.
///
/// Returns `None` if `ticket_price` is zero or `amount` is not a whole multiple
/// of `ticket_price` (partial tickets are rejected rather than truncated).
/// Guarantees (proven below): on `Some(tickets)`, `tickets * ticket_price ==
/// amount` exactly — no value is created or lost in the conversion.
#[inline]
pub fn tickets_for(amount: u64, ticket_price: u64) -> Option<u64> {
    if ticket_price == 0 {
        return None;
    }
    if amount % ticket_price != 0 {
        return None;
    }
    Some(amount / ticket_price)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn whole_multiples_mint_tickets() {
        // 1 USDC = 1_000_000 base units = 1 ticket.
        assert_eq!(tickets_for(5_000_000, 1_000_000), Some(5));
        assert_eq!(tickets_for(0, 1_000_000), Some(0));
        assert_eq!(tickets_for(1_000_000, 1_000_000), Some(1));
    }

    #[test]
    fn rejects_partial_tickets() {
        assert_eq!(tickets_for(1_500_000, 1_000_000), None);
        assert_eq!(tickets_for(1, 1_000_000), None);
    }

    #[test]
    fn rejects_zero_price() {
        assert_eq!(tickets_for(1_000_000, 0), None);
    }

    fn xorshift(state: &mut u64) -> u64 {
        let mut x = *state;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        *state = x;
        x
    }

    #[test]
    fn fuzz_tickets_conserve_value() {
        let mut s = 0x0123456789ABCDEFu64;
        for _ in 0..200_000 {
            let price = (xorshift(&mut s) % 1_000_000).saturating_add(1);
            let tickets = xorshift(&mut s) % 10_000;
            let amount = tickets * price;
            assert_eq!(
                tickets_for(amount, price),
                Some(tickets),
                "exact multiples must round-trip"
            );
        }
    }
}

#[cfg(kani)]
mod proofs {
    use super::*;

    /// CONSERVATION: a successful conversion is exact — the minted tickets
    /// times the price equal the deposited amount, so no value is created or
    /// lost.
    #[kani::proof]
    fn tickets_for_conserves_value() {
        let amount: u64 = kani::any();
        let ticket_price: u64 = kani::any();

        if let Some(tickets) = tickets_for(amount, ticket_price) {
            assert!(tickets.checked_mul(ticket_price) == Some(amount));
        }
    }
}
