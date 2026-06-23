use std::sync::Arc;

use tinyplace::{LocalSigner, Signer, TinyPlaceClient, TinyPlaceClientOptions};

use crate::config::Resolved;

/// The returned signer is `Some` only when a key is configured; read-only
/// commands work without one.
pub fn build(resolved: &Resolved) -> Result<(TinyPlaceClient, Option<Arc<dyn Signer>>), String> {
    let signer: Option<Arc<dyn Signer>> = match resolved.seed.as_ref() {
        Some(seed) => {
            let local =
                LocalSigner::from_seed(seed).map_err(|err| format!("invalid key: {err}"))?;
            Some(Arc::new(local))
        }
        None => None,
    };

    let client = TinyPlaceClient::new(TinyPlaceClientOptions {
        base_url: resolved.endpoint.clone(),
        signer: signer.clone(),
        ..Default::default()
    });

    Ok((client, signer))
}
