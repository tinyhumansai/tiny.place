"""Registration + config gating: all tools register; missing env disables them."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from conftest import config as cfg
from conftest import schemas

_PLUGIN_DIR = Path(__file__).resolve().parent.parent / "src" / "tinyplace"


def _load_package_init():
    """Load the plugin's __init__ (with its register()) under a test alias."""
    spec = importlib.util.spec_from_file_location(
        "tinyplace_plugin", _PLUGIN_DIR / "__init__.py",
        submodule_search_locations=[str(_PLUGIN_DIR)],
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules["tinyplace_plugin"] = module
    spec.loader.exec_module(module)
    return module


class _FakeCtx:
    """Captures register_tool calls so the test can assert on them."""

    def __init__(self) -> None:
        self.tools: list[dict] = []

    def register_tool(self, **kwargs):
        self.tools.append(kwargs)


def test_all_tools_register():
    plugin = _load_package_init()
    ctx = _FakeCtx()
    plugin.register(ctx)

    names = [t["name"] for t in ctx.tools]
    assert names == [
        "tinyplace_poll_inbox",
        "tinyplace_send_message",
        "tinyplace_search_domain",
        "tinyplace_register_domain",
        "tinyplace_get_identity",
        "tinyplace_discover_agents",
        "tinyplace_get_agent",
        "tinyplace_search",
        "tinyplace_notifications",
        "tinyplace_mark_notifications_read",
        "tinyplace_list_groups",
        "tinyplace_join_group",
        "tinyplace_send_group_message",
        "tinyplace_poll_group_inbox",
    ]
    for tool in ctx.tools:
        assert tool["toolset"] == "tinyplace"
        assert callable(tool["handler"])
        assert isinstance(tool["schema"], dict)
        assert callable(tool["check_fn"])


def test_config_gating_disables_when_unconfigured(monkeypatch):
    plugin = _load_package_init()
    ctx = _FakeCtx()
    plugin.register(ctx)

    monkeypatch.delenv(cfg.ENV_AGENT_KEY, raising=False)
    # check_fn gates availability: every tool reports unavailable without a key.
    assert all(t["check_fn"]() is False for t in ctx.tools)

    monkeypatch.setenv(cfg.ENV_AGENT_KEY, "some-key")
    assert all(t["check_fn"]() is True for t in ctx.tools)


def test_schemas_are_well_formed():
    for schema in (
        schemas.POLL_INBOX,
        schemas.SEND_MESSAGE,
        schemas.SEARCH_DOMAIN,
        schemas.REGISTER_DOMAIN,
        schemas.GET_IDENTITY,
        schemas.DISCOVER_AGENTS,
        schemas.GET_AGENT,
        schemas.SEARCH,
        schemas.NOTIFICATIONS,
        schemas.MARK_NOTIFICATIONS_READ,
        schemas.LIST_GROUPS,
        schemas.JOIN_GROUP,
        schemas.SEND_GROUP_MESSAGE,
        schemas.POLL_GROUP_INBOX,
    ):
        assert set(schema) >= {"name", "description", "parameters"}
        assert schema["parameters"]["type"] == "object"
        assert len(schema["description"]) > 40  # specific, not a stub
