import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  apiKeys,
  upstreams,
  apiKeyUpstreams,
  requestLogs,
  apiKeysRelations,
  upstreamsRelations,
  apiKeyUpstreamsRelations,
  requestLogsRelations,
  type ApiKey,
  type NewApiKey,
  type Upstream,
  type NewUpstream,
  type ApiKeyUpstream,
  type NewApiKeyUpstream,
  type RequestLog,
  type NewRequestLog,
} from "@/lib/db/schema";

describe("lib/db/schema", () => {
  describe("apiKeys table", () => {
    it("has id column", () => {
      expect(apiKeys.id).toBeDefined();
      expect(apiKeys.id.name).toBe("id");
    });

    it("has keyHash column", () => {
      expect(apiKeys.keyHash).toBeDefined();
      expect(apiKeys.keyHash.name).toBe("key_hash");
    });

    it("has keyValueEncrypted column", () => {
      expect(apiKeys.keyValueEncrypted).toBeDefined();
      expect(apiKeys.keyValueEncrypted.name).toBe("key_value_encrypted");
    });

    it("has keyPrefix column", () => {
      expect(apiKeys.keyPrefix).toBeDefined();
      expect(apiKeys.keyPrefix.name).toBe("key_prefix");
    });

    it("has name column", () => {
      expect(apiKeys.name).toBeDefined();
      expect(apiKeys.name.name).toBe("name");
    });

    it("has description column", () => {
      expect(apiKeys.description).toBeDefined();
      expect(apiKeys.description.name).toBe("description");
    });

    it("has userId column", () => {
      expect(apiKeys.userId).toBeDefined();
      expect(apiKeys.userId.name).toBe("user_id");
    });

    it("has isActive column", () => {
      expect(apiKeys.isActive).toBeDefined();
      expect(apiKeys.isActive.name).toBe("is_active");
    });

    it("has expiresAt column", () => {
      expect(apiKeys.expiresAt).toBeDefined();
      expect(apiKeys.expiresAt.name).toBe("expires_at");
    });

    it("has timestamps", () => {
      expect(apiKeys.createdAt).toBeDefined();
      expect(apiKeys.createdAt.name).toBe("created_at");
      expect(apiKeys.updatedAt).toBeDefined();
      expect(apiKeys.updatedAt.name).toBe("updated_at");
    });

    it("has correct indexes", () => {
      const tableConfig = getTableConfig(apiKeys);
      const indexNames = tableConfig.indexes.map((i) => i.config.name);
      expect(indexNames).toContain("api_keys_key_hash_idx");
      expect(indexNames).toContain("api_keys_is_active_idx");
    });
  });

  describe("upstreams table", () => {
    it("has id column", () => {
      expect(upstreams.id).toBeDefined();
      expect(upstreams.id.name).toBe("id");
    });

    it("has name column", () => {
      expect(upstreams.name).toBeDefined();
      expect(upstreams.name.name).toBe("name");
    });

    it("has providerType column", () => {
      expect(upstreams.providerType).toBeDefined();
      expect(upstreams.providerType.name).toBe("provider_type");
    });

    it("has baseUrl column", () => {
      expect(upstreams.baseUrl).toBeDefined();
      expect(upstreams.baseUrl.name).toBe("base_url");
    });

    it("has apiKeyEncrypted column", () => {
      expect(upstreams.apiKeyEncrypted).toBeDefined();
      expect(upstreams.apiKeyEncrypted.name).toBe("api_key_encrypted");
    });

    it("has isDefault column", () => {
      expect(upstreams.isDefault).toBeDefined();
      expect(upstreams.isDefault.name).toBe("is_default");
    });

    it("has timeout column", () => {
      expect(upstreams.timeout).toBeDefined();
      expect(upstreams.timeout.name).toBe("timeout");
    });

    it("has isActive column", () => {
      expect(upstreams.isActive).toBeDefined();
      expect(upstreams.isActive.name).toBe("is_active");
    });

    it("has config column", () => {
      expect(upstreams.config).toBeDefined();
      expect(upstreams.config.name).toBe("config");
    });

    it("has timestamps", () => {
      expect(upstreams.createdAt).toBeDefined();
      expect(upstreams.updatedAt).toBeDefined();
    });

    it("has correct indexes", () => {
      const tableConfig = getTableConfig(upstreams);
      const indexNames = tableConfig.indexes.map((i) => i.config.name);
      expect(indexNames).toContain("upstreams_name_idx");
      expect(indexNames).toContain("upstreams_is_active_idx");
    });

    it("has providerType column for model-based routing", () => {
      expect(upstreams.providerType).toBeDefined();
      expect(upstreams.providerType.name).toBe("provider_type");
    });

    it("has allowedModels column for model filtering", () => {
      expect(upstreams.allowedModels).toBeDefined();
      expect(upstreams.allowedModels.name).toBe("allowed_models");
    });

    it("has modelRedirects column for model name mapping", () => {
      expect(upstreams.modelRedirects).toBeDefined();
      expect(upstreams.modelRedirects.name).toBe("model_redirects");
    });

    it("has provider_type + priority composite index", () => {
      const tableConfig = getTableConfig(upstreams);
      const indexNames = tableConfig.indexes.map((i) => i.config.name);
      expect(indexNames).toContain("upstreams_provider_type_priority_idx");
    });
  });

  describe("apiKeyUpstreams table", () => {
    it("has id column", () => {
      expect(apiKeyUpstreams.id).toBeDefined();
      expect(apiKeyUpstreams.id.name).toBe("id");
    });

    it("has apiKeyId foreign key", () => {
      expect(apiKeyUpstreams.apiKeyId).toBeDefined();
      expect(apiKeyUpstreams.apiKeyId.name).toBe("api_key_id");
    });

    it("has upstreamId foreign key", () => {
      expect(apiKeyUpstreams.upstreamId).toBeDefined();
      expect(apiKeyUpstreams.upstreamId.name).toBe("upstream_id");
    });

    it("has createdAt timestamp", () => {
      expect(apiKeyUpstreams.createdAt).toBeDefined();
      expect(apiKeyUpstreams.createdAt.name).toBe("created_at");
    });

    it("has correct indexes and constraints", () => {
      const tableConfig = getTableConfig(apiKeyUpstreams);
      const indexNames = tableConfig.indexes.map((i) => i.config.name);
      expect(indexNames).toContain("api_key_upstreams_api_key_id_idx");
      expect(indexNames).toContain("api_key_upstreams_upstream_id_idx");
      // Unique constraint
      expect(tableConfig.uniqueConstraints.length).toBeGreaterThan(0);
    });
  });

  describe("requestLogs table", () => {
    it("has id column", () => {
      expect(requestLogs.id).toBeDefined();
      expect(requestLogs.id.name).toBe("id");
    });

    it("has apiKeyId reference", () => {
      expect(requestLogs.apiKeyId).toBeDefined();
      expect(requestLogs.apiKeyId.name).toBe("api_key_id");
    });

    it("has upstreamId reference", () => {
      expect(requestLogs.upstreamId).toBeDefined();
      expect(requestLogs.upstreamId.name).toBe("upstream_id");
    });

    it("has method column", () => {
      expect(requestLogs.method).toBeDefined();
      expect(requestLogs.method.name).toBe("method");
    });

    it("has path column", () => {
      expect(requestLogs.path).toBeDefined();
      expect(requestLogs.path.name).toBe("path");
    });

    it("has model column", () => {
      expect(requestLogs.model).toBeDefined();
      expect(requestLogs.model.name).toBe("model");
    });

    it("has promptTokens column", () => {
      expect(requestLogs.promptTokens).toBeDefined();
      expect(requestLogs.promptTokens.name).toBe("prompt_tokens");
    });

    it("has completionTokens column", () => {
      expect(requestLogs.completionTokens).toBeDefined();
      expect(requestLogs.completionTokens.name).toBe("completion_tokens");
    });

    it("has totalTokens column", () => {
      expect(requestLogs.totalTokens).toBeDefined();
      expect(requestLogs.totalTokens.name).toBe("total_tokens");
    });

    it("has cachedTokens column with default 0", () => {
      expect(requestLogs.cachedTokens).toBeDefined();
      expect(requestLogs.cachedTokens.name).toBe("cached_tokens");
      expect(requestLogs.cachedTokens.default).toBe(0);
    });

    it("has reasoningTokens column with default 0", () => {
      expect(requestLogs.reasoningTokens).toBeDefined();
      expect(requestLogs.reasoningTokens.name).toBe("reasoning_tokens");
      expect(requestLogs.reasoningTokens.default).toBe(0);
    });

    it("has cacheCreationTokens column with default 0", () => {
      expect(requestLogs.cacheCreationTokens).toBeDefined();
      expect(requestLogs.cacheCreationTokens.name).toBe("cache_creation_tokens");
      expect(requestLogs.cacheCreationTokens.default).toBe(0);
    });

    it("has cacheReadTokens column with default 0", () => {
      expect(requestLogs.cacheReadTokens).toBeDefined();
      expect(requestLogs.cacheReadTokens.name).toBe("cache_read_tokens");
      expect(requestLogs.cacheReadTokens.default).toBe(0);
    });

    it("has statusCode column", () => {
      expect(requestLogs.statusCode).toBeDefined();
      expect(requestLogs.statusCode.name).toBe("status_code");
    });

    it("has durationMs column", () => {
      expect(requestLogs.durationMs).toBeDefined();
      expect(requestLogs.durationMs.name).toBe("duration_ms");
    });

    it("has errorMessage column", () => {
      expect(requestLogs.errorMessage).toBeDefined();
      expect(requestLogs.errorMessage.name).toBe("error_message");
    });

    it("has routingType column", () => {
      expect(requestLogs.routingType).toBeDefined();
      expect(requestLogs.routingType.name).toBe("routing_type");
    });

    it("has groupName column", () => {
      expect(requestLogs.groupName).toBeDefined();
      expect(requestLogs.groupName.name).toBe("group_name");
    });

    it("has lbStrategy column", () => {
      expect(requestLogs.lbStrategy).toBeDefined();
      expect(requestLogs.lbStrategy.name).toBe("lb_strategy");
    });

    it("has failoverAttempts column with default 0", () => {
      expect(requestLogs.failoverAttempts).toBeDefined();
      expect(requestLogs.failoverAttempts.name).toBe("failover_attempts");
      expect(requestLogs.failoverAttempts.default).toBe(0);
    });

    it("has failoverHistory column", () => {
      expect(requestLogs.failoverHistory).toBeDefined();
      expect(requestLogs.failoverHistory.name).toBe("failover_history");
    });

    it("has createdAt timestamp", () => {
      expect(requestLogs.createdAt).toBeDefined();
      expect(requestLogs.createdAt.name).toBe("created_at");
    });

    it("has correct indexes", () => {
      const tableConfig = getTableConfig(requestLogs);
      const indexNames = tableConfig.indexes.map((i) => i.config.name);
      expect(indexNames).toContain("request_logs_api_key_id_idx");
      expect(indexNames).toContain("request_logs_upstream_id_idx");
      expect(indexNames).toContain("request_logs_created_at_idx");
      expect(indexNames).toContain("request_logs_routing_type_idx");
    });
  });

  describe("Relations", () => {
    it("exports apiKeysRelations", () => {
      expect(apiKeysRelations).toBeDefined();
    });

    it("exports upstreamsRelations", () => {
      expect(upstreamsRelations).toBeDefined();
    });

    it("exports apiKeyUpstreamsRelations", () => {
      expect(apiKeyUpstreamsRelations).toBeDefined();
    });

    it("exports requestLogsRelations", () => {
      expect(requestLogsRelations).toBeDefined();
    });
  });

  describe("Type exports", () => {
    it("exports ApiKey type", () => {
      // Type check - if this compiles, the type exists
      const _typeCheck: ApiKey | null = null;
      expect(_typeCheck).toBeNull();
    });

    it("exports NewApiKey type", () => {
      const _typeCheck: NewApiKey | null = null;
      expect(_typeCheck).toBeNull();
    });

    it("exports Upstream type", () => {
      const _typeCheck: Upstream | null = null;
      expect(_typeCheck).toBeNull();
    });

    it("exports NewUpstream type", () => {
      const _typeCheck: NewUpstream | null = null;
      expect(_typeCheck).toBeNull();
    });

    it("exports ApiKeyUpstream type", () => {
      const _typeCheck: ApiKeyUpstream | null = null;
      expect(_typeCheck).toBeNull();
    });

    it("exports NewApiKeyUpstream type", () => {
      const _typeCheck: NewApiKeyUpstream | null = null;
      expect(_typeCheck).toBeNull();
    });

    it("exports RequestLog type", () => {
      const _typeCheck: RequestLog | null = null;
      expect(_typeCheck).toBeNull();
    });

    it("exports NewRequestLog type", () => {
      const _typeCheck: NewRequestLog | null = null;
      expect(_typeCheck).toBeNull();
    });
  });
});
