use std::path::{Path, PathBuf};

use serde::Deserialize;

const DEFAULT_ENDPOINT: &str = "https://api-v2.tiny.place";

#[derive(Debug, Default, Deserialize)]
pub struct ConfigFile {
    #[serde(default)]
    pub endpoint: Option<String>,
    #[serde(default, rename = "secretKey")]
    pub secret_key: Option<String>,
}

pub struct Resolved {
    pub endpoint: String,
    pub seed: Option<[u8; 32]>,
    pub config_path: PathBuf,
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

pub fn config_path() -> PathBuf {
    if let Some(path) = std::env::var_os("TINYPLACE_CONFIG") {
        return PathBuf::from(path);
    }
    let mut base = home_dir().unwrap_or_default();
    base.push(".tinyplace");
    base.push("config.json");
    base
}

fn load_config_file(path: &Path) -> Result<ConfigFile, String> {
    match std::fs::read_to_string(path) {
        Ok(contents) => serde_json::from_str(&contents)
            .map_err(|err| format!("invalid config at {}: {err}", path.display())),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(ConfigFile::default()),
        Err(err) => Err(format!(
            "could not read config at {}: {err}",
            path.display()
        )),
    }
}

/// Endpoint precedence: CLI flag, `$TINYPLACE_ENDPOINT`, `$TINYPLACE_API_URL`,
/// the config file, then the default. The first non-empty source wins.
fn pick_endpoint(
    cli: Option<&str>,
    env_endpoint: Option<&str>,
    env_api_url: Option<&str>,
    file: Option<&str>,
) -> String {
    [cli, env_endpoint, env_api_url, file]
        .into_iter()
        .flatten()
        .map(str::trim)
        .find(|value| !value.is_empty())
        .unwrap_or(DEFAULT_ENDPOINT)
        .to_string()
}

/// `$TINYPLACE_SECRET_KEY` then the config file. Blank/whitespace values are
/// ignored, so an empty export doesn't shadow a configured key.
fn pick_secret(env: Option<&str>, file: Option<&str>) -> Option<String> {
    [env, file]
        .into_iter()
        .flatten()
        .map(str::trim)
        .find(|value| !value.is_empty())
        .map(str::to_string)
}

fn decode_seed_hex(hex: &str) -> Result<[u8; 32], String> {
    let hex = hex.trim();
    if hex.len() != 64 {
        return Err(format!(
            "secret key must be 64 hex chars (a 32-byte seed), got {}",
            hex.len()
        ));
    }
    let mut seed = [0u8; 32];
    for (index, byte) in seed.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&hex[index * 2..index * 2 + 2], 16)
            .map_err(|_| "secret key is not valid hex".to_string())?;
    }
    Ok(seed)
}

pub fn resolve(cli_endpoint: Option<&str>) -> Result<Resolved, String> {
    let path = config_path();
    let file = load_config_file(&path)?;

    let endpoint = pick_endpoint(
        cli_endpoint,
        std::env::var("TINYPLACE_ENDPOINT").ok().as_deref(),
        std::env::var("TINYPLACE_API_URL").ok().as_deref(),
        file.endpoint.as_deref(),
    );

    let seed = pick_secret(
        std::env::var("TINYPLACE_SECRET_KEY").ok().as_deref(),
        file.secret_key.as_deref(),
    )
    .map(|hex| decode_seed_hex(&hex))
    .transpose()?;

    Ok(Resolved {
        endpoint,
        seed,
        config_path: path,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoint_precedence_picks_first_non_empty() {
        assert_eq!(
            pick_endpoint(
                Some("https://cli"),
                Some("https://env"),
                None,
                Some("https://file")
            ),
            "https://cli"
        );
        assert_eq!(
            pick_endpoint(
                None,
                Some("https://env"),
                Some("https://api"),
                Some("https://file")
            ),
            "https://env"
        );
        assert_eq!(
            pick_endpoint(None, None, None, Some("https://file")),
            "https://file"
        );
        assert_eq!(pick_endpoint(None, None, None, None), DEFAULT_ENDPOINT);
    }

    #[test]
    fn endpoint_skips_blank_sources() {
        assert_eq!(
            pick_endpoint(Some("   "), Some("https://env"), None, None),
            "https://env"
        );
    }

    #[test]
    fn secret_precedence_ignores_blank() {
        assert_eq!(pick_secret(Some("aa"), Some("bb")).as_deref(), Some("aa"));
        // A blank env export must fall back to the config key, not block it.
        assert_eq!(pick_secret(Some("   "), Some("bb")).as_deref(), Some("bb"));
        assert_eq!(pick_secret(Some(""), None), None);
        assert_eq!(pick_secret(None, None), None);
    }

    #[test]
    fn decode_seed_hex_round_trips() {
        let seed = decode_seed_hex(&"ab".repeat(32)).unwrap();
        assert_eq!(seed, [0xab; 32]);
    }

    #[test]
    fn decode_seed_hex_rejects_bad_input() {
        assert!(decode_seed_hex("abcd").is_err());
        assert!(decode_seed_hex(&"zz".repeat(32)).is_err());
    }
}
