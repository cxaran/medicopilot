import { loadSettings } from "../config/settings.js";
import { FakeControlPlaneClient } from "../infrastructure/control-plane/fake-control-plane.client.js";
import { HttpControlPlaneClient } from "../infrastructure/control-plane/http-control-plane.client.js";
import { InMemoryModelCatalog } from "../infrastructure/catalog/in-memory-model-catalog.js";
import { InMemoryTurnStore } from "../infrastructure/turn-store/in-memory-turn-store.js";
import { NoopRateLimiter } from "../infrastructure/rate-limit/noop-rate-limiter.js";
import { PinoTelemetry } from "../infrastructure/observability/pino-telemetry.js";
import { FakeProviderAdapter } from "../providers/fake/adapter.js";
import {
  OpencodeProviderAdapter,
  createOpencodeModel,
  OPENCODE_GO_PROVIDER_ID
} from "../providers/opencode/adapter.js";
import {
  OpenAIProviderAdapter,
  createOpenAIModel,
  type OpenAIApiFlavor
} from "../providers/openai/adapter.js";
import { ProviderRegistry } from "../providers/registry.js";
import { createFakeModel } from "../domain/model.js";
import { InMemoryBrowserSessionStore } from "../application/browser-sessions/session-store.js";
import { ModelDiscoveryService } from "../application/capabilities/model-discovery.js";
import type { GatewaySettings } from "../config/settings.js";
import type { ControlPlanePort } from "../ports/control-plane.port.js";
import type { ProviderAdapter } from "../ports/provider-adapter.port.js";
import type { ModelCatalogPort } from "../ports/model-catalog.port.js";
import type { ProviderRegistryPort } from "../ports/provider-registry.port.js";
import type { RateLimiterPort } from "../ports/rate-limiter.port.js";
import type { TelemetryPort } from "../ports/telemetry.port.js";
import type { TurnStorePort } from "../ports/turn-store.port.js";

export interface GatewayContainer {
  settings: GatewaySettings;
  controlPlane: ControlPlanePort;
  modelCatalog: ModelCatalogPort;
  modelDiscovery: ModelDiscoveryService;
  providerRegistry: ProviderRegistryPort;
  turnStore: TurnStorePort;
  limiter: RateLimiterPort;
  telemetry: TelemetryPort;
  browserSessions: InMemoryBrowserSessionStore;
}

export function createContainer(settings = loadSettings()): GatewayContainer {
  const browserSessions = new InMemoryBrowserSessionStore();

  // B5: primer proveedor real. El catálogo combina el fake (dev) + un modelo curado de
  // opencode; el registry expone ambos protocolos.
  const opencodeAdapter = new OpencodeProviderAdapter({ baseUrl: settings.opencodeBaseUrl });
  const opencodeModel = createOpencodeModel({
    baseUrl: settings.opencodeBaseUrl,
    modelId: settings.opencodeDefaultModel
  });

  // OpenCode Go (opt-in): mismo adaptador OpenAI-compatible, otro base URL y provider id
  // (opencode_go) para que el arriendo busque la credencial Go correcta. La misma key
  // opencode sirve, pero contra el endpoint Go.
  const adapters: ProviderAdapter[] = [new FakeProviderAdapter(), opencodeAdapter];
  const catalogModels = [createFakeModel(), opencodeModel];
  if (settings.opencodeGoEnabled && settings.opencodeGoBaseUrl) {
    const opencodeGoAdapter = new OpencodeProviderAdapter({
      baseUrl: settings.opencodeGoBaseUrl,
      providerId: OPENCODE_GO_PROVIDER_ID
    });
    const opencodeGoModel = createOpencodeModel({
      baseUrl: settings.opencodeGoBaseUrl,
      modelId: settings.opencodeGoDefaultModel ?? "qwen3.7-plus",
      providerId: OPENCODE_GO_PROVIDER_ID
    });
    adapters.push(opencodeGoAdapter);
    catalogModels.push(opencodeGoModel);
  }

  // OpenAI / Codex (P6, opt-in). Mismo provider id "openai" para ambas auth shapes; el
  // arriendo (B4/B10) entrega el Bearer correcto (API key o access token OAuth). El flavor
  // elige la familia de cable. El modelo por defecto se registra como fila curada (útil
  // cuando el proveedor no expone /models, p. ej. Codex/suscripción); el discovery añade los
  // reales cuando sí hay /models.
  if (settings.openaiEnabled && settings.openaiBaseUrl) {
    const openaiAdapter = new OpenAIProviderAdapter({
      baseUrl: settings.openaiBaseUrl,
      apiFlavor: (settings.openaiApiFlavor as OpenAIApiFlavor) ?? "chat_completions"
    });
    const openaiModel = createOpenAIModel({
      baseUrl: settings.openaiBaseUrl,
      modelId: settings.openaiDefaultModel ?? "gpt-5-codex",
      apiFlavor: (settings.openaiApiFlavor as OpenAIApiFlavor) ?? "chat_completions"
    });
    adapters.push(openaiAdapter);
    catalogModels.push(openaiModel);
  }

  const modelCatalog = new InMemoryModelCatalog(catalogModels);

  // B4: si hay config del backend interno, se usa el control-plane real que arrienda
  // credenciales contra FastAPI; si no, el fake (dev/tests). authorizeTurn parsea el
  // profileId (providerId/modelId); el modelo real lo resuelve el discovery.
  const controlPlane: ControlPlanePort =
    settings.backendInternalUrl && settings.backendInternalSecret
      ? new HttpControlPlaneClient({
          backendInternalUrl: settings.backendInternalUrl,
          backendInternalSecret: settings.backendInternalSecret,
          browserSessions
        })
      : new FakeControlPlaneClient();

  const providerRegistry = new ProviderRegistry(adapters);
  const telemetry = new PinoTelemetry();

  // Discovery real: descubre los modelos de los proveedores REALES (no el fake) consultando
  // su /models con la credencial del usuario. El fake solo vive en el catálogo curado.
  const discoverableProviderIds = [
    ...new Set(
      catalogModels
        .map((model) => model.route.providerId)
        .filter((providerId) => providerId !== "fake")
    )
  ];
  const modelDiscovery = new ModelDiscoveryService({
    controlPlane,
    providerRegistry,
    modelCatalog,
    telemetry,
    discoverableProviderIds
  });

  return {
    settings,
    controlPlane,
    modelCatalog,
    modelDiscovery,
    providerRegistry,
    turnStore: new InMemoryTurnStore(),
    limiter: new NoopRateLimiter(),
    telemetry,
    browserSessions
  };
}
