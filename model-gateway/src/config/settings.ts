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
    maxToolsPerTurn: numberFromEnv("GATEWAY_MAX_TOOLS_PER_TURN", 16),
    maxToolResultBytes: numberFromEnv("GATEWAY_MAX_TOOL_RESULT_BYTES", 64 * 1024),
    toolResultTimeoutMs: numberFromEnv("GATEWAY_TOOL_RESULT_TIMEOUT_MS", 30_000),
    devTicket: process.env.GATEWAY_DEV_TICKET ?? "dev-ticket"
  };
}
