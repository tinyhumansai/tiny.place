// The generic `to_value(client.x.method().await?)` helpers below trip the
// edition-2024 never-type-fallback forward-compat lint: the `?` lets `!` fall
// back to `()`, which is correct under this crate's 2021 edition. Suppress it
// here until the crate migrates to edition 2024 (which will require explicit
// type annotations at these call sites).
#![allow(dependency_on_unit_never_type_fallback)]

use std::sync::Arc;

use serde::Serialize;
use serde_json::{json, Value};
use tinyplace::api::pricing::QuoteParams;
use tinyplace::types::GroupQueryParams;
use tinyplace::{LocalSigner, Signer, TinyPlaceClient};

use crate::args::{Cli, Command, PricingCommand};
use crate::{config, context, output};

#[derive(Debug)]
pub struct CliError {
    message: String,
    code: &'static str,
}

impl CliError {
    fn arg(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            code: "bad_request",
        }
    }

    fn config(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            code: "config_error",
        }
    }

    pub fn to_stderr_json(&self) -> String {
        let body = json!({ "error": self.message, "code": self.code });
        let mut out = serde_json::to_string_pretty(&body).unwrap_or_else(|_| body.to_string());
        out.push('\n');
        out
    }
}

impl From<tinyplace::Error> for CliError {
    fn from(err: tinyplace::Error) -> Self {
        Self {
            message: err.to_string(),
            code: "sdk_error",
        }
    }
}

fn to_value<T: Serialize>(value: T) -> Result<Value, CliError> {
    serde_json::to_value(value)
        .map_err(|err| CliError::config(format!("could not encode response: {err}")))
}

fn client_for(
    endpoint: Option<&str>,
) -> Result<(TinyPlaceClient, Option<Arc<dyn Signer>>), CliError> {
    let resolved = config::resolve(endpoint).map_err(CliError::config)?;
    context::build(&resolved).map_err(CliError::config)
}

fn whoami(endpoint: Option<&str>) -> Result<Value, CliError> {
    let (_client, signer) = client_for(endpoint)?;
    let signer = signer.ok_or_else(|| {
        CliError::arg(
            "no identity configured — set $TINYPLACE_SECRET_KEY or `secretKey` in the config",
        )
    })?;
    Ok(json!({
        "agentId": signer.agent_id(),
        "publicKey": signer.public_key_base64(),
    }))
}

fn debug(endpoint: Option<&str>) -> Result<Value, CliError> {
    let resolved = config::resolve(endpoint).map_err(CliError::config)?;
    let agent_id = resolved
        .seed
        .as_ref()
        .and_then(|seed| LocalSigner::from_seed(seed).ok())
        .map(|signer| signer.agent_id());
    Ok(json!({
        "version": env!("CARGO_PKG_VERSION"),
        "endpoint": resolved.endpoint,
        "configPath": resolved.config_path.display().to_string(),
        "hasKey": resolved.seed.is_some(),
        "agentId": agent_id,
    }))
}

async fn run_pricing(
    client: &TinyPlaceClient,
    command: &PricingCommand,
) -> Result<Value, CliError> {
    match command {
        PricingCommand::Assets => to_value(client.pricing.assets().await?),
        PricingCommand::Pairs => to_value(client.pricing.pairs().await?),
        PricingCommand::Networks => to_value(client.pricing.networks().await?),
        PricingCommand::Quote {
            base,
            quote,
            network,
        } => {
            let params = QuoteParams {
                base: base.clone(),
                quote: quote.clone(),
                network: network.clone(),
            };
            to_value(client.pricing.quote(&params).await?)
        }
        PricingCommand::Gas { network } => to_value(client.pricing.gas(network).await?),
    }
}

/// Dispatch the commands that talk to the API, given an already-built client.
/// Kept separate from [`run`] so it can be exercised against a mock server.
async fn run_api_command(client: &TinyPlaceClient, command: &Command) -> Result<Value, CliError> {
    match command {
        Command::Lookup { handle } => to_value(client.registry.get(handle).await?),
        Command::Groups { q, tag, limit } => {
            let params = GroupQueryParams {
                q: q.clone(),
                tag: tag.clone(),
                limit: *limit,
                ..Default::default()
            };
            to_value(client.groups.list(Some(&params)).await?)
        }
        Command::Pricing { command } => run_pricing(client, command).await,
        Command::Version | Command::Whoami | Command::Debug => {
            Err(CliError::arg("not an API command"))
        }
    }
}

pub async fn run(cli: Cli) -> Result<String, CliError> {
    let format = cli.output_format();
    let endpoint = cli.endpoint.as_deref();

    let value = match &cli.command {
        Command::Version => json!({ "version": env!("CARGO_PKG_VERSION") }),
        Command::Whoami => whoami(endpoint)?,
        Command::Debug => debug(endpoint)?,
        command => {
            let (client, _signer) = client_for(endpoint)?;
            run_api_command(&client, command).await?
        }
    };

    Ok(output::render(&value, format))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tinyplace::TinyPlaceClientOptions;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn mock_client(server: &MockServer) -> TinyPlaceClient {
        TinyPlaceClient::new(TinyPlaceClientOptions {
            base_url: server.uri(),
            ..Default::default()
        })
    }

    #[tokio::test]
    async fn lookup_renders_registry_response() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/registry/names/alice"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(json!({ "available": false, "name": "alice" })),
            )
            .mount(&server)
            .await;

        let value = run_api_command(
            &mock_client(&server),
            &Command::Lookup {
                handle: "alice".into(),
            },
        )
        .await
        .expect("lookup should succeed against the mock");

        assert_eq!(value["name"], "alice");
        assert_eq!(value["available"], false);
    }

    #[tokio::test]
    async fn pricing_networks_renders_array() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/pricing/networks"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "networks": [] })))
            .mount(&server)
            .await;

        let value = run_api_command(
            &mock_client(&server),
            &Command::Pricing {
                command: PricingCommand::Networks,
            },
        )
        .await
        .expect("pricing networks should succeed against the mock");

        assert!(value["networks"].is_array(), "got: {value}");
    }

    #[tokio::test]
    async fn sdk_http_error_maps_to_sdk_error_code() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/registry/names/ghost"))
            .respond_with(ResponseTemplate::new(404).set_body_json(json!({ "error": "nope" })))
            .mount(&server)
            .await;

        let err = run_api_command(
            &mock_client(&server),
            &Command::Lookup {
                handle: "ghost".into(),
            },
        )
        .await
        .expect_err("a 404 should surface as an error");

        assert_eq!(err.code, "sdk_error");
    }
}
