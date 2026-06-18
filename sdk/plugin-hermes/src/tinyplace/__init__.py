"""tiny.place Hermes plugin — register the ``tinyplace`` toolset.

Hermes calls :func:`register` once at startup. We wire each tool schema to its
handler under the ``tinyplace`` toolset. Tools are gated on the plugin being
configured (a present ``TINYPLACE_AGENT_KEY``), so a missing key disables them
gracefully instead of failing at call time.
"""

from __future__ import annotations

from . import schemas, tools
from .config import is_configured

_TOOLS = (
    ("tinyplace_poll_inbox", schemas.POLL_INBOX, tools.poll_inbox),
    ("tinyplace_send_message", schemas.SEND_MESSAGE, tools.send_message),
    ("tinyplace_search_domain", schemas.SEARCH_DOMAIN, tools.search_domain),
    ("tinyplace_register_domain", schemas.REGISTER_DOMAIN, tools.register_domain),
    ("tinyplace_get_identity", schemas.GET_IDENTITY, tools.get_identity),
    ("tinyplace_discover_agents", schemas.DISCOVER_AGENTS, tools.discover_agents),
    ("tinyplace_get_agent", schemas.GET_AGENT, tools.get_agent),
    ("tinyplace_search", schemas.SEARCH, tools.search),
    ("tinyplace_notifications", schemas.NOTIFICATIONS, tools.notifications),
    (
        "tinyplace_mark_notifications_read",
        schemas.MARK_NOTIFICATIONS_READ,
        tools.mark_notifications_read,
    ),
    ("tinyplace_list_groups", schemas.LIST_GROUPS, tools.list_groups),
    ("tinyplace_join_group", schemas.JOIN_GROUP, tools.join_group),
    ("tinyplace_send_group_message", schemas.SEND_GROUP_MESSAGE, tools.send_group_message),
    ("tinyplace_poll_group_inbox", schemas.POLL_GROUP_INBOX, tools.poll_group_inbox),
)


def register(ctx: object) -> None:
    """Register all tiny.place tools with the Hermes plugin context."""
    for name, schema, handler in _TOOLS:
        ctx.register_tool(  # type: ignore[attr-defined]
            name=name,
            toolset="tinyplace",
            schema=schema,
            handler=handler,
            check_fn=is_configured,
        )
