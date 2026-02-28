import { describe, it, expect } from "vitest";
import {
  toISOStringOrNull,
  transformUpstreamToApi,
  transformPaginatedUpstreams,
  transformApiKeyToApi,
  transformApiKeyCreateToApi,
  transformApiKeyRevealToApi,
  transformPaginatedApiKeys,
  transformRequestLogToApi,
  transformPaginatedRequestLogs,
  transformBillingModelPriceToApi,
  transformPaginatedBillingModelPrices,
  transformStatsOverviewToApi,
  transformTimeseriesDataPointToApi,
  transformUpstreamTimeseriesToApi,
  transformStatsTimeseriesToApi,
  transformLeaderboardApiKeyToApi,
  transformLeaderboardUpstreamToApi,
  transformLeaderboardModelToApi,
  transformStatsLeaderboardToApi,
} from "@/lib/utils/api-transformers";

describe("api-transformers", () => {
  describe("toISOStringOrNull", () => {
    it("should convert Date to ISO string", () => {
      const date = new Date("2024-01-15T10:30:00.000Z");
      const result = toISOStringOrNull(date);
      expect(result).toBe("2024-01-15T10:30:00.000Z");
    });

    it("should return null for null input", () => {
      const result = toISOStringOrNull(null);
      expect(result).toBeNull();
    });

    it("should return null for undefined input", () => {
      const result = toISOStringOrNull(undefined);
      expect(result).toBeNull();
    });
  });

  describe("transformUpstreamToApi", () => {
    it("should transform upstream to API response format", () => {
      const upstream = {
        id: "upstream-123",
        name: "openai-prod",
        providerType: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyMasked: "sk-***key",
        isDefault: true,
        timeout: 60,
        isActive: true,
        config: '{"model": "gpt-4"}',
        affinityMigration: null,
        createdAt: new Date("2024-01-15T10:00:00.000Z"),
        updatedAt: new Date("2024-01-15T12:00:00.000Z"),
      };

      const result = transformUpstreamToApi(upstream);

      expect(result).toEqual({
        id: "upstream-123",
        name: "openai-prod",
        base_url: "https://api.openai.com",
        api_key_masked: "sk-***key",
        is_default: true,
        timeout: 60,
        is_active: true,
        config: '{"model": "gpt-4"}',
        created_at: "2024-01-15T10:00:00.000Z",
        updated_at: "2024-01-15T12:00:00.000Z",
        priority: undefined,
        weight: undefined,
        route_capabilities: undefined,
        allowed_models: undefined,
        model_redirects: undefined,
        affinity_migration: null,
        billing_input_multiplier: 1,
        billing_output_multiplier: 1,
        daily_spending_limit: null,
        monthly_spending_limit: null,
        circuit_breaker: null,
      });
    });

    it("should handle null config", () => {
      const upstream = {
        id: "upstream-456",
        name: "anthropic-prod",
        providerType: "anthropic",
        baseUrl: "https://api.anthropic.com",
        apiKeyMasked: "sk-***abc",
        isDefault: false,
        timeout: 30,
        isActive: false,
        config: null,
        affinityMigration: null,
        createdAt: new Date("2024-01-10T08:00:00.000Z"),
        updatedAt: new Date("2024-01-10T08:00:00.000Z"),
      };

      const result = transformUpstreamToApi(upstream);

      expect(result.config).toBeNull();
      expect(result.is_default).toBe(false);
      expect(result.is_active).toBe(false);
    });
  });

  describe("transformPaginatedUpstreams", () => {
    it("should transform paginated upstreams to API response format", () => {
      const paginatedResult = {
        items: [
          {
            id: "upstream-1",
            name: "openai",
            providerType: "openai",
            baseUrl: "https://api.openai.com",
            apiKeyMasked: "sk-***1",
            isDefault: true,
            timeout: 60,
            isActive: true,
            config: null,
            affinityMigration: null,
            createdAt: new Date("2024-01-15T10:00:00.000Z"),
            updatedAt: new Date("2024-01-15T10:00:00.000Z"),
          },
          {
            id: "upstream-2",
            name: "anthropic",
            providerType: "anthropic",
            baseUrl: "https://api.anthropic.com",
            apiKeyMasked: "sk-***2",
            isDefault: false,
            timeout: 30,
            isActive: true,
            config: null,
            affinityMigration: null,
            createdAt: new Date("2024-01-14T10:00:00.000Z"),
            updatedAt: new Date("2024-01-14T10:00:00.000Z"),
          },
        ],
        total: 25,
        page: 2,
        pageSize: 10,
        totalPages: 3,
      };

      const result = transformPaginatedUpstreams(paginatedResult);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(25);
      expect(result.page).toBe(2);
      expect(result.page_size).toBe(10);
      expect(result.total_pages).toBe(3);
      expect(result.items[0].base_url).toBe("https://api.openai.com");
      expect(result.items[1].base_url).toBe("https://api.anthropic.com");
    });

    it("should handle empty items array", () => {
      const paginatedResult = {
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      };

      const result = transformPaginatedUpstreams(paginatedResult);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.total_pages).toBe(0);
    });
  });

  describe("transformApiKeyToApi", () => {
    it("should transform API key to API response format", () => {
      const apiKey = {
        id: "key-123",
        keyPrefix: "ar_live_",
        name: "Production Key",
        description: "Main production API key",
        upstreamIds: ["upstream-1", "upstream-2"],
        isActive: true,
        expiresAt: new Date("2025-01-15T00:00:00.000Z"),
        createdAt: new Date("2024-01-15T10:00:00.000Z"),
        updatedAt: new Date("2024-01-15T12:00:00.000Z"),
      };

      const result = transformApiKeyToApi(apiKey);

      expect(result).toEqual({
        id: "key-123",
        key_prefix: "ar_live_",
        name: "Production Key",
        description: "Main production API key",
        upstream_ids: ["upstream-1", "upstream-2"],
        is_active: true,
        expires_at: "2025-01-15T00:00:00.000Z",
        created_at: "2024-01-15T10:00:00.000Z",
        updated_at: "2024-01-15T12:00:00.000Z",
      });
    });

    it("should handle null expiresAt", () => {
      const apiKey = {
        id: "key-456",
        keyPrefix: "ar_test_",
        name: "Test Key",
        description: null,
        upstreamIds: [],
        isActive: false,
        expiresAt: null,
        createdAt: new Date("2024-01-10T08:00:00.000Z"),
        updatedAt: new Date("2024-01-10T08:00:00.000Z"),
      };

      const result = transformApiKeyToApi(apiKey);

      expect(result.expires_at).toBeNull();
      expect(result.description).toBeNull();
      expect(result.upstream_ids).toEqual([]);
      expect(result.is_active).toBe(false);
    });
  });

  describe("transformApiKeyCreateToApi", () => {
    it("should transform created API key to API response format with key_value", () => {
      const createResult = {
        id: "key-789",
        keyValue: "ar_live_abc123xyz789",
        keyPrefix: "ar_live_",
        name: "New Key",
        description: "Newly created key",
        upstreamIds: ["upstream-1"],
        isActive: true,
        expiresAt: new Date("2025-06-01T00:00:00.000Z"),
        createdAt: new Date("2024-01-15T10:00:00.000Z"),
        updatedAt: new Date("2024-01-15T10:00:00.000Z"),
      };

      const result = transformApiKeyCreateToApi(createResult);

      expect(result).toEqual({
        id: "key-789",
        key_value: "ar_live_abc123xyz789",
        key_prefix: "ar_live_",
        name: "New Key",
        description: "Newly created key",
        upstream_ids: ["upstream-1"],
        is_active: true,
        expires_at: "2025-06-01T00:00:00.000Z",
        created_at: "2024-01-15T10:00:00.000Z",
        updated_at: "2024-01-15T10:00:00.000Z",
      });
    });

    it("should handle null expiresAt in create result", () => {
      const createResult = {
        id: "key-000",
        keyValue: "ar_test_xyz",
        keyPrefix: "ar_test_",
        name: "No Expiry Key",
        description: null,
        upstreamIds: [],
        isActive: true,
        expiresAt: null,
        createdAt: new Date("2024-01-15T10:00:00.000Z"),
        updatedAt: new Date("2024-01-15T10:00:00.000Z"),
      };

      const result = transformApiKeyCreateToApi(createResult);

      expect(result.expires_at).toBeNull();
      expect(result.key_value).toBe("ar_test_xyz");
    });
  });

  describe("transformApiKeyRevealToApi", () => {
    it("should transform revealed API key to API response format", () => {
      const revealResult = {
        id: "key-123",
        keyValue: "ar_live_abc123xyz789fullkey",
        keyPrefix: "ar_live_",
        name: "Production Key",
      };

      const result = transformApiKeyRevealToApi(revealResult);

      expect(result).toEqual({
        id: "key-123",
        key_value: "ar_live_abc123xyz789fullkey",
        key_prefix: "ar_live_",
        name: "Production Key",
      });
    });
  });

  describe("transformPaginatedApiKeys", () => {
    it("should transform paginated API keys to API response format", () => {
      const paginatedResult = {
        items: [
          {
            id: "key-1",
            keyPrefix: "ar_live_",
            name: "Key 1",
            description: "First key",
            upstreamIds: ["upstream-1"],
            isActive: true,
            expiresAt: null,
            createdAt: new Date("2024-01-15T10:00:00.000Z"),
            updatedAt: new Date("2024-01-15T10:00:00.000Z"),
          },
        ],
        total: 50,
        page: 3,
        pageSize: 15,
        totalPages: 4,
      };

      const result = transformPaginatedApiKeys(paginatedResult);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(50);
      expect(result.page).toBe(3);
      expect(result.page_size).toBe(15);
      expect(result.total_pages).toBe(4);
      expect(result.items[0].key_prefix).toBe("ar_live_");
    });
  });

  describe("transformRequestLogToApi", () => {
    it("should transform request log to API response format", () => {
      const log = {
        id: "log-123",
        apiKeyId: "key-456",
        upstreamId: "upstream-789",
        upstreamName: "openai-primary",
        method: "POST",
        path: "/v1/chat/completions",
        model: "gpt-4",
        promptTokens: 100,
        completionTokens: 200,
        totalTokens: 300,
        cachedTokens: 10,
        reasoningTokens: 20,
        cacheCreationTokens: 5,
        cacheReadTokens: 8,
        statusCode: 200,
        durationMs: 1500,
        errorMessage: null,
        routingType: "group",
        groupName: "openai-pool",
        lbStrategy: "round_robin",
        failoverAttempts: 1,
        failoverHistory: [
          {
            upstream_id: "upstream-failed",
            upstream_name: "openai-backup",
            attempted_at: "2024-01-15T10:29:50.000Z",
            error_type: "http_5xx" as const,
            error_message: "HTTP 502 error",
            status_code: 502,
          },
        ],
        createdAt: new Date("2024-01-15T10:30:00.000Z"),
      };

      const result = transformRequestLogToApi(log as never);

      expect(result).toEqual({
        id: "log-123",
        api_key_id: "key-456",
        upstream_id: "upstream-789",
        upstream_name: "openai-primary",
        method: "POST",
        path: "/v1/chat/completions",
        model: "gpt-4",
        prompt_tokens: 100,
        completion_tokens: 200,
        total_tokens: 300,
        cached_tokens: 10,
        reasoning_tokens: 20,
        cache_creation_tokens: 5,
        cache_read_tokens: 8,
        status_code: 200,
        duration_ms: 1500,
        error_message: null,
        routing_type: "group",
        group_name: "openai-pool",
        lb_strategy: "round_robin",
        failover_attempts: 1,
        failover_history: [
          {
            upstream_id: "upstream-failed",
            upstream_name: "openai-backup",
            attempted_at: "2024-01-15T10:29:50.000Z",
            error_type: "http_5xx",
            error_message: "HTTP 502 error",
            status_code: 502,
          },
        ],
        created_at: "2024-01-15T10:30:00.000Z",
        routing_decision: undefined,
        routing_duration_ms: undefined,
        ttft_ms: undefined,
        session_id: undefined,
        affinity_hit: undefined,
        affinity_migrated: undefined,
        is_stream: undefined,
        priority_tier: undefined,
        session_id_compensated: undefined,
        header_diff: null,
      });
    });

    it("should include billing breakdown fields when provided", () => {
      const log = {
        id: "log-billing-1",
        apiKeyId: "key-1",
        upstreamId: "upstream-1",
        upstreamName: "openai-primary",
        method: "POST",
        path: "/v1/chat/completions",
        model: "gpt-4",
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cachedTokens: 0,
        reasoningTokens: 0,
        cacheCreationTokens: 10,
        cacheReadTokens: 20,
        statusCode: 200,
        durationMs: 1000,
        errorMessage: null,
        routingType: null,
        groupName: null,
        lbStrategy: null,
        failoverAttempts: 0,
        failoverHistory: null,
        billingStatus: "billed" as const,
        unbillableReason: null,
        priceSource: "litellm",
        baseInputPricePerMillion: 3,
        baseOutputPricePerMillion: 15,
        baseCacheReadInputPricePerMillion: 0.3,
        baseCacheWriteInputPricePerMillion: 3,
        inputMultiplier: 1.2,
        outputMultiplier: 1.1,
        billedInputTokens: 100,
        cacheReadCost: 0.0000072,
        cacheWriteCost: 0.000036,
        finalCost: 0.0012282,
        currency: "USD",
        billedAt: new Date("2024-01-15T10:29:59.000Z"),
        createdAt: new Date("2024-01-15T10:30:00.000Z"),
      };

      const result = transformRequestLogToApi(log as never);

      expect(result).toMatchObject({
        billing_status: "billed",
        price_source: "litellm",
        base_input_price_per_million: 3,
        base_output_price_per_million: 15,
        base_cache_read_input_price_per_million: 0.3,
        base_cache_write_input_price_per_million: 3,
        input_multiplier: 1.2,
        output_multiplier: 1.1,
        billed_input_tokens: 100,
        cache_read_cost: 0.0000072,
        cache_write_cost: 0.000036,
        final_cost: 0.0012282,
        currency: "USD",
      });
    });

    it("should handle null values in request log", () => {
      const log = {
        id: "log-456",
        apiKeyId: null,
        upstreamId: null,
        upstreamName: null,
        method: null,
        path: null,
        model: null,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cachedTokens: 0,
        reasoningTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        statusCode: null,
        durationMs: null,
        errorMessage: "Connection timeout",
        routingType: null,
        groupName: null,
        lbStrategy: null,
        failoverAttempts: 0,
        failoverHistory: null,
        createdAt: new Date("2024-01-15T10:30:00.000Z"),
      };

      const result = transformRequestLogToApi(log as never);

      expect(result.api_key_id).toBeNull();
      expect(result.upstream_id).toBeNull();
      expect(result.upstream_name).toBeNull();
      expect(result.method).toBeNull();
      expect(result.path).toBeNull();
      expect(result.model).toBeNull();
      expect(result.status_code).toBeNull();
      expect(result.duration_ms).toBeNull();
      expect(result.error_message).toBe("Connection timeout");
      expect(result.routing_type).toBeNull();
      expect(result.group_name).toBeNull();
      expect(result.lb_strategy).toBeNull();
      expect(result.failover_attempts).toBe(0);
      expect(result.failover_history).toBeNull();
    });

    it("should normalize header_diff and sanitize sensitive header values", () => {
      const log = {
        id: "log-hdiff-1",
        apiKeyId: "key-1",
        upstreamId: "upstream-1",
        upstreamName: "openai-primary",
        method: "POST",
        path: "/v1/chat/completions",
        model: "gpt-4",
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3,
        cachedTokens: 0,
        reasoningTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        statusCode: 200,
        durationMs: 1,
        errorMessage: null,
        routingType: null,
        groupName: null,
        lbStrategy: null,
        failoverAttempts: 0,
        failoverHistory: null,
        headerDiff: {
          inbound_count: 2,
          outbound_count: 3,
          dropped: [
            "x-api-key",
            { header: "Authorization", value: "Bearer secretsecret" },
            { header: 123, value: "bad" },
          ],
          compensated: [
            { header: "Cookie", source: "headers.cookie", value: "a=b" },
            { header: "X-Api-Key", source: "headers.x-api-key", value: "mysecretkey" },
            {
              header: "Authorization",
              source: "headers.authorization",
              value: "Bearer tokentoken",
            },
            { header: "X-Already-Masked", source: "headers.x", value: "sk-***cdef" },
          ],
          unchanged: [
            { header: "Set-Cookie", value: "session=abc" },
            { header: "X-Trace", value: "trace-id" },
          ],
          auth_replaced: {
            header: "Authorization",
            inbound_value: "Bearer inboundtoken",
            outbound_value: "Bearer outboundtoken",
          },
        },
        createdAt: new Date("2024-01-15T10:30:00.000Z"),
      };

      const result = transformRequestLogToApi(log as never);

      expect(result.header_diff).not.toBeNull();
      expect(result.header_diff?.inbound_count).toBe(2);
      expect(result.header_diff?.outbound_count).toBe(3);

      const droppedAuth = result.header_diff?.dropped.find((e) => e.header === "Authorization");
      expect(droppedAuth?.value).toContain("***");
      expect(droppedAuth?.value).toContain("Bearer");

      const compensatedApiKey = result.header_diff?.compensated.find(
        (e) => e.header === "X-Api-Key"
      );
      expect(compensatedApiKey?.value).toContain("***");

      const compensatedCookie = result.header_diff?.compensated.find((e) => e.header === "Cookie");
      expect(compensatedCookie?.value).toBe("***");

      const unchangedSetCookie = result.header_diff?.unchanged.find(
        (e) => e.header === "Set-Cookie"
      );
      expect(unchangedSetCookie?.value).toBe("***");

      const alreadyMasked = result.header_diff?.compensated.find(
        (e) => e.header === "X-Already-Masked"
      );
      expect(alreadyMasked?.value).toBe("sk-***cdef");

      expect(result.header_diff?.auth_replaced?.inbound_value).toContain("***");
      expect(result.header_diff?.auth_replaced?.outbound_value).toContain("***");
    });

    it("should support auth_replaced shorthand string", () => {
      const log = {
        id: "log-hdiff-2",
        apiKeyId: "key-1",
        upstreamId: "upstream-1",
        upstreamName: "openai-primary",
        method: "POST",
        path: "/v1/chat/completions",
        model: "gpt-4",
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3,
        cachedTokens: 0,
        reasoningTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        statusCode: 200,
        durationMs: 1,
        errorMessage: null,
        routingType: null,
        groupName: null,
        lbStrategy: null,
        failoverAttempts: 0,
        failoverHistory: null,
        headerDiff: {
          auth_replaced: "Authorization",
        },
        createdAt: new Date("2024-01-15T10:30:00.000Z"),
      };

      const result = transformRequestLogToApi(log as never);
      expect(result.header_diff?.auth_replaced?.header).toBe("Authorization");
      expect(result.header_diff?.auth_replaced?.inbound_value).toBeNull();
      expect(result.header_diff?.auth_replaced?.outbound_value).toBe("");
    });
  });

  describe("transformPaginatedRequestLogs", () => {
    it("should transform paginated request logs to API response format", () => {
      const paginatedResult = {
        items: [
          {
            id: "log-1",
            apiKeyId: "key-1",
            upstreamId: "upstream-1",
            upstreamName: "openai-primary",
            method: "POST",
            path: "/v1/chat/completions",
            model: "gpt-4",
            promptTokens: 50,
            completionTokens: 100,
            totalTokens: 150,
            cachedTokens: 0,
            reasoningTokens: 0,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            statusCode: 200,
            durationMs: 800,
            errorMessage: null,
            routingType: "direct",
            groupName: null,
            lbStrategy: null,
            failoverAttempts: 0,
            failoverHistory: null,
            createdAt: new Date("2024-01-15T10:00:00.000Z"),
          },
        ],
        total: 1000,
        page: 5,
        pageSize: 50,
        totalPages: 20,
      };

      const result = transformPaginatedRequestLogs(paginatedResult as never);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1000);
      expect(result.page).toBe(5);
      expect(result.page_size).toBe(50);
      expect(result.total_pages).toBe(20);
      expect(result.items[0].prompt_tokens).toBe(50);
    });
  });

  describe("billing price catalog transformers", () => {
    it("should transform billing model price item to API response format", () => {
      const result = transformBillingModelPriceToApi({
        id: "price-1",
        model: "gpt-4.1",
        inputPricePerMillion: 2.5,
        outputPricePerMillion: 9.8,
        cacheReadInputPricePerMillion: 0.8,
        cacheWriteInputPricePerMillion: 3.2,
        source: "litellm",
        isActive: true,
        syncedAt: new Date("2026-02-28T08:00:00.000Z"),
        updatedAt: new Date("2026-02-28T08:05:00.000Z"),
      });

      expect(result).toEqual({
        id: "price-1",
        model: "gpt-4.1",
        input_price_per_million: 2.5,
        output_price_per_million: 9.8,
        cache_read_input_price_per_million: 0.8,
        cache_write_input_price_per_million: 3.2,
        source: "litellm",
        is_active: true,
        synced_at: "2026-02-28T08:00:00.000Z",
        updated_at: "2026-02-28T08:05:00.000Z",
      });
    });

    it("should transform paginated billing model prices to API response format", () => {
      const result = transformPaginatedBillingModelPrices({
        items: [
          {
            id: "price-1",
            model: "gpt-4.1",
            inputPricePerMillion: 2.5,
            outputPricePerMillion: 9.8,
            cacheReadInputPricePerMillion: null,
            cacheWriteInputPricePerMillion: null,
            source: "litellm",
            isActive: true,
            syncedAt: new Date("2026-02-28T08:00:00.000Z"),
            updatedAt: new Date("2026-02-28T08:05:00.000Z"),
          },
        ],
        total: 1,
        page: 1,
        pageSize: 50,
        totalPages: 1,
      });

      expect(result.items).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.page_size).toBe(50);
      expect(result.total_pages).toBe(1);
      expect(result.items[0].model).toBe("gpt-4.1");
    });
  });

  describe("transformStatsOverviewToApi", () => {
    it("should transform stats overview to API response format", () => {
      const stats = {
        todayRequests: 5000,
        avgResponseTimeMs: 250.5,
        totalTokensToday: 1500000,
        successRateToday: 99.5,
        avgTtftMs: 120.4,
        cacheHitRate: 45.2,
      };

      const result = transformStatsOverviewToApi(stats);

      expect(result).toEqual({
        today_requests: 5000,
        avg_response_time_ms: 250.5,
        total_tokens_today: 1500000,
        success_rate_today: 99.5,
        avg_ttft_ms: 120.4,
        cache_hit_rate: 45.2,
      });
    });

    it("should handle zero values", () => {
      const stats = {
        todayRequests: 0,
        avgResponseTimeMs: 0,
        totalTokensToday: 0,
        successRateToday: 0,
        avgTtftMs: 0,
        cacheHitRate: 0,
      };

      const result = transformStatsOverviewToApi(stats);

      expect(result.today_requests).toBe(0);
      expect(result.avg_response_time_ms).toBe(0);
      expect(result.total_tokens_today).toBe(0);
      expect(result.success_rate_today).toBe(0);
      expect(result.avg_ttft_ms).toBe(0);
      expect(result.cache_hit_rate).toBe(0);
    });
  });

  describe("transformTimeseriesDataPointToApi", () => {
    it("should transform timeseries data point to API response format", () => {
      const dataPoint = {
        timestamp: new Date("2024-01-15T10:00:00.000Z"),
        requestCount: 150,
        totalTokens: 45000,
        avgDurationMs: 320.5,
      };

      const result = transformTimeseriesDataPointToApi(dataPoint);

      expect(result).toEqual({
        timestamp: "2024-01-15T10:00:00.000Z",
        request_count: 150,
        total_tokens: 45000,
        avg_duration_ms: 320.5,
      });
    });
  });

  describe("transformUpstreamTimeseriesToApi", () => {
    it("should transform upstream timeseries to API response format", () => {
      const series = {
        upstreamId: "upstream-123",
        upstreamName: "OpenAI Production",
        data: [
          {
            timestamp: new Date("2024-01-15T10:00:00.000Z"),
            requestCount: 100,
            totalTokens: 30000,
            avgDurationMs: 250,
          },
          {
            timestamp: new Date("2024-01-15T11:00:00.000Z"),
            requestCount: 120,
            totalTokens: 36000,
            avgDurationMs: 280,
          },
        ],
      };

      const result = transformUpstreamTimeseriesToApi(series);

      expect(result.upstream_id).toBe("upstream-123");
      expect(result.upstream_name).toBe("OpenAI Production");
      expect(result.data).toHaveLength(2);
      expect(result.data[0].request_count).toBe(100);
      expect(result.data[1].request_count).toBe(120);
    });

    it("should handle null upstream_id", () => {
      const series = {
        upstreamId: null,
        upstreamName: "Unknown",
        data: [],
      };

      const result = transformUpstreamTimeseriesToApi(series);

      expect(result.upstream_id).toBeNull();
      expect(result.upstream_name).toBe("Unknown");
      expect(result.data).toHaveLength(0);
    });
  });

  describe("transformStatsTimeseriesToApi", () => {
    it("should transform stats timeseries to API response format", () => {
      const stats = {
        range: "24h" as const,
        granularity: "hour" as const,
        series: [
          {
            upstreamId: "upstream-1",
            upstreamName: "OpenAI",
            data: [
              {
                timestamp: new Date("2024-01-15T10:00:00.000Z"),
                requestCount: 100,
                totalTokens: 30000,
                avgDurationMs: 250,
              },
            ],
          },
        ],
      };

      const result = transformStatsTimeseriesToApi(stats);

      expect(result.range).toBe("24h");
      expect(result.granularity).toBe("hour");
      expect(result.series).toHaveLength(1);
      expect(result.series[0].upstream_name).toBe("OpenAI");
    });

    it("should handle day granularity", () => {
      const stats = {
        range: "7d" as const,
        granularity: "day" as const,
        series: [],
      };

      const result = transformStatsTimeseriesToApi(stats);

      expect(result.range).toBe("7d");
      expect(result.granularity).toBe("day");
      expect(result.series).toHaveLength(0);
    });
  });

  describe("transformLeaderboardApiKeyToApi", () => {
    it("should transform leaderboard API key item to API response format", () => {
      const item = {
        id: "key-123",
        name: "Production Key",
        keyPrefix: "ar_live_",
        requestCount: 5000,
        totalTokens: 1500000,
      };

      const result = transformLeaderboardApiKeyToApi(item);

      expect(result).toEqual({
        id: "key-123",
        name: "Production Key",
        key_prefix: "ar_live_",
        request_count: 5000,
        total_tokens: 1500000,
      });
    });
  });

  describe("transformLeaderboardUpstreamToApi", () => {
    it("should transform leaderboard upstream item to API response format", () => {
      const item = {
        id: "upstream-456",
        name: "OpenAI Production",
        providerType: "openai",
        requestCount: 10000,
        totalTokens: 3000000,
      };

      const result = transformLeaderboardUpstreamToApi(item);

      expect(result).toEqual({
        id: "upstream-456",
        name: "OpenAI Production",
        provider_type: "openai",
        request_count: 10000,
        total_tokens: 3000000,
      });
    });
  });

  describe("transformLeaderboardModelToApi", () => {
    it("should transform leaderboard model item to API response format", () => {
      const item = {
        model: "gpt-4-turbo",
        requestCount: 8000,
        totalTokens: 2400000,
      };

      const result = transformLeaderboardModelToApi(item);

      expect(result).toEqual({
        model: "gpt-4-turbo",
        request_count: 8000,
        total_tokens: 2400000,
      });
    });
  });

  describe("transformStatsLeaderboardToApi", () => {
    it("should transform stats leaderboard to API response format", () => {
      const stats = {
        range: "30d" as const,
        apiKeys: [
          {
            id: "key-1",
            name: "Key 1",
            keyPrefix: "ar_live_",
            requestCount: 5000,
            totalTokens: 1500000,
          },
        ],
        upstreams: [
          {
            id: "upstream-1",
            name: "OpenAI",
            providerType: "openai",
            requestCount: 10000,
            totalTokens: 3000000,
          },
        ],
        models: [
          {
            model: "gpt-4",
            requestCount: 8000,
            totalTokens: 2400000,
          },
        ],
      };

      const result = transformStatsLeaderboardToApi(stats);

      expect(result.range).toBe("30d");
      expect(result.api_keys).toHaveLength(1);
      expect(result.api_keys[0].key_prefix).toBe("ar_live_");
      expect(result.upstreams).toHaveLength(1);
      expect(result.upstreams[0].request_count).toBe(10000);
      expect(result.models).toHaveLength(1);
      expect(result.models[0].total_tokens).toBe(2400000);
    });

    it("should handle empty arrays", () => {
      const stats = {
        range: "24h" as const,
        apiKeys: [],
        upstreams: [],
        models: [],
      };

      const result = transformStatsLeaderboardToApi(stats);

      expect(result.range).toBe("24h");
      expect(result.api_keys).toHaveLength(0);
      expect(result.upstreams).toHaveLength(0);
      expect(result.models).toHaveLength(0);
    });
  });
});
