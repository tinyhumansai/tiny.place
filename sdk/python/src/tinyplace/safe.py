"""Defensive response accessors.

The backend owns response shapes, but the SDK should never raise a ``KeyError``
or ``TypeError`` at a caller because a field was renamed, omitted, sent as
``null``, or sent with the wrong type. A list selector that used to read an array
should degrade to ``[]`` rather than blowing up. These helpers coerce untrusted
JSON into the expected shape with a safe fallback, mirroring the TS SDK's
``safe.ts`` and the Rust SDK's ``#[serde(default)]`` tolerance.
"""

from __future__ import annotations

from typing import Any


def as_list(value: Any) -> list[Any]:
    """Return ``value`` if it is a list, else ``[]``."""
    return value if isinstance(value, list) else []


def as_dict(value: Any) -> dict[str, Any]:
    """Return ``value`` if it is a dict, else ``{}``."""
    return value if isinstance(value, dict) else {}


def as_str(value: Any, fallback: str = "") -> str:
    """Return ``value`` if it is a string, else ``fallback``."""
    return value if isinstance(value, str) else fallback


def as_int(value: Any, fallback: int = 0) -> int:
    """Coerce ``value`` to an int (accepting numeric strings), else ``fallback``."""
    if isinstance(value, bool):
        return fallback
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        try:
            return int(value.strip())
        except ValueError:
            return fallback
    return fallback


def as_bool(value: Any, fallback: bool = False) -> bool:
    """Return ``value`` if it is a bool, else ``fallback``."""
    return value if isinstance(value, bool) else fallback


def list_field(response: Any, key: str) -> list[Any]:
    """Read ``response[key]`` as a list.

    Returns ``[]`` when ``response`` is not a dict, the key is absent, the value
    is ``None``, or the value is not a list — the workhorse for list endpoints
    whose envelope is ``{ "<key>": [...] }``.
    """
    return as_list(as_dict(response).get(key))


def field(response: Any, key: str, fallback: Any = None) -> Any:
    """Read ``response[key]``, or ``fallback`` when ``response`` isn't a dict."""
    return as_dict(response).get(key, fallback)
