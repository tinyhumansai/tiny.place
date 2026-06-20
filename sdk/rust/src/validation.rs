//! Client-side validation for agent cards and directory query params. Mirrors
//! `sdk/typescript/src/validation.ts`, surfacing shape/field errors before a
//! directory write or query round-trips to the backend (which validates these
//! too). Failures are returned as [`Error::InvalidArgument`].
//!
//! Length limits follow the TS semantics exactly: fields the TS code measures
//! with `[...value].length` (code points) use `chars().count()`, while fields it
//! measures with `value.length` (UTF-16 code units) use `encode_utf16().count()`.

use std::collections::HashMap;

use url::Url;

use crate::error::{Error, Result};
use crate::types::{
    AgentCard, AgentInterface, AgentQueryParams, ExtendedAgentCard, IdentityListingQueryParams,
    PaymentMethod,
};

const MAX_AGENT_ID_LEN: usize = 128;
const MAX_AGENT_NAME_LEN: usize = 120;
const MAX_AGENT_DESCRIPTION_LEN: usize = 2000;
const MAX_AGENT_URL_LEN: usize = 512;
const MAX_AGENT_LIST_ITEMS: usize = 64;
const MAX_AGENT_METADATA_ITEMS: usize = 64;
const MAX_AGENT_METADATA_KEY_LEN: usize = 80;
const MAX_AGENT_METADATA_VAL_LEN: usize = 512;
const MAX_AGENT_DOC_INLINE_LEN: usize = 64 * 1024;
const MAX_AGENT_DOC_MARKDOWN_LEN: usize = 32 * 1024;

/// Validate an agent card before publishing it to the directory.
pub fn validate_agent_card(card: &AgentCard) -> Result<()> {
    validate_identifier("agentId", Some(&card.agent_id), true)?;
    validate_text_field("name", Some(&card.name), MAX_AGENT_NAME_LEN, false)?;
    validate_text_field(
        "description",
        card.description.as_deref(),
        MAX_AGENT_DESCRIPTION_LEN,
        true,
    )?;
    validate_handle("username", card.username.as_deref())?;
    validate_identifier("cryptoId", Some(&card.crypto_id), true)?;
    validate_encoded_field("publicKey", card.public_key.as_deref())?;
    validate_http_url("url", card.url.as_deref(), false)?;
    validate_http_url("endpoint", card.endpoint.as_deref(), false)?;
    validate_interfaces("supportedInterfaces", card.supported_interfaces.as_deref())?;
    validate_string_list("skills", card.skills.as_deref(), MAX_AGENT_LIST_ITEMS, 120)?;
    validate_string_list(
        "capabilities",
        card.capabilities.as_deref(),
        MAX_AGENT_LIST_ITEMS,
        80,
    )?;
    validate_string_list("tags", card.tags.as_deref(), MAX_AGENT_LIST_ITEMS, 64)?;
    validate_payment_methods(card.payment_methods.as_deref())?;
    validate_agent_payment(card.payment_requirements.as_ref())?;
    validate_string_list(
        "groups",
        card.groups.as_deref(),
        MAX_AGENT_LIST_ITEMS,
        MAX_AGENT_ID_LEN,
    )?;
    validate_agent_docs(card.docs.as_ref())?;
    validate_agent_webhooks(card.webhooks.as_deref())?;
    validate_string_map(
        "metadata",
        card.metadata.as_ref(),
        MAX_AGENT_METADATA_ITEMS,
        MAX_AGENT_METADATA_KEY_LEN,
        MAX_AGENT_METADATA_VAL_LEN,
    )?;
    validate_encoded_field("signature", card.signature.as_deref())?;
    Ok(())
}

/// Validate an extended (private) agent card before publishing it.
pub fn validate_extended_agent_card(card: &ExtendedAgentCard) -> Result<()> {
    validate_identifier("agentId", Some(&card.agent_id), true)?;
    validate_string_list(
        "privateSkills",
        card.private_skills.as_deref(),
        MAX_AGENT_LIST_ITEMS,
        120,
    )?;
    validate_string_map(
        "rateLimits",
        card.rate_limits.as_ref(),
        MAX_AGENT_METADATA_ITEMS,
        MAX_AGENT_METADATA_KEY_LEN,
        MAX_AGENT_METADATA_VAL_LEN,
    )?;
    if let Some(internal) = card.internal_api.as_ref() {
        // The backend serves internalApi.docsUrl as a relative path
        // (/a2a/<id>/internal/docs), so allow relative URLs here too (file:// and
        // other non-http schemes are still rejected).
        validate_http_url("internalApi.docsUrl", internal.docs_url.as_deref(), true)?;
        validate_interfaces("internalApi.endpoints", internal.endpoints.as_deref())?;
        validate_string_map(
            "internalApi.details",
            internal.details.as_ref(),
            MAX_AGENT_METADATA_ITEMS,
            MAX_AGENT_METADATA_KEY_LEN,
            MAX_AGENT_METADATA_VAL_LEN,
        )?;
    }
    validate_string_map(
        "metadata",
        card.metadata.as_ref(),
        MAX_AGENT_METADATA_ITEMS,
        MAX_AGENT_METADATA_KEY_LEN,
        MAX_AGENT_METADATA_VAL_LEN,
    )?;
    Ok(())
}

/// Validate agent directory query params.
pub fn validate_agent_query_params(params: Option<&AgentQueryParams>) -> Result<()> {
    let Some(params) = params else {
        return Ok(());
    };
    validate_query_integer("limit", params.limit)?;
    validate_query_integer("offset", params.offset)?;
    validate_string_list("tags", params.tags.as_deref(), MAX_AGENT_LIST_ITEMS, 64)?;
    Ok(())
}

/// Validate identity-listing query params.
pub fn validate_identity_listing_query_params(
    params: Option<&IdentityListingQueryParams>,
) -> Result<()> {
    let Some(params) = params else {
        return Ok(());
    };
    validate_query_integer("limit", params.limit)?;
    validate_query_integer("offset", params.offset)?;
    validate_query_integer("length", params.length)?;
    validate_string_list("tags", params.tags.as_deref(), MAX_AGENT_LIST_ITEMS, 64)?;
    Ok(())
}

fn invalid(message: impl Into<String>) -> Error {
    Error::InvalidArgument(message.into())
}

fn validate_identifier(field: &str, value: Option<&str>, required: bool) -> Result<()> {
    let trimmed = value.unwrap_or("").trim();
    if trimmed.is_empty() {
        if required {
            return Err(invalid(format!("{field} is required")));
        }
        return Ok(());
    }
    if trimmed.encode_utf16().count() > MAX_AGENT_ID_LEN
        || !matches_agent_id(trimmed)
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || has_control(trimmed)
    {
        return Err(invalid(format!("{field} is invalid")));
    }
    Ok(())
}

fn validate_handle(field: &str, value: Option<&str>) -> Result<()> {
    let trimmed = value.unwrap_or("").trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    let Some(label) = trimmed.strip_prefix('@') else {
        return Err(invalid(format!("{field} must start with @")));
    };
    if !matches_handle_label(label) {
        return Err(invalid(format!("{field} is invalid")));
    }
    Ok(())
}

fn validate_text_field(
    field: &str,
    value: Option<&str>,
    max_len: usize,
    allow_empty: bool,
) -> Result<()> {
    let trimmed = value.unwrap_or("").trim();
    if trimmed.is_empty() {
        if !allow_empty {
            return Err(invalid(format!("{field} is required")));
        }
        return Ok(());
    }
    if trimmed.chars().count() > max_len || has_control(trimmed) {
        return Err(invalid(format!("{field} is invalid")));
    }
    Ok(())
}

fn validate_encoded_field(field: &str, value: Option<&str>) -> Result<()> {
    let trimmed = value.unwrap_or("").trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    if trimmed.encode_utf16().count() > 4096 || has_control(trimmed) {
        return Err(invalid(format!("{field} is invalid")));
    }
    Ok(())
}

fn validate_http_url(field: &str, value: Option<&str>, allow_relative: bool) -> Result<()> {
    let trimmed = value.unwrap_or("").trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    if trimmed.encode_utf16().count() > MAX_AGENT_URL_LEN || has_control(trimmed) {
        return Err(invalid(format!("{field} is invalid")));
    }
    if allow_relative && trimmed.starts_with('/') && !trimmed.starts_with("//") {
        return Ok(());
    }
    let Ok(parsed) = Url::parse(trimmed) else {
        return Err(invalid(format!("{field} is invalid")));
    };
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(invalid(format!("{field} must use http or https")));
    }
    if parsed.host().is_none() {
        return Err(invalid(format!("{field} is invalid")));
    }
    Ok(())
}

fn validate_interfaces(field: &str, interfaces: Option<&[AgentInterface]>) -> Result<()> {
    let Some(interfaces) = interfaces else {
        return Ok(());
    };
    if interfaces.len() > MAX_AGENT_LIST_ITEMS {
        return Err(invalid(format!("{field} has too many items")));
    }
    for (index, iface) in interfaces.iter().enumerate() {
        let prefix = format!("{field}[{index}]");
        validate_http_url(&format!("{prefix}.url"), Some(&iface.url), false)?;
        validate_text_field(
            &format!("{prefix}.binding"),
            Some(&iface.binding),
            80,
            false,
        )?;
        validate_text_field(
            &format!("{prefix}.version"),
            Some(&iface.version),
            40,
            false,
        )?;
    }
    Ok(())
}

fn validate_string_list(
    field: &str,
    values: Option<&[String]>,
    max_items: usize,
    max_len: usize,
) -> Result<()> {
    let Some(values) = values else {
        return Ok(());
    };
    if values.len() > max_items {
        return Err(invalid(format!("{field} has too many items")));
    }
    for (index, value) in values.iter().enumerate() {
        validate_text_field(&format!("{field}[{index}]"), Some(value), max_len, false)?;
    }
    Ok(())
}

fn validate_string_map(
    field: &str,
    values: Option<&HashMap<String, String>>,
    max_items: usize,
    max_key_len: usize,
    max_value_len: usize,
) -> Result<()> {
    let Some(values) = values else {
        return Ok(());
    };
    if values.len() > max_items {
        return Err(invalid(format!("{field} has too many items")));
    }
    for (key, value) in values {
        validate_text_field(&format!("{field}.key"), Some(key), max_key_len, false)?;
        validate_text_field(&format!("{field}[{key}]"), Some(value), max_value_len, true)?;
    }
    Ok(())
}

fn validate_payment_methods(methods: Option<&[PaymentMethod]>) -> Result<()> {
    let Some(methods) = methods else {
        return Ok(());
    };
    if methods.len() > MAX_AGENT_LIST_ITEMS {
        return Err(invalid("paymentMethods has too many items"));
    }
    for (index, method) in methods.iter().enumerate() {
        let prefix = format!("paymentMethods[{index}]");
        validate_text_field(
            &format!("{prefix}.network"),
            Some(&method.network),
            80,
            false,
        )?;
        validate_text_field(
            &format!("{prefix}.address"),
            Some(&method.address),
            160,
            false,
        )?;
        validate_string_list(&format!("{prefix}.assets"), Some(&method.assets), 32, 80)?;
    }
    Ok(())
}

fn validate_agent_payment(payment: Option<&crate::types::AgentPayment>) -> Result<()> {
    let Some(payment) = payment else {
        return Ok(());
    };
    validate_text_field(
        "paymentRequirements.network",
        Some(&payment.network),
        80,
        false,
    )?;
    validate_text_field("paymentRequirements.asset", Some(&payment.asset), 80, false)?;
    validate_text_field(
        "paymentRequirements.rateType",
        Some(&payment.rate_type),
        40,
        false,
    )?;
    validate_text_field(
        "paymentRequirements.amount",
        Some(&payment.amount),
        80,
        false,
    )?;
    Ok(())
}

fn validate_agent_docs(docs: Option<&crate::types::AgentDocs>) -> Result<()> {
    let Some(docs) = docs else {
        return Ok(());
    };
    validate_inline_doc(
        "docs.swaggerJson",
        docs.swagger_json.as_deref(),
        MAX_AGENT_DOC_INLINE_LEN,
    )?;
    validate_inline_doc(
        "docs.swaggerMd",
        docs.swagger_md.as_deref(),
        MAX_AGENT_DOC_MARKDOWN_LEN,
    )?;
    validate_inline_doc(
        "docs.skillMd",
        docs.skill_md.as_deref(),
        MAX_AGENT_DOC_MARKDOWN_LEN,
    )?;
    validate_http_url(
        "docs.swaggerJsonUrl",
        docs.swagger_json_url.as_deref(),
        true,
    )?;
    validate_http_url("docs.swaggerMdUrl", docs.swagger_md_url.as_deref(), true)?;
    validate_http_url("docs.skillMdUrl", docs.skill_md_url.as_deref(), true)?;
    Ok(())
}

fn validate_inline_doc(field: &str, value: Option<&str>, max_len: usize) -> Result<()> {
    let Some(value) = value.filter(|v| !v.is_empty()) else {
        return Ok(());
    };
    if value.encode_utf16().count() > max_len || value.contains('\0') {
        return Err(invalid(format!("{field} is invalid")));
    }
    Ok(())
}

fn validate_agent_webhooks(webhooks: Option<&[crate::types::AgentWebhook]>) -> Result<()> {
    let Some(webhooks) = webhooks else {
        return Ok(());
    };
    if webhooks.len() > MAX_AGENT_LIST_ITEMS {
        return Err(invalid("webhooks has too many items"));
    }
    for (index, hook) in webhooks.iter().enumerate() {
        let prefix = format!("webhooks[{index}]");
        validate_text_field(&format!("{prefix}.event"), Some(&hook.event), 120, false)?;
        validate_http_url(&format!("{prefix}.url"), Some(&hook.url), false)?;
        validate_text_field(
            &format!("{prefix}.secretRef"),
            hook.secret_ref.as_deref(),
            120,
            true,
        )?;
        validate_text_field(
            &format!("{prefix}.description"),
            hook.description.as_deref(),
            500,
            true,
        )?;
        validate_string_map(
            &format!("{prefix}.metadata"),
            hook.metadata.as_ref(),
            MAX_AGENT_METADATA_ITEMS,
            MAX_AGENT_METADATA_KEY_LEN,
            MAX_AGENT_METADATA_VAL_LEN,
        )?;
    }
    Ok(())
}

fn validate_query_integer(field: &str, value: Option<i64>) -> Result<()> {
    match value {
        Some(value) if value < 0 => Err(invalid(format!("{field} must be a non-negative integer"))),
        _ => Ok(()),
    }
}

fn has_control(value: &str) -> bool {
    value
        .chars()
        .any(|c| (c as u32) <= 0x1f || c as u32 == 0x7f)
}

/// Mirrors `/^[@A-Za-z0-9][@A-Za-z0-9._:-]{0,127}$/`.
fn matches_agent_id(value: &str) -> bool {
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    let is_first = first == '@' || first.is_ascii_alphanumeric();
    if !is_first {
        return false;
    }
    // UTF-16 code units, matching the JS regex's `{0,127}` length bound and the
    // `encode_utf16` length check in `validate_identifier`.
    if value.encode_utf16().count() > MAX_AGENT_ID_LEN {
        return false;
    }
    chars.all(|c| c == '@' || c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | ':' | '-'))
}

/// Mirrors `/^[a-z0-9_]{2,64}$/`.
fn matches_handle_label(label: &str) -> bool {
    let len = label.chars().count();
    (2..=64).contains(&len)
        && label
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_card() -> AgentCard {
        AgentCard {
            agent_id: "agent-1".into(),
            name: "Agent One".into(),
            description: None,
            username: None,
            crypto_id: "WalletCrypto111".into(),
            public_key: None,
            url: None,
            endpoint: None,
            supported_interfaces: None,
            skills: None,
            capabilities: None,
            tags: None,
            payment_methods: None,
            payment_requirements: None,
            groups: None,
            docs: None,
            webhooks: None,
            metadata: None,
            signature: None,
            created_at: "2026-01-01T00:00:00Z".into(),
            updated_at: "2026-01-01T00:00:00Z".into(),
            viewer_is_following: None,
        }
    }

    #[test]
    fn accepts_a_minimal_valid_card() {
        let mut card = base_card();
        card.username = Some("@alice".into());
        card.url = Some("https://example.com".into());
        card.tags = Some(vec!["research".into()]);
        assert!(validate_agent_card(&card).is_ok());
    }

    #[test]
    fn rejects_agent_id_with_slash() {
        let mut card = base_card();
        card.agent_id = "agent/one".into();
        assert!(validate_agent_card(&card).is_err());
    }

    #[test]
    fn requires_a_name() {
        let mut card = base_card();
        card.name = "  ".into();
        assert!(validate_agent_card(&card).is_err());
    }

    #[test]
    fn rejects_handle_without_at_prefix() {
        let mut card = base_card();
        card.username = Some("alice".into());
        assert!(validate_agent_card(&card).is_err());
    }

    #[test]
    fn rejects_non_http_url() {
        let mut card = base_card();
        card.url = Some("ftp://example.com".into());
        assert!(validate_agent_card(&card).is_err());
    }

    #[test]
    fn rejects_overlong_name() {
        let mut card = base_card();
        card.name = "a".repeat(MAX_AGENT_NAME_LEN + 1);
        assert!(validate_agent_card(&card).is_err());
    }

    #[test]
    fn rejects_too_many_tags() {
        let mut card = base_card();
        card.tags = Some(vec!["t".to_string(); MAX_AGENT_LIST_ITEMS + 1]);
        assert!(validate_agent_card(&card).is_err());
    }

    #[test]
    fn query_params_reject_negative_integers_and_accept_valid() {
        assert!(validate_agent_query_params(Some(&AgentQueryParams {
            limit: Some(-1),
            ..Default::default()
        }))
        .is_err());
        assert!(validate_agent_query_params(Some(&AgentQueryParams {
            limit: Some(10),
            offset: Some(0),
            tags: Some(vec!["ok".into()]),
            ..Default::default()
        }))
        .is_ok());
        assert!(validate_agent_query_params(None).is_ok());
    }

    #[test]
    fn identity_listing_params_validate_length() {
        assert!(
            validate_identity_listing_query_params(Some(&IdentityListingQueryParams {
                length: Some(-5),
                ..Default::default()
            }))
            .is_err()
        );
    }
}
