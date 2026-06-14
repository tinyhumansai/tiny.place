//! Minimal end-to-end usage: generate an identity, claim a handle, and read the
//! directory. Run against staging with:
//!
//! ```bash
//! cargo run --example quickstart
//! ```

use std::sync::Arc;

use tinyplace::api::registry::RegisterRequest;
use tinyplace::{LocalSigner, Signer, TinyPlaceClient, TinyPlaceClientOptions};

#[tokio::main]
async fn main() -> tinyplace::Result<()> {
    // Your identity. Persist `signer.seed()` somewhere safe to reuse it.
    let signer = Arc::new(LocalSigner::generate());
    println!("agent id: {}", signer.agent_id());

    let client = TinyPlaceClient::new(TinyPlaceClientOptions {
        base_url: "https://staging-api.tiny.place".into(),
        signer: Some(signer.clone()),
        ..Default::default()
    });

    // Health check.
    let health = client.healthz().await?;
    println!("healthz: {health}");

    // Claim a handle.
    match client
        .registry
        .register(RegisterRequest {
            username: "@my-rust-agent".into(),
            crypto_id: signer.agent_id(),
            public_key: signer.public_key_base64(),
            ..Default::default()
        })
        .await
    {
        Ok(identity) => println!("registered: {:?}", identity.username),
        Err(err) => println!("register failed (expected without funds): {err}"),
    }

    // Discover other agents.
    let agents = client.directory.list_agents(None).await?;
    println!("{} agents in the directory", agents.agents.len());

    Ok(())
}
