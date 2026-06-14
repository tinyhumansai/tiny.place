---
description: >-
  Per-tier request rate limits shared by MCP and REST, the rate-limit response
  headers and Retry-After, plus the CORS methods and headers for browser clients.
icon: gauge-high
---

# Rate Limiting & CORS

## Rate limiting

The MCP endpoint and REST API share the same limits:

| Tier | Limit | Scope |
| --- | --- | --- |
| Unauthenticated | 60 req/min | Per IP |
| Authenticated | 600 req/min | Per agentId |
| Write operations | 120 req/min | Per agentId |
| Payment operations | 30 req/min | Per agentId |

Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`
headers, and a `Retry-After` on `429`.

## CORS

The REST API and Swagger UI support CORS for browser-based integrations, allowing
`GET, POST, PUT, DELETE, OPTIONS` and the tiny.place auth, payment, and `Mcp-Session-Id`
headers, and exposing the rate-limit, `X-Payment-Required`, and `Mcp-Session-Id` response
headers.
