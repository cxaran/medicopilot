export interface GatewaySettings {
  nodeEnv: string;
  host: string;
  port: number;
  publicPathPrefix: string;
  enableRootPathAlias: boolean;
  cookieName: string;
  allowedOrigins: string[];
  globalMaxContextTokens: number;
  safetyReserveTokens: number;
  maxWebSocketMessageBytes: number;
  maxToolsPerTurn: number;
  maxToolResultBytes: number;
  toolResultTimeoutMs: number;
  devTicket: string;
  // MG-002: secreto HS256 compartido con FastAPI (AGENT_GATEWAY_TICKET_SECRET) para
  // verificar el JWT de connection-ticket. Si está vacío, solo opera el dev-ticket.
  agentTicketSecret: string;
  // B4: puente interno de arriendo de credencial. URL base del backend FastAPI y
  // secreto compartido (= AGENT_GATEWAY_INTERNAL_SECRET). Si faltan, se usa el
  // control-plane fake (dev/tests); si están, se usa el HttpControlPlaneClient real.
  backendInternalUrl?: string | undefined;
  backendInternalSecret?: string | undefined;
  // B5: proveedor real opencode (OpenAI-compatible). Base URL configurable (la key NO
  // se configura aquí: llega por arriendo de B4). El default es provisional y se afina
  // en B13 con la key real.
  opencodeBaseUrl: string;
  opencodeDefaultModel: string;
  // OpenCode Go: misma API OpenAI-compatible que Zen pero base URL y catalogo propios
  // (suscripcion). Opt-in: solo se registra el proveedor opencode_go si está habilitado.
  // Opcionales para no obligar a los tests a declararlos (default: deshabilitado).
  opencodeGoEnabled?: boolean | undefined;
  opencodeGoBaseUrl?: string | undefined;
  opencodeGoDefaultModel?: string | undefined;
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanFromEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  return raw === "true" || raw === "1";
}

export function loadSettings(): GatewaySettings {
  return {
    nodeEnv: process.env.NODE_ENV ?? "development",
    host: process.env.HOST ?? "0.0.0.0",
    port: numberFromEnv("PORT", 8081),
    publicPathPrefix: process.env.GATEWAY_PUBLIC_PATH_PREFIX ?? "/model-gateway",
    enableRootPathAlias: booleanFromEnv("GATEWAY_ENABLE_ROOT_PATH_ALIAS", true),
    cookieName: process.env.GATEWAY_PUBLIC_COOKIE_NAME ?? "mg_session",
    allowedOrigins: (process.env.GATEWAY_ALLOWED_ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    globalMaxContextTokens: numberFromEnv("GATEWAY_GLOBAL_MAX_CONTEXT_TOKENS", 128000),
    safetyReserveTokens: numberFromEnv("GATEWAY_SAFETY_RESERVE_TOKENS", 1024),
    maxWebSocketMessageBytes: numberFromEnv("GATEWAY_MAX_WS_MESSAGE_BYTES", 1024 * 1024),
    // El set curado de tools clínicas del navegador creció (lecturas + borradores de
    // escritura gateados por rol). 24 da holgura sobre las 17 actuales; el descubrimiento
    // por tool_search será la solución de escala definitiva.
    maxToolsPerTurn: numberFromEnv("GATEWAY_MAX_TOOLS_PER_TURN", 24),
    maxToolResultBytes: numberFromEnv("GATEWAY_MAX_TOOL_RESULT_BYTES", 64 * 1024),
    toolResultTimeoutMs: numberFromEnv("GATEWAY_TOOL_RESULT_TIMEOUT_MS", 30_000),
    devTicket: process.env.GATEWAY_DEV_TICKET ?? "dev-ticket",
    agentTicketSecret: process.env.GATEWAY_AGENT_TICKET_SECRET ?? "",
    backendInternalUrl: process.env.GATEWAY_BACKEND_INTERNAL_URL || undefined,
    backendInternalSecret: process.env.GATEWAY_BACKEND_INTERNAL_SECRET || undefined,
    opencodeBaseUrl: process.env.GATEWAY_OPENCODE_BASE_URL ?? "https://opencode.ai/zen/v1",
    // Modelo curado por defecto: debe existir en el catálogo REAL de opencode zen
    // (su /models no expone "gpt-4o-mini"). claude-haiku-4-5 es real, rápido y con
    // soporte de tools; se puede sobreescribir con GATEWAY_OPENCODE_DEFAULT_MODEL.
    opencodeDefaultModel: process.env.GATEWAY_OPENCODE_DEFAULT_MODEL ?? "claude-haiku-4-5",
    // OpenCode Go (suscripcion): la MISMA key opencode arrendada sirve, pero contra el
    // endpoint Go y con provider id opencode_go. Modelo por defecto del bundle Go.
    opencodeGoEnabled: process.env.GATEWAY_OPENCODE_GO_ENABLED === "true",
    opencodeGoBaseUrl: process.env.GATEWAY_OPENCODE_GO_BASE_URL ?? "https://opencode.ai/zen/go/v1",
    opencodeGoDefaultModel: process.env.GATEWAY_OPENCODE_GO_DEFAULT_MODEL ?? "qwen3.7-plus"
  };
}
