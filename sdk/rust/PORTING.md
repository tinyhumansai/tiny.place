# Rust SDK porting conventions

This crate is a faithful Rust port of the TypeScript SDK at
`frontend/sdk/typescript/`. It is an **async REST wrapper** (`reqwest` + `tokio`).

## What to port and what to SKIP

- **Port** every plain REST method on each API class.
- **KEEP CURRENT** Signal / end-to-end encryption primitives under `src/signal/`.
  Port plain REST methods independently from that layer unless the TS method is
  explicitly part of transparent encrypted messaging.
- **PORT** WebSocket streaming (`stream()` / `live()`, i.e. any method whose TS
  body is `this.wsFactory?.(...)`). Instead of a `wsFactory` constructor param,
  return a `crate::ws::WebSocketStream` built from `self.http` — e.g.
  `WebSocketStream::new(&self.http, &path, directory_auth)`. The method is **not**
  `async` (it returns a builder; `connect()` is the async step). Pass
  `directory_auth = true` for agent-scoped streams the TS code calls with
  `{ directoryAuth: true }`; build any query string with `crate::ws::query_suffix`.
  `mcp.stream` is HTTP/SSE (not a WebSocket) and stays a REST helper.
- **SKIP** on-chain Solana transaction *execution* helpers — anything that calls
  `executeSolanaPayment` / `executeSolanaX402Payment` or otherwise builds and
  submits a Solana transaction (e.g. `registerWithSolanaPayment`,
  `purchaseWithSolana`). Keep the plain REST counterpart (e.g. `register`).
- **KEEP** methods that only *build/sign an x402 payment map* and POST it — use
  the `crate::x402` helpers (`build_x402_payment_map`, etc.).

## Core API you build on

`crate::http::HttpClient` (held by every API struct as `http: HttpClient`,
`HttpClient` is `Clone`). Method → use this helper:

| TS `http.*`                  | Rust `self.http.*`                                  |
| ---------------------------- | --------------------------------------------------- |
| `get`                        | `get::<T>(path, query)`                             |
| `getAuth`                    | `get_auth::<T>(path, query)`                        |
| `getAdmin`                   | `get_admin::<T>(path, query)`                       |
| `getText`                    | `get_text(path, query) -> String`                  |
| `getDirectoryAuth`           | `get_directory_auth::<T>(path, query)`             |
| `getDirectoryAuthAs`         | `get_directory_auth_as::<T>(path, actor, query)`   |
| `getAgentAuth`               | `get_agent_auth::<T>(path, query)`                 |
| `post`                       | `post::<T, B>(path, body)`                          |
| `postPublic`                 | `post_public::<T, B>(path, body)`                  |
| `postAdmin`                  | `post_admin::<T, B>(path, body)`                   |
| `postDirectoryAuth`          | `post_directory_auth::<T, B>(path, body)`         |
| `postDirectoryAuthAs`        | `post_directory_auth_as::<T, B>(path, actor, body)`|
| `put`                        | `put::<T, B>(path, body)`                           |
| `putAdmin`                   | `put_admin::<T, B>(path, body)`                    |
| `putDirectoryAuth`           | `put_directory_auth::<T, B>(path, body)`          |
| `putDirectoryAuthAs`         | `put_directory_auth_as::<T, B>(path, actor, body)`|
| `putAgentAuth`               | `put_agent_auth::<T, B>(path, body)`              |
| `delete`                     | `delete::<T, B>(path, body)`                        |
| `deletePublic`               | `delete_public::<T, B>(path, body, headers)`       |
| `deleteAdmin`                | `delete_admin::<T, B>(path, body)`                |
| `deleteDirectoryAuth`        | `delete_directory_auth::<T, B>(path, body)`       |
| `deleteDirectoryAuthAs`      | `delete_directory_auth_as::<T, B>(path, actor, body)`|
| `deleteAgentAuth`            | `delete_agent_auth::<T, B>(path, body)`           |
| `getRaw`/`*Raw`              | `get_raw` / `post_public_raw` / `get_auth_raw` etc → `reqwest::Response` |

All are `async` and return `crate::error::Result<T>` (`T: serde::de::DeserializeOwned`).

### Bodies and queries

- **Query params**: build `let q: Vec<(String, String)> = vec![("limit".into(), n.to_string())];`
  and pass `&q`. For no query, pass `&[]`. Arrays → push the key multiple times.
  Only include a param when the TS code includes it (skip `undefined`).
- **Bodies** are `Option<&B> where B: Serialize`:
  - TS passes an object → define a request struct and pass `Some(&body)`.
  - TS passes `{}` (empty object) → pass `Some(&serde_json::json!({}))`
    (the empty body is signed, so it must serialize to `{}`, not be omitted).
  - TS passes nothing / `undefined` → pass `None::<&serde_json::Value>`, e.g.
    `self.http.post::<RetType, serde_json::Value>(path, None).await`.
- **Path params**: percent-encode with `crate::util::encode(seg)` — add this tiny
  helper if not present (see below). Mirror `encodeURIComponent(...)`.

### Signing canonical payloads inside a method

Some TS methods sign a `canonicalPayload(...)` with the signing key and put the
result in a request field or header. In Rust:

```rust
use crate::auth::sign_fresh_canonical_payload;
use crate::crypto::canonical_payload;

if let Some(signer) = self.http.signer() {
    let payload = canonical_payload("identity.renew", serde_json::json!({ "username": name }));
    let signature = sign_fresh_canonical_payload(signer.as_ref(), &payload).await?;
    // set body.signature = Some(signature) or headers
}
```

`self.http.signing_public_key() -> Option<String>` is also available (for the
`X-TinyPlace-Public-Key` header some delete methods add).

## File layout & style

- API module → `src/api/<name>.rs`. One public struct `pub struct <Name>Api { http: HttpClient }`
  with `pub(crate) fn new(http: HttpClient) -> Self { Self { http } }` and one async
  method per TS method.
- Types → `src/types/<name>.rs`. Start each types file with:
  ```rust
  use serde::{Deserialize, Serialize};
  #[allow(unused_imports)]
  use super::*; // sibling types share a flat namespace, like the TS barrel
  ```
  Use `std::collections::HashMap` where needed.
- Derive on every type: `#[derive(Debug, Clone, Serialize, Deserialize)]` and
  `#[serde(rename_all = "camelCase")]`. Rust fields are snake_case.
- Optional TS fields (`field?: T`) → `Option<T>` with
  `#[serde(skip_serializing_if = "Option::is_none", default)]`.
- TS `unknown` / `Record<string, unknown>` / `any` → `serde_json::Value`.
  `Record<string, string>` → `HashMap<String, String>`. `string[]` → `Vec<String>`.
  Integer counts → `i64`; decimals → `f64`; monetary amounts are usually strings
  in this API → `String`. When in doubt use `serde_json::Value`.
- **Keep Rust struct names identical to the TS interface names** (PascalCase) so
  cross-module references (`crate::types::SomeType`) line up. Reference types from
  other modules as `crate::types::TheType` (everything is re-exported flat).
- Mirror the TS doc-comments as `///` where they add value. Match endpoint paths
  and auth modes EXACTLY.

Do not edit `src/api/mod.rs`, `src/types/mod.rs`, `src/client.rs`, or `src/lib.rs`
— the integrator wires those up.
