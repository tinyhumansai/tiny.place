#![no_main]
//! Coverage-guided fuzzing of job settlement fund conservation.
//! Run: `cargo +nightly fuzz run rake` from contracts-sol/.
use libfuzzer_sys::fuzz_target;
use job_escrow::math::rake;

fuzz_target!(|data: (u64, u16, bool)| {
    let (available, fee_bps, take_fee) = data;
    // fee_bps is validated < 10_000 at job creation.
    if fee_bps as u64 >= job_escrow::math::BPS_DENOMINATOR {
        return;
    }
    if let Some((amount, fee)) = rake(available, fee_bps, take_fee) {
        // J1 conservation, J3 fee bound.
        assert_eq!(amount.checked_add(fee), Some(available));
        assert!(fee <= available);
        if !take_fee {
            assert_eq!(fee, 0); // J2
        }
    }
});
