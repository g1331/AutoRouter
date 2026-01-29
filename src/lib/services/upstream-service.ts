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
  UpstreamGroupNotFoundError,
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
  // Upstream Group CRUD functions
  createUpstreamGroup,
  updateUpstreamGroup,
  deleteUpstreamGroup,
  listUpstreamGroups,
  getUpstreamGroupById,
  getUpstreamGroupByName,
  // Upstream Group Membership functions
  addUpstreamToGroup,
  removeUpstreamFromGroup,
  getUpstreamsInGroup,
  getStandaloneUpstreams,
  // Upstream types
  type UpstreamCreateInput,
  type UpstreamUpdateInput,
  type UpstreamResponse,
  type PaginatedUpstreams,
  // Upstream Group types
  type UpstreamGroupCreateInput,
  type UpstreamGroupUpdateInput,
  type UpstreamGroupResponse,
  type PaginatedUpstreamGroups,
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
