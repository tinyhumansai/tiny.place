//! Signal protocol end-to-end encryption, ported from
//! `sdk/typescript/src/signal/` and kept byte-compatible for cross-language
//! interop with the TS and Python SDKs.
//!
//! Built up in parts (see issue #18): crypto primitives, key management,
//! session store, and X3DH key agreement.

pub mod crypto;
pub mod keys;
pub mod memory_store;
pub mod ratchet;
pub mod session;
pub mod store;
pub mod x3dh;
