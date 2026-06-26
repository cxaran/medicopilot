import type { ProviderId, ProviderProtocol } from "./model.js";

export interface ProviderDefinition {
  id: ProviderId;
  displayName: string;
  allowedBaseUrls: readonly string[];
  supportedProtocols: readonly ProviderProtocol[];
  supportsModelDiscovery: boolean;
  supportsCredentialValidation: boolean;
  credentialKind: "api_key" | "oauth" | "local_no_auth" | "service_account";
}
