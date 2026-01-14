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
  UpstreamNotFoundError,
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
  type UpstreamCreateInput,
  type UpstreamUpdateInput,
  type UpstreamResponse,
  type PaginatedUpstreams,
} from "./upstream-crud";
