use serde_json::Value;

use crate::args::OutputFormat;

pub fn render(value: &Value, format: OutputFormat) -> String {
    let value = redact(value.clone());
    let mut out = match format {
        OutputFormat::Json => {
            serde_json::to_string_pretty(&value).unwrap_or_else(|_| value.to_string())
        }
        OutputFormat::Md => to_markdown(&value, 0),
    };
    out.push('\n');
    out
}

fn is_sensitive_key(key: &str) -> bool {
    let normalized: String = key
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .flat_map(char::to_lowercase)
        .collect();
    normalized.contains("secret") || normalized.contains("privatekey")
}

fn redact(value: Value) -> Value {
    match value {
        Value::Object(map) => Value::Object(
            map.into_iter()
                .map(|(key, val)| {
                    if val.is_string() && is_sensitive_key(&key) {
                        (key, Value::String("[redacted]".into()))
                    } else {
                        (key, redact(val))
                    }
                })
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.into_iter().map(redact).collect()),
        other => other,
    }
}

fn scalar(value: &Value) -> Option<String> {
    match value {
        Value::Null => Some("null".into()),
        Value::Bool(b) => Some(b.to_string()),
        Value::Number(n) => Some(n.to_string()),
        Value::String(s) => Some(s.clone()),
        _ => None,
    }
}

fn to_markdown(value: &Value, indent: usize) -> String {
    let pad = "  ".repeat(indent);
    match value {
        Value::Object(map) => map
            .iter()
            .map(|(key, val)| match scalar(val) {
                Some(text) => format!("{pad}- {key}: {text}"),
                None => format!("{pad}- {key}:\n{}", to_markdown(val, indent + 1)),
            })
            .collect::<Vec<_>>()
            .join("\n"),
        Value::Array(items) => items
            .iter()
            .map(|item| match scalar(item) {
                Some(text) => format!("{pad}- {text}"),
                None => format!("{pad}-\n{}", to_markdown(item, indent + 1)),
            })
            .collect::<Vec<_>>()
            .join("\n"),
        other => scalar(other).unwrap_or_default(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn json_is_pretty_with_trailing_newline() {
        let out = render(&json!({"a": 1}), OutputFormat::Json);
        assert_eq!(out, "{\n  \"a\": 1\n}\n");
    }

    #[test]
    fn markdown_renders_nested_bullets() {
        let out = render(&json!({"name": "x", "tags": ["a", "b"]}), OutputFormat::Md);
        assert!(out.contains("- name: x"), "got: {out}");
        assert!(out.contains("- tags:"), "got: {out}");
        assert!(out.contains("  - a"), "got: {out}");
    }

    #[test]
    fn redacts_sensitive_string_values() {
        let out = render(
            &json!({"secretKey": "abcd", "endpoint": "https://x"}),
            OutputFormat::Json,
        );
        assert!(out.contains("[redacted]"), "got: {out}");
        assert!(!out.contains("abcd"), "got: {out}");
        assert!(out.contains("https://x"), "got: {out}");
    }
}
