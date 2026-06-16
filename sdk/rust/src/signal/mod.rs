//! Signal protocol end-to-end encryption, ported from
//! `sdk/typescript/src/signal/` and kept byte-compatible for cross-language
//! interop with the TS and Python SDKs.
//!
//! Built up in parts (see issue #18): this is part 1, the crypto primitives.

pub mod crypto;
pub mod keys;
