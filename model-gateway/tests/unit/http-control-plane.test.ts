import { describe, expect, it } from "vitest";
import { HttpControlPlaneClient } from "../../src/infrastructure/control-plane/http-control-plane.client.js";
import { InMemoryBrowserSessionStore } from "../../src/application/browser-sessions/session-store.js";
import { GatewayError } from "../../src/kernel/errors.js";
import type { TurnAuthorization } from "../../src/ports/control-plane.port.js";

const BACKEND_URL = "http://backend:8000";
const INTERNAL_SECRET = "internal-shared-secret";

interface Captured {
  url: string;
  init: RequestInit;
}

function build(responder: (captured: Captured) => Response) {
  const calls: Captured[] = [];
  const browserSessions = new InMemoryBrowserSessionStore();
  const session = browserSessions.create("user-123", "session-ref-7");
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const captured = { url: String(input), init: init ?? {} };
    calls.push(captured);
    return responder(captured);
  }) as unknown as typeof fetch;

  const client = new HttpControlPlaneClient({
    backendInternalUrl: BACKEND_URL,
    backendInternalSecret: INTERNAL_SECRET,
    browserSessions,
    fetchImpl
  });

  return { client, calls, browserSessions, sessionId: session.id };
}

async function authorize(client: HttpControlPlaneClient, sessionId: string): Promise<TurnAuthorization> {
  return client.authorizeTurn({ browserSessionId: sessionId, profileId: "profile_clinical_assistant" });
}

describe("HttpControlPlaneClient", () => {
  it("authorizeTurn resuelve el user_id real desde la sesión del navegador", async () => {
    const { client, sessionId } = build(() => new Response("{}", { status: 200 }));
    const authorization = await authorize(client, sessionId);
    expect(authorization.userId).toBe("user-123");
    expect(authorization.sessionId).toBe(sessionId);
  });

  it("authorizeTurn falla si la sesión no existe", async () => {
    const { client } = build(() => new Response("{}", { status: 200 }));
    await expect(
      client.authorizeTurn({ browserSessionId: "bs_inexistente", profileId: "p" })
    ).rejects.toBeInstanceOf(GatewayError);
  });

  it("leaseCredential hace el POST correcto y mapea la respuesta", async () => {
    const expiresAt = new Date(Date.now() + 120_000).toISOString();
    const { client, calls, sessionId } = build(
      () =>
        new Response(
          JSON.stringify({
            lease_id: "lease-abc",
            secret: "sk-leased-secret",
            expires_at: expiresAt,
            default_model: "gpt-4o"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    );

    const authorization = await authorize(client, sessionId);
    const lease = await client.leaseCredential({ authorization, purpose: "model_turn" });

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe("http://backend:8000/api/v1/internal/agent/credential-lease");
    expect(call.init.method).toBe("POST");
    const headers = call.init.headers as Record<string, string>;
    expect(headers["x-internal-auth"]).toBe(INTERNAL_SECRET);
    expect(JSON.parse(String(call.init.body))).toEqual({
      user_id: "user-123",
      provider: authorization.providerId
    });

    expect(lease).toEqual({
      leaseId: "lease-abc",
      secret: "sk-leased-secret",
      expiresAt: new Date(expiresAt)
    });
  });

  it("404 sin credencial -> GatewayError sin filtrar el secreto interno", async () => {
    const { client, sessionId } = build(
      () => new Response(JSON.stringify({ code: "credential_not_found" }), { status: 404 })
    );
    const authorization = await authorize(client, sessionId);
    try {
      await client.leaseCredential({ authorization, purpose: "model_turn" });
      throw new Error("se esperaba un error");
    } catch (error) {
      expect(error).toBeInstanceOf(GatewayError);
      const message = (error as GatewayError).message;
      expect(message).toContain("404");
      expect(message).not.toContain(INTERNAL_SECRET);
    }
  });

  it("401 header inválido -> GatewayError", async () => {
    const { client, sessionId } = build(() => new Response("{}", { status: 401 }));
    const authorization = await authorize(client, sessionId);
    await expect(
      client.leaseCredential({ authorization, purpose: "model_turn" })
    ).rejects.toBeInstanceOf(GatewayError);
  });
});
