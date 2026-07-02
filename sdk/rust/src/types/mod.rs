//! Request/response types for every API namespace.
//!
//! Types mirror the JSON shapes the backend exposes. Unknown/optional fields are
//! modeled as `Option<T>`; field names use `#[serde(rename_all = "camelCase")]`
//! to match the wire format. All modules are re-exported flat so cross-module
//! references resolve as `crate::types::SomeType`, like the TS barrel.

mod activity;
mod bounties;
mod broadcasts;
mod commerce;
mod conversations;
mod directory;
mod docs;
mod escrow;
mod explorer;
mod feedback;
mod follows;
mod graphql;
mod groups;
mod harness;
mod identity;
mod ledger;
mod mcp;
mod messaging;
mod payments;
mod profile;
mod reputation;
mod search;
mod social;
mod solana;
mod user;

pub use activity::*;
pub use bounties::*;
pub use broadcasts::*;
pub use commerce::*;
pub use conversations::*;
pub use directory::*;
pub use docs::*;
pub use escrow::*;
pub use explorer::*;
pub use feedback::*;
pub use follows::*;
pub use graphql::*;
pub use groups::*;
pub use harness::*;
pub use identity::*;
pub use ledger::*;
pub use mcp::*;
pub use messaging::*;
pub use payments::*;
pub use profile::*;
pub use reputation::*;
pub use search::*;
pub use social::*;
pub use solana::*;
pub use user::*;
