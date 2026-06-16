#![no_main]
//! Coverage-guided fuzzing of the escrow solvency invariants.
//! Run: `cargo +nightly fuzz run disburse` from contracts-sol/.
use job_escrow::math::apply_disburse;
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: (u64, u64, u64, u64)| {
    let (deposited, disbursed, amount, fee) = data;
    // Precondition that always holds on-chain: disbursed never exceeds deposited.
    if disbursed > deposited {
        return;
    }
    if let Some(new) = apply_disburse(deposited, disbursed, amount, fee) {
        // E1 solvency + monotonicity.
        assert!(new <= deposited);
        assert!(new >= disbursed);
        // E2 no-overspend: amount + fee fit within the available balance.
        let total = amount.checked_add(fee).expect("accepted total must not overflow");
        assert!(total <= deposited - disbursed);
        assert_eq!(new, disbursed + total);
    }
});
