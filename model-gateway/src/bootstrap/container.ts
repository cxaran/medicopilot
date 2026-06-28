import { loadSettings } from "../config/settings.js";
import { FakeControlPlaneClient } from "../infrastructure/control-plane/fake-control-plane.client.js";
import { HttpControlPlaneClient } from "../infrastructure/control-plane/http-control-plane.client.js";
import { InMemoryModelCatalog } from "../infrastructure/catalog/in-memory-model-catalog.js";
import { InMemoryTurnStore } from "../infrastructure/turn-store/in-memory-turn-store.js";
import { NoopRateLimiter } from "../infrastructure/rate-limit/noop-rate-limiter.js";
import { PinoTelemetry } from "../infrastructure/observability/pino-telemetry.js";
import { FakeProviderAdapter } from "../providers/fake/adapter.js";
import { ProviderRegistry } from "../providers/registry.js";
import { InMemoryBrowserSessionStore } from "../application/browser-sessions/session-store.js";
import type { GatewaySettings } from "../config/settings.js";
import type { ControlPlanePort } from "../ports/control-plane.port.js";
import type { ModelCatalogPort } from "../ports/model-catalog.port.js";
import type { ProviderRegistryPort } from "../ports/provider-registry.port.js";
import type { RateLimiterPort } from "../ports/rate-limiter.port.js";
import type { TelemetryPort } from "../ports/telemetry.port.js";
import type { TurnStorePort } from "../ports/turn-store.port.js";

export interface GatewayContainer {
  settings: GatewaySettings;
  controlPlane: ControlPlanePort;
  modelCatalog: ModelCatalogPort;
  providerRegistry: ProviderRegistryPort;
  turnStore: TurnStorePort;
  limiter: RateLimiterPort;
  telemetry: TelemetryPort;
  browserSessions: InMemoryBrowserSessionStore;
}

export function createContainer(settings = loadSettings()): GatewayContainer {
  const browserSessions = new InMemoryBrowserSessionStore();

  // B4: si hay config del backend interno, se usa el control-plane real que arrienda
  // credenciales contra FastAPI; si no, el fake (dev/tests).
  const controlPlane: ControlPlanePort =
    settings.backendInternalUrl && settings.backendInternalSecret
      ? new HttpControlPlaneClient({
          backendInternalUrl: settings.backendInternalUrl,
          backendInternalSecret: settings.backendInternalSecret,
          browserSessions
        })
      : new FakeControlPlaneClient();

  return {
    settings,
    controlPlane,
    modelCatalog: new InMemoryModelCatalog(),
    providerRegistry: new ProviderRegistry([new FakeProviderAdapter()]),
    turnStore: new InMemoryTurnStore(),
    limiter: new NoopRateLimiter(),
    telemetry: new PinoTelemetry(),
    browserSessions
  };
}
