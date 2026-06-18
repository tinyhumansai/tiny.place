"""Plugin configuration resolved from ``requires_env`` environment variables.

Centralizes how the Hermes plugin reads its config so the runtime, tools and
tests share one source of truth. Nothing here ever logs or echoes the agent
key material.
"""

from __future__ import annotations

import base64
import os
from dataclasses import dataclass
from pathlib import Path

DEFAULT_API_BASE_URL = "https://staging-api.tiny.place"

# Public Solana RPC endpoints keyed by the network label, used to settle x402
# payments on chain when no explicit RPC URL is configured.
_DEFAULT_RPC_BY_NETWORK = {
    "devnet": "https://api.devnet.solana.com",
    "testnet": "https://api.testnet.solana.com",
    "mainnet": "https://api.mainnet-beta.solana.com",
    "mainnet-beta": "https://api.mainnet-beta.solana.com",
}

# Environment variable names (mirrors plugin.yaml ``requires_env``).
ENV_AGENT_KEY = "TINYPLACE_AGENT_KEY"
ENV_API_BASE_URL = "TINYPLACE_API_BASE_URL"
ENV_SOLANA_NETWORK = "TINYPLACE_SOLANA_NETWORK"
ENV_SOLANA_RPC_URL = "TINYPLACE_SOLANA_RPC_URL"
ENV_SOLANA_USDC_MINT = "TINYPLACE_SOLANA_USDC_MINT"
ENV_STATE_DIR = "TINYPLACE_STATE_DIR"


@dataclass(frozen=True)
class PluginConfig:
    """Resolved, validated plugin configuration.

    ``agent_key`` is the raw secret material (never logged). ``state_dir`` is
    where the inbox cursor and Signal session state are persisted between runs.
    ``solana_rpc_url`` / ``usdc_mint`` enable on-chain x402 settlement of paid
    actions (e.g. domain registration) when a ``solana_network`` is set.
    """

    agent_key: str
    api_base_url: str
    solana_network: str | None
    solana_rpc_url: str | None
    usdc_mint: str | None
    state_dir: Path

    @property
    def can_settle_payments(self) -> bool:
        """True when enough is configured to settle an x402 payment on chain."""
        return bool(self.solana_network and self.solana_rpc_url)


def default_state_dir() -> Path:
    """Return the default Hermes state directory for this plugin."""
    override = os.environ.get(ENV_STATE_DIR)
    if override:
        return Path(override).expanduser()
    hermes_home = os.environ.get("HERMES_HOME")
    base = Path(hermes_home).expanduser() if hermes_home else Path.home() / ".hermes"
    return base / "state" / "tinyplace"


def is_configured() -> bool:
    """Return whether the required env (the agent key) is present.

    Hermes calls this to decide whether to enable the plugin's tools; a missing
    key disables them gracefully rather than crashing the agent.
    """
    return bool(os.environ.get(ENV_AGENT_KEY, "").strip())


def load_config() -> PluginConfig:
    """Read and validate config from the environment.

    Raises:
        ValueError: if the required agent key is missing.
    """
    agent_key = os.environ.get(ENV_AGENT_KEY, "").strip()
    if not agent_key:
        raise ValueError(
            f"{ENV_AGENT_KEY} is not set. The tiny.place plugin needs the "
            "agent's Ed25519 seed or Solana secret key to sign and decrypt."
        )
    api_base_url = (
        os.environ.get(ENV_API_BASE_URL, "").strip() or DEFAULT_API_BASE_URL
    ).rstrip("/")
    solana_network = os.environ.get(ENV_SOLANA_NETWORK, "").strip() or None
    solana_rpc_url = (
        os.environ.get(ENV_SOLANA_RPC_URL, "").strip()
        or _default_rpc_url(solana_network)
    )
    usdc_mint = os.environ.get(ENV_SOLANA_USDC_MINT, "").strip() or None
    return PluginConfig(
        agent_key=agent_key,
        api_base_url=api_base_url,
        solana_network=solana_network,
        solana_rpc_url=solana_rpc_url,
        usdc_mint=usdc_mint,
        state_dir=default_state_dir(),
    )


def _default_rpc_url(network: str | None) -> str | None:
    """Public Solana RPC endpoint for a known network label, else ``None``."""
    if not network:
        return None
    return _DEFAULT_RPC_BY_NETWORK.get(network.strip().lower())


def decode_key_material(agent_key: str) -> bytes:
    """Decode the configured agent key into raw secret-key bytes.

    Accepts base58 (Solana style) or base64; returns the raw 32- or 64-byte
    secret so :func:`build_signer` can pick the right ``LocalSigner`` factory.
    """
    value = agent_key.strip()
    # base58 first (Solana secret keys are conventionally base58).
    try:
        from ._sdk import sdk_import

        decode_base58 = sdk_import("crypto").decode_base58
        decoded = decode_base58(value)
        if len(decoded) in (32, 64):
            return decoded
    except Exception:  # noqa: BLE001 - fall through to base64
        pass
    try:
        decoded = base64.b64decode(value, validate=True)
        if len(decoded) in (32, 64):
            return decoded
    except Exception:  # noqa: BLE001
        pass
    raise ValueError(
        "TINYPLACE_AGENT_KEY could not be decoded to a 32- or 64-byte key "
        "(expected base58 or base64)."
    )
