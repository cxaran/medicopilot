import type { WebSocket } from "ws";
import type { FastifyRequest } from "fastify";
import { parseCookie } from "../http/cookies.js";
import { StartTurn } from "../../application/turns/start-turn.js";
import { ResumeTurnAfterTool } from "../../application/turns/resume-turn-after-tool.js";
import { parseClientMessage } from "./protocol.parser.js";
import type { GatewayContainer } from "../../bootstrap/container.js";
import type { TurnEventSink } from "../../application/turns/start-turn.js";

export function createWebSocketHandler(container: GatewayContainer) {
  const startTurn = new StartTurn(container);
  const resumeTurn = new ResumeTurnAfterTool(container);

  return (socket: WebSocket, request: FastifyRequest): void => {
    const origin = request.headers.origin;
    if (origin && !container.settings.allowedOrigins.includes(origin)) {
      socket.close(1008, "Origin not allowed");
      return;
    }

    const sessionId = parseCookie(request.headers.cookie, container.settings.cookieName);
    const browserSession = sessionId ? container.browserSessions.get(sessionId) : null;
    if (!browserSession) {
      socket.close(1008, "Gateway session required");
      return;
    }

    const sink: TurnEventSink = {
      async emit(event) {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(event));
        }
      }
    };

    socket.on("message", (data) => {
      void (async () => {
        try {
          const raw = data.toString();
          if (Buffer.byteLength(raw, "utf8") > container.settings.maxWebSocketMessageBytes) {
            socket.send(
              JSON.stringify({
                type: "protocol.error",
                code: "MESSAGE_TOO_LARGE",
                message: "WebSocket message exceeds the configured size limit"
              })
            );
            return;
          }

          const parsed = parseClientMessage(raw);
          if (parsed.kind === "turn.start") {
            await startTurn.execute(browserSession, parsed.request, sink);
          } else {
            if (Buffer.byteLength(JSON.stringify(parsed.result.result), "utf8") > container.settings.maxToolResultBytes) {
              socket.send(
                JSON.stringify({
                  type: "turn.failed",
                  turn_id: parsed.turnId,
                  code: "TOOL_RESULT_TOO_LARGE",
                  message: "Tool result exceeds the configured size limit"
                })
              );
              return;
            }

            await resumeTurn.execute(parsed.turnId, parsed.result, sink);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid WebSocket message";
          socket.send(JSON.stringify({ type: "protocol.error", code: "INVALID_MESSAGE", message }));
        }
      })();
    });

    socket.on("close", () => {
      void container.turnStore.cancelByBrowserSession(browserSession.id);
    });
  };
}
