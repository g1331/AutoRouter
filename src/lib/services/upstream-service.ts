// Re-export SSRF validation functions
export { isIpSafe, isUrlSafe, resolveAndValidateHostname } from "./upstream-ssrf-validator";

// Re-export connection testing functions and types
export {
  testUpstreamConnection,
  formatTestUpstreamResponse,
  type TestUpstreamInput,
  type TestUpstreamResult,
} from "./upstream-connection-tester";

// Re-export CRUD functions, types, and error classes
export {
  // Error classes
  UpstreamNotFoundError,
  // Upstream CRUD functions
  createUpstream,
  updateUpstream,
  deleteUpstream,
  listUpstreams,
  getUpstreamById,
  loadActiveUpstreams,
  getDefaultUpstream,
  getUpstreamByName,
  getDecryptedApiKey,
  maskApiKey,
  // Upstream types
  type UpstreamCreateInput,
  type UpstreamUpdateInput,
  type UpstreamResponse,
  type PaginatedUpstreams,
} from "./upstream-crud";

// Re-export model router functions and types
export {
  // Model router functions
  routeByModel,
  getProviderTypeForModel,
  resolveModelWithRedirects,
  filterUpstreamsByModel,
  validateModelRedirects,
  detectCircularRedirect,
  // Constants
  VALID_PROVIDER_TYPES,
  MODEL_PREFIX_TO_PROVIDER_TYPE,
  // Types
  type ProviderType,
  type ModelRouterResult,
} from "./model-router";
