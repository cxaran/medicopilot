# Model Gateway

MG-001 establishes a provider-neutral inference runtime kernel for MedicoPilot.

This service is not an agent. It does not keep clinical memory, execute clinical tools, plan actions, or query patient data. It validates a browser gateway session, resolves a fake provider profile for local tests, negotiates model capabilities, validates context budget, normalizes WebSocket events, and relays tool calls back to the browser.

## MG-001 Boundaries

- Browser sessions are in-memory and development-only.
- Browser-session creation accepts a real connection-ticket JWT issued by FastAPI (MG-002, see below); `GATEWAY_DEV_TICKET` remains as a development-only fallback, not FastAPI introspection.
- No real provider credentials are accepted or stored.
- No Redis, FastAPI internal API, OpenCode Zen, OpenCode Go, OpenAI, Anthropic, or clinical tool execution is included.
- Active turns do not survive a process restart.

## Connection ticket (MG-002)

`POST {prefix}/v1/browser-sessions` resolves the request `ticket` in this order:

1. **FastAPI JWT (primary path).** If `GATEWAY_AGENT_TICKET_SECRET` is set, the ticket is verified as the HS256 JWT issued by FastAPI's `POST /api/v1/agent/connection-ticket` (the secret must match the backend's `AGENT_GATEWAY_TICKET_SECRET`). Verification checks the signature, `aud=agent-gateway` and expiry, then propagates the identity (`sub` -> `userId`, `sid` -> `sessionRef`) onto the browser session.
2. **Dev ticket (fallback, non-production only).** Outside `NODE_ENV=production`, a body ticket equal to `GATEWAY_DEV_TICKET` still creates a development session.

An invalid signature, wrong audience, or expired ticket yields `401 INVALID_TICKET`. The ticket and the shared secret are never logged. The propagated `userId` is not yet used to authorize any clinical action — FastAPI remains the clinical authority via the browser cookie.

## Routing

- The canonical public prefix is configured by `GATEWAY_PUBLIC_PATH_PREFIX`, defaulting to `/model-gateway`.
- `GATEWAY_ENABLE_ROOT_PATH_ALIAS=true` enables a temporary MG-001 alias for `/v1/*` to support direct local/container tests.
- Production routing should use the canonical prefixed path only.

## Observability

- `/metrics` is an internal observability endpoint for Prometheus scraping.
- Production ingress must not expose `/metrics` publicly.

## Protocol Limits

- `GATEWAY_MAX_WS_MESSAGE_BYTES` limits incoming WebSocket message size.
- `GATEWAY_MAX_TOOLS_PER_TURN` limits declared tools per turn.
- `GATEWAY_MAX_TOOL_RESULT_BYTES` limits browser-supplied tool results.
- `GATEWAY_TOOL_RESULT_TIMEOUT_MS` expires turns waiting for tool results.

## Logging

Application logs must not include prompts, tool results, cookies, authorization headers, API keys, or full tool arguments.
