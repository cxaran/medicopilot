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

## Credential lease bridge (MG-002, B4)

FastAPI owns AI provider credentials, encrypted at rest. The gateway does **not** store them: it leases a decrypted secret short-lived, only for the duration of a turn.

- When both `GATEWAY_BACKEND_INTERNAL_URL` and `GATEWAY_BACKEND_INTERNAL_SECRET` are set, the container wires `HttpControlPlaneClient`. Its `leaseCredential` does a server-to-server `POST {GATEWAY_BACKEND_INTERNAL_URL}/api/v1/internal/agent/credential-lease` with header `X-Internal-Auth: {GATEWAY_BACKEND_INTERNAL_SECRET}` (must match the backend's `AGENT_GATEWAY_INTERNAL_SECRET`) and body `{ user_id, provider }`. The `user_id` comes from the browser-session identity propagated by the connection ticket; the `provider` from the turn authorization.
- The backend returns `{ lease_id, secret, expires_at, default_model? }` where `secret` is the decrypted API key (short TTL via `AGENT_GATEWAY_LEASE_TTL_SECONDS`). The client maps it to a `ProviderCredentialLease` and never logs the secret. Errors expose only the HTTP status (`404` no active credential, `401` bad internal auth), never the response body or the internal secret.
- When the backend config is absent, the fake control-plane (`fake-secret`) is used so dev and tests keep working.
- The backend endpoint is internal-only (server-to-server secret, not cookie auth); deployments must keep it off the public network.

MG-002 is still in progress: `authorizeTurn` resolves the real `userId` from the session but the provider/model/capability negotiation remains scaffolded for a later slice.

## Real provider: opencode (MG-002, B5)

The first real provider adapter is `OpencodeProviderAdapter` (`providers/opencode/`), targeting opencode zen, which is OpenAI-compatible (`/chat/completions` + `/models`, `Authorization: Bearer <key>`).

- It uses the **leased** credential from B4 (`ProviderTurnInput.credential`) for the `Authorization` header on every call; the secret is never logged (the adapter does no logging).
- `verifyCredential` does a light `GET /models` (200 → valid, 401/403 → invalid). `discoverModels` maps `/models` rows to `ModelDescriptor[]`, enriching capabilities from row metadata with safe defaults. `startTurn` POSTs `/chat/completions` with `stream=true` and translates the SSE stream into provider events (`text.delta`, `reasoning.summary`, `tool_call.ready` with a continuation state, `completed` with usage). `resumeTurn` appends the tool results to the stored history and re-issues the streamed completion.
- The base URL (`GATEWAY_OPENCODE_BASE_URL`) and default model (`GATEWAY_OPENCODE_DEFAULT_MODEL`) are configurable; their defaults are **provisional** and will be confirmed in B13 against the real key. No credentials are configured here — they arrive via the B4 lease.
- The model catalog now combines the fake model (dev) with a curated opencode model, and the provider registry exposes both protocols.

Capability schema enrichment (B5, OpenClaw pattern): `ModelCapabilities` now separates the native `contextWindowTokens` from an effective `effectiveContextTokens` cap (the context budgeter uses the smaller), and adds a `compat` block of fine wire-shape flags (`supportsTools`, `supportsReasoningEffort`, `thinkingFormat`, `supportsStrictMode`, `supportsUsageInStreaming`, `supportsEagerToolInputStreaming`) consumed by provider adapters. The granular capability checks remain authoritative in the negotiator. All HTTP for opencode is mocked in tests; the real end-to-end with a live key lands in B13.

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
