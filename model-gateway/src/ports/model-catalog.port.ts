import type { ModelDescriptor, ModelId, ProviderId } from "../domain/model.js";

export interface ModelCatalogPort {
  resolve(input: { providerId: ProviderId; modelId: ModelId }): Promise<ModelDescriptor>;
}
