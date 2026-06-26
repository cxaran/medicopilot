import type { ProviderProtocol } from "../domain/model.js";
import type { ProviderAdapter } from "./provider-adapter.port.js";

export interface ProviderRegistryPort {
  get(protocol: ProviderProtocol): ProviderAdapter;
}
