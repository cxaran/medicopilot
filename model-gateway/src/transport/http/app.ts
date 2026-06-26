import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { register } from "prom-client";
import { clearSessionCookie, createSessionCookie, parseCookie } from "./cookies.js";
import { createWebSocketHandler } from "../websocket/connection-handler.js";
import type { GatewayContainer } from "../../bootstrap/container.js";

export async function buildApp(container: GatewayContainer) {
  const app = Fastify({ logger: false });
  await app.register(websocket, { options: { maxPayload: container.settings.maxWebSocketMessageBytes } });

  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/readyz", async () => ({ status: "ready" }));
  // Internal observability endpoint. Production routing must keep this off the public Internet.
  app.get("/metrics", async (_request, reply) => {
    reply.header("x-internal-observability", "true");
    reply.header("content-type", register.contentType);
    return register.metrics();
  });

  const registerSessionRoutes = (prefix: string) => {
    app.post(`${prefix}/v1/browser-sessions`, async (request, reply) => {
      const body = request.body as { ticket?: string } | undefined;
      if (!body?.ticket || body.ticket !== container.settings.devTicket) {
        return reply.code(401).send({ code: "INVALID_TICKET", message: "Invalid browser session ticket" });
      }

      const session = container.browserSessions.create();
      reply.header(
        "set-cookie",
        createSessionCookie(container.settings.cookieName, session.id, container.settings.nodeEnv === "production")
      );
      return { id: session.id, expires_at: session.expiresAt.toISOString() };
    });

    app.delete(`${prefix}/v1/browser-sessions/current`, async (request, reply) => {
      const sessionId = parseCookie(request.headers.cookie, container.settings.cookieName);
      if (sessionId) {
        container.browserSessions.delete(sessionId);
        await container.turnStore.cancelByBrowserSession(sessionId);
      }

      reply.header(
        "set-cookie",
        clearSessionCookie(container.settings.cookieName, container.settings.nodeEnv === "production")
      );
      return { status: "closed" };
    });

    app.get(`${prefix}/v1/ws`, { websocket: true }, createWebSocketHandler(container));
  };

  registerSessionRoutes(container.settings.publicPathPrefix);
  if (container.settings.enableRootPathAlias) {
    // Temporary MG-001 alias for local tests and direct container access; canonical path uses publicPathPrefix.
    registerSessionRoutes("");
  }

  return app;
}
