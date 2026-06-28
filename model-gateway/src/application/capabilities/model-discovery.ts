import { toGatewayError } from "../../kernel/errors.js";
import type { ModelDescriptor, ProviderProtocol } from "../../domain/model.js";
import type { ControlPlanePort } from "../../ports/control-plane.port.js";
import type { ModelCatalogPort } from "../../ports/model-catalog.port.js";
import type { ProviderRegistryPort } from "../../ports/provider-registry.port.js";
import type { TelemetryPort } from "../../ports/telemetry.port.js";

export interface ModelDiscoveryDependencies {
  controlPlane: ControlPlanePort;
  providerRegistry: ProviderRegistryPort;
  // Catálogo curado: fallback cuando un proveedor no se puede descubrir (sin credencial,
  // red caída, o proveedor que no expone /models).
  modelCatalog: ModelCatalogPort;
  telemetry: TelemetryPort;
  // Proveedores REALES a descubrir con la credencial del usuario (p.ej. opencode_zen,
  // opencode_go). El proveedor fake no se descubre: vive solo en el catálogo curado.
  discoverableProviderIds: string[];
  // TTL del cache por usuario (ms). El listado de modelos del proveedor cambia poco;
  // cachear evita golpear /models en cada turno tras un models.list reciente.
  cacheTtlMs?: number;
}

interface CacheEntry {
  at: number;
  models: ModelDescriptor[];
}

/**
 * Descubre los modelos REALES disponibles consultando el API del proveedor (`/models`) con
 * la credencial ARRENDADA del usuario, en vez de asumir un catálogo curado. Así el selector
 * y el turno usan los ids EXACTOS del proveedor y, cuando el proveedor las expone, sus
 * capacidades reales. Si un proveedor no tiene credencial o no se puede consultar, se cae al
 * catálogo curado para ese proveedor (best-effort, nunca rompe la lista).
 *
 * El secreto arrendado se usa solo para llamar a `/models`; nunca se loguea.
 */
export class ModelDiscoveryService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheTtlMs: number;

  constructor(private readonly deps: ModelDiscoveryDependencies) {
    this.cacheTtlMs = deps.cacheTtlMs ?? 60_000;
  }

  /** Lista los modelos para un usuario: discovery por proveedor + curado de fallback. */
  async listForUser(userId: string): Promise<ModelDescriptor[]> {
    const curated = await this.deps.modelCatalog.list();
    const result: ModelDescriptor[] = [...curated];

    for (const providerId of this.deps.discoverableProviderIds) {
      const lease = await this.deps.controlPlane.leaseCredentialForProvider({ userId, providerId });
      if (!lease) {
        // El usuario no tiene credencial para este proveedor → se mantiene lo curado.
        continue;
      }

      try {
        const adapter = this.deps.providerRegistry.get(providerId as ProviderProtocol);
        const discovered = await adapter.discoverModels(lease);
        if (discovered.length > 0) {
          // Sustituye las entradas curadas de ESTE proveedor por las reales descubiertas.
          for (let i = result.length - 1; i >= 0; i -= 1) {
            if (result[i]!.route.providerId === providerId) {
              result.splice(i, 1);
            }
          }
          result.push(...discovered);
        }
      } catch (error) {
        // Best-effort: si /models falla, se conserva el curado de ese proveedor. Solo se
        // registra el código (sin secreto ni cuerpo de respuesta).
        this.deps.telemetry.warn("model discovery failed", {
          providerId,
          code: toGatewayError(error).code
        });
      }
    }

    this.cache.set(userId, { at: Date.now(), models: result });
    return result;
  }

  /**
   * Resuelve el descriptor del modelo seleccionado para un turno. Usa el cache reciente del
   * discovery (poblado por models.list); si no hay, intenta descubrir el proveedor; y si todo
   * falla, cae al catálogo curado. Devuelve el modelo CON las capacidades del proveedor.
   */
  async resolveForUser(
    userId: string,
    providerId: string,
    modelId: string
  ): Promise<ModelDescriptor> {
    const cached = this.cache.get(userId);
    if (cached && Date.now() - cached.at < this.cacheTtlMs) {
      const hit = cached.models.find(
        (model) => model.route.providerId === providerId && model.route.providerModelId === modelId
      );
      if (hit) {
        return hit;
      }
    }

    if (this.deps.discoverableProviderIds.includes(providerId)) {
      const lease = await this.deps.controlPlane.leaseCredentialForProvider({ userId, providerId });
      if (lease) {
        try {
          const adapter = this.deps.providerRegistry.get(providerId as ProviderProtocol);
          const discovered = await adapter.discoverModels(lease);
          const hit = discovered.find((model) => model.route.providerModelId === modelId);
          if (hit) {
            return hit;
          }
        } catch (error) {
          this.deps.telemetry.warn("model discovery failed", {
            providerId,
            code: toGatewayError(error).code
          });
        }
      }
    }

    // Fallback: catálogo curado (también cubre el proveedor fake de dev/tests).
    return this.deps.modelCatalog.resolve({ providerId, modelId });
  }
}
