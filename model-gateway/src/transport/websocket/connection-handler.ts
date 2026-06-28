import type { WebSocket } from "ws";
import type { FastifyRequest } from "fastify";
import { parseCookie } from "../http/cookies.js";
import { StartTurn } from "../../application/turns/start-turn.js";
import { ResumeTurnAfterTool } from "../../application/turns/resume-turn-after-tool.js";
import { CancelTurn } from "../../application/turns/cancel-turn.js";
import { toGatewayError } from "../../kernel/errors.js";
import { parseClientMessage } from "./protocol.parser.js";
import { describeProviderStatus, toWireModel } from "./wire.js";
import type { GatewayContainer } from "../../bootstrap/container.js";
import type { TurnEventSink } from "../../application/turns/start-turn.js";

export function createWebSocketHandler(container: GatewayContainer) {
  const startTurn = new StartTurn(container);
  const resumeTurn = new ResumeTurnAfterTool(container);
  const cancelTurn = new CancelTurn(container);

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

    const send = (payload: unknown): void => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(payload));
      }
    };

    const sink: TurnEventSink = {
      async emit(event) {
        send(event);
      }
    };

    socket.on("message", (data) => {
      void (async () => {
        try {
          const raw = data.toString();
          if (Buffer.byteLength(raw, "utf8") > container.settings.maxWebSocketMessageBytes) {
            send({
              type: "protocol.error",
              code: "MESSAGE_TOO_LARGE",
              message: "WebSocket message exceeds the configured size limit"
            });
            return;
          }

          const parsed = parseClientMessage(raw);

          switch (parsed.kind) {
            case "turn.start":
              await startTurn.execute(browserSession, parsed.request, sink);
              return;

            case "turn.tool_result": {
              if (
                Buffer.byteLength(JSON.stringify(parsed.result.result), "utf8") >
                container.settings.maxToolResultBytes
              ) {
                send({
                  type: "turn.failed",
                  turn_id: parsed.turnId,
                  code: "TOOL_RESULT_TOO_LARGE",
                  message: "Tool result exceeds the configured size limit"
                });
                return;
              }

              await resumeTurn.execute(parsed.turnId, parsed.result, sink);
              return;
            }

            case "models.list": {
              const models = await container.modelCatalog.list({ view: parsed.view });
              send({
                type: "models.list.result",
                request_id: parsed.requestId,
                view: parsed.view,
                models: models.map(toWireModel)
              });
              return;
            }

            case "provider.status": {
              const providers = describeProviderStatus(
                container.providerRegistry.protocols(),
                container.settings
              );
              send({ type: "provider.status.result", request_id: parsed.requestId, providers });
              return;
            }

            case "agent.cancel_turn": {
              try {
                const cancelInput = parsed.turnId === undefined ? {} : { turnId: parsed.turnId };
                const cancelledTurnIds = await cancelTurn.execute(browserSession, cancelInput, sink);
                send({
                  type: "agent.cancel_turn.result",
                  request_id: parsed.requestId,
                  cancelled_turn_ids: cancelledTurnIds
                });
              } catch (error) {
                const gatewayError = toGatewayError(error);
                send({
                  type: "rpc.error",
                  request_id: parsed.requestId,
                  code: gatewayError.code,
                  message: gatewayError.message
                });
              }
              return;
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid WebSocket message";
          send({ type: "protocol.error", code: "INVALID_MESSAGE", message });
        }
      })();
    });

    socket.on("close", () => {
      void container.turnStore.cancelByBrowserSession(browserSession.id);
    });
  };
}
