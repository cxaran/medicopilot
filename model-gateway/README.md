# Model Gateway

MG-001 establishes a provider-neutral inference runtime kernel for MedicoPilot.

This service is not an agent. It does not keep clinical memory, execute clinical tools, plan actions, or query patient data. It validates a browser gateway session, resolves a fake provider profile for local tests, negotiates model capabilities, validates context budget, normalizes WebSocket events, and relays tool calls back to the browser.

## MG-001 Boundaries

- Browser sessions are in-memory and development-only.
- `GATEWAY_DEV_TICKET` is a fake local ticket, not FastAPI introspection.
- No real provider credentials are accepted or stored.
- No Redis, FastAPI internal API, OpenCode Zen, OpenCode Go, OpenAI, Anthropic, or clinical tool execution is included.
- Active turns do not survive a process restart.

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
