import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { extractTokenUsage, extractModelName } from "@/lib/services/request-logger";

// Mock the database module
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      requestLogs: {
        findMany: vi.fn(),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ value: 0 }])),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(),
      })),
    })),
  },
  requestLogs: {},
}));

describe("request-logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("extractTokenUsage", () => {
    describe("OpenAI format", () => {
      it("should extract standard OpenAI usage", () => {
        const response = {
          id: "chatcmpl-123",
          object: "chat.completion",
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
          },
        };

        const usage = extractTokenUsage(response);

        expect(usage).toEqual({
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cachedTokens: 0,
          reasoningTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
        });
      });

      it("should handle missing total_tokens", () => {
        const response = {
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
          },
        };

        const usage = extractTokenUsage(response);

        expect(usage).toEqual({
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150, // Calculated from prompt + completion
          cachedTokens: 0,
          reasoningTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
        });
      });

      it("should handle string values", () => {
        const response = {
          usage: {
            prompt_tokens: "100",
            completion_tokens: "50",
            total_tokens: "150",
          },
        };

        const usage = extractTokenUsage(response);

        expect(usage).toEqual({
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cachedTokens: 0,
          reasoningTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
        });
      });

      it("should handle partial OpenAI usage data", () => {
        const response = {
          usage: {
            prompt_tokens: 100,
          },
        };

        const usage = extractTokenUsage(response);

        expect(usage).toEqual({
          promptTokens: 100,
          completionTokens: 0,
          totalTokens: 100, // Defaults to prompt + completion when total_tokens missing
          cachedTokens: 0,
          reasoningTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
        });
      });
    });

    describe("Anthropic format", () => {
      it("should extract Anthropic usage", () => {
        const response = {
          type: "message",
          content: [{ type: "text", text: "Hello" }],
          usage: {
            input_tokens: 80,
            output_tokens: 40,
          },
        };

        const usage = extractTokenUsage(response);

        expect(usage).toEqual({
          promptTokens: 80,
          completionTokens: 40,
          totalTokens: 120,
          cachedTokens: 0,
          reasoningTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
        });
      });

      it("should handle partial Anthropic usage", () => {
        const response = {
          usage: {
            input_tokens: 50,
          },
        };

        const usage = extractTokenUsage(response);

        expect(usage).toEqual({
          promptTokens: 50,
          completionTokens: 0,
          totalTokens: 50,
          cachedTokens: 0,
          reasoningTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
        });
      });

      it("should handle only output_tokens", () => {
        const response = {
          usage: {
            output_tokens: 30,
          },
        };

        const usage = extractTokenUsage(response);

        expect(usage).toEqual({
          promptTokens: 0,
          completionTokens: 30,
          totalTokens: 30,
          cachedTokens: 0,
          reasoningTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
        });
      });
    });

    describe("OpenAI detailed token format", () => {
      it("should extract cached_tokens from prompt_tokens_details", () => {
        const response = {
          usage: {
            prompt_tokens: 1000,
            completion_tokens: 100,
            total_tokens: 1100,
            prompt_tokens_details: {
              cached_tokens: 800,
            },
          },
        };

        const usage = extractTokenUsage(response);

        expect(usage).toEqual({
          promptTokens: 1000,
          completionTokens: 100,
          totalTokens: 1100,
          cachedTokens: 800,
          reasoningTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 800,
        });
      });

      it("should extract reasoning_tokens from completion_tokens_details", () => {
        const response = {
          usage: {
            prompt_tokens: 500,
            completion_tokens: 200,
            total_tokens: 700,
            completion_tokens_details: {
              reasoning_tokens: 150,
            },
          },
        };

        const usage = extractTokenUsage(response);

        expect(usage).toEqual({
          promptTokens: 500,
          completionTokens: 200,
          totalTokens: 700,
          cachedTokens: 0,
          reasoningTokens: 150,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
        });
      });

      it("should extract both cached_tokens and reasoning_tokens", () => {
        const response = {
          usage: {
            prompt_tokens: 2000,
            completion_tokens: 500,
            total_tokens: 2500,
            prompt_tokens_details: {
              cached_tokens: 1500,
              audio_tokens: 0,
            },
            completion_tokens_details: {
              reasoning_tokens: 300,
              audio_tokens: 0,
            },
          },
        };

        const usage = extractTokenUsage(response);

        expect(usage).toEqual({
          promptTokens: 2000,
          completionTokens: 500,
          totalTokens: 2500,
          cachedTokens: 1500,
          reasoningTokens: 300,
          cacheCreationTokens: 0,
          cacheReadTokens: 1500,
        });
      });

      it("should handle missing details objects", () => {
        const response = {
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
            // No prompt_tokens_details or completion_tokens_details
          },
        };

        const usage = extractTokenUsage(response);

        expect(usage).toEqual({
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cachedTokens: 0,
          reasoningTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
        });
      });
    });

    describe("Anthropic cache token format", () => {
      it("should extract cache_creation_input_tokens", () => {
        const response = {
          usage: {
            input_tokens: 500,
            output_tokens: 100,
            cache_creation_input_tokens: 400,
          },
        };

        const usage = extractTokenUsage(response);

        expect(usage).toEqual({
          promptTokens: 500,
          completionTokens: 100,
          totalTokens: 600,
          cachedTokens: 0,
          reasoningTokens: 0,
          cacheCreationTokens: 400,
          cacheReadTokens: 0,
        });
      });

      it("should extract cache_read_input_tokens", () => {
        const response = {
          usage: {
            input_tokens: 1000,
            output_tokens: 200,
            cache_read_input_tokens: 800,
          },
        };

        const usage = extractTokenUsage(response);

        expect(usage).toEqual({
          promptTokens: 1000,
          completionTokens: 200,
          totalTokens: 1200,
          cachedTokens: 800,
          reasoningTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 800,
        });
      });

      it("should extract both cache_creation and cache_read tokens", () => {
        const response = {
          usage: {
            input_tokens: 2000,
            output_tokens: 300,
            cache_creation_input_tokens: 500,
            cache_read_input_tokens: 1200,
          },
        };

        const usage = extractTokenUsage(response);

        expect(usage).toEqual({
          promptTokens: 2000,
          completionTokens: 300,
          totalTokens: 2300,
          cachedTokens: 1200,
          reasoningTokens: 0,
          cacheCreationTokens: 500,
          cacheReadTokens: 1200,
        });
      });
    });

    describe("edge cases", () => {
      it("should return zeros for null response", () => {
        const usage = extractTokenUsage(null);

        expect(usage).toEqual({
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cachedTokens: 0,
          reasoningTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
        });
      });

      it("should return zeros for response without usage", () => {
        const response = {
          id: "123",
          content: "Hello",
        };

        const usage = extractTokenUsage(response);

        expect(usage).toEqual({
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cachedTokens: 0,
          reasoningTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
        });
      });

      it("should return zeros for null usage field", () => {
        const response = {
          usage: null,
        };

        const usage = extractTokenUsage(response);

        expect(usage).toEqual({
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cachedTokens: 0,
          reasoningTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
        });
      });

      it("should handle invalid string values", () => {
        const response = {
          usage: {
            prompt_tokens: "invalid",
            completion_tokens: "not_a_number",
          },
        };

        const usage = extractTokenUsage(response);

        expect(usage).toEqual({
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cachedTokens: 0,
          reasoningTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
        });
      });

      it("should handle float values by flooring", () => {
        const response = {
          usage: {
            prompt_tokens: 100.7,
            completion_tokens: 50.3,
            total_tokens: 151.0,
          },
        };

        const usage = extractTokenUsage(response);

        expect(usage).toEqual({
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 151,
          cachedTokens: 0,
          reasoningTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
        });
      });

      it("should handle empty usage object", () => {
        const response = {
          usage: {},
        };

        const usage = extractTokenUsage(response);

        expect(usage).toEqual({
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cachedTokens: 0,
          reasoningTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
        });
      });
    });
  });

  describe("extractModelName", () => {
    it("should extract model from request body", () => {
      const requestBody = {
        model: "gpt-4",
        messages: [],
      };

      const model = extractModelName(requestBody, null);

      expect(model).toBe("gpt-4");
    });

    it("should extract model from response body when not in request", () => {
      const responseBody = {
        model: "gpt-3.5-turbo",
        choices: [],
      };

      const model = extractModelName(null, responseBody);

      expect(model).toBe("gpt-3.5-turbo");
    });

    it("should prefer request body model over response body", () => {
      const requestBody = {
        model: "gpt-4",
      };
      const responseBody = {
        model: "gpt-4-0613",
      };

      const model = extractModelName(requestBody, responseBody);

      expect(model).toBe("gpt-4");
    });

    it("should return null when no model in either body", () => {
      const requestBody = {
        messages: [],
      };
      const responseBody = {
        choices: [],
      };

      const model = extractModelName(requestBody, responseBody);

      expect(model).toBeNull();
    });

    it("should return null for both null inputs", () => {
      const model = extractModelName(null, null);

      expect(model).toBeNull();
    });

    it("should handle non-string model values", () => {
      const requestBody = {
        model: 123,
      };

      const model = extractModelName(requestBody, null);

      expect(model).toBeNull();
    });

    it("should handle Anthropic model format", () => {
      const requestBody = {
        model: "claude-3-opus-20240229",
      };

      const model = extractModelName(requestBody, null);

      expect(model).toBe("claude-3-opus-20240229");
    });

    it("should handle empty string model", () => {
      const requestBody = {
        model: "",
      };
      const responseBody = {
        model: "gpt-4",
      };

      // Empty string is falsy, so it should fall through to response
      const model = extractModelName(requestBody, responseBody);

      expect(model).toBe("gpt-4");
    });
  });

  describe("logRequest", () => {
    it("should insert request log into database", async () => {
      const { db } = await import("@/lib/db");
      const { logRequest } = await import("@/lib/services/request-logger");

      const mockLogEntry = {
        id: "log-1",
        apiKeyId: "key-1",
        upstreamId: "upstream-1",
        method: "POST",
        path: "/v1/chat/completions",
        model: "gpt-4",
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        statusCode: 200,
        durationMs: 500,
        errorMessage: null,
        createdAt: new Date(),
      };

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockLogEntry]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const result = await logRequest({
        apiKeyId: "key-1",
        upstreamId: "upstream-1",
        method: "POST",
        path: "/v1/chat/completions",
        model: "gpt-4",
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        statusCode: 200,
        durationMs: 500,
      });

      expect(db.insert).toHaveBeenCalled();
      expect(result.id).toBe("log-1");
      expect(result.statusCode).toBe(200);
    });

    it("should handle null values for optional fields", async () => {
      const { db } = await import("@/lib/db");
      const { logRequest } = await import("@/lib/services/request-logger");

      const mockLogEntry = {
        id: "log-2",
        apiKeyId: null,
        upstreamId: null,
        method: null,
        path: null,
        model: null,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        statusCode: null,
        durationMs: null,
        errorMessage: null,
        createdAt: new Date(),
      };

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockLogEntry]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const result = await logRequest({
        apiKeyId: null,
        upstreamId: null,
        method: null,
        path: null,
        model: null,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        statusCode: null,
        durationMs: null,
      });

      expect(result.apiKeyId).toBeNull();
      expect(result.upstreamId).toBeNull();
    });

    it("should handle error messages", async () => {
      const { db } = await import("@/lib/db");
      const { logRequest } = await import("@/lib/services/request-logger");

      const mockLogEntry = {
        id: "log-3",
        apiKeyId: "key-1",
        upstreamId: "upstream-1",
        method: "POST",
        path: "/v1/chat/completions",
        model: "gpt-4",
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        statusCode: 500,
        durationMs: 100,
        errorMessage: "Internal server error",
        createdAt: new Date(),
      };

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockLogEntry]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const result = await logRequest({
        apiKeyId: "key-1",
        upstreamId: "upstream-1",
        method: "POST",
        path: "/v1/chat/completions",
        model: "gpt-4",
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        statusCode: 500,
        durationMs: 100,
        errorMessage: "Internal server error",
      });

      expect(result.errorMessage).toBe("Internal server error");
      expect(result.statusCode).toBe(500);
    });

    it("should handle routing decision fields", async () => {
      const { db } = await import("@/lib/db");
      const { logRequest } = await import("@/lib/services/request-logger");

      const mockLogEntry = {
        id: "log-4",
        apiKeyId: "key-1",
        upstreamId: "upstream-1",
        method: "POST",
        path: "/v1/chat/completions",
        model: "gpt-4",
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cachedTokens: 0,
        reasoningTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        statusCode: 200,
        durationMs: 500,
        errorMessage: null,
        routingType: "group",
        groupName: "openai-group",
        lbStrategy: "round_robin",
        failoverAttempts: 1,
        failoverHistory: JSON.stringify([
          {
            upstream_id: "upstream-2",
            upstream_name: "openai-backup",
            attempted_at: "2024-01-01T00:00:00.000Z",
            error_type: "http_5xx",
            error_message: "Service unavailable",
            status_code: 503,
          },
        ]),
        createdAt: new Date(),
      };

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockLogEntry]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const result = await logRequest({
        apiKeyId: "key-1",
        upstreamId: "upstream-1",
        method: "POST",
        path: "/v1/chat/completions",
        model: "gpt-4",
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        statusCode: 200,
        durationMs: 500,
        routingType: "group",
        groupName: "openai-group",
        lbStrategy: "round_robin",
        failoverAttempts: 1,
        failoverHistory: [
          {
            upstream_id: "upstream-2",
            upstream_name: "openai-backup",
            attempted_at: "2024-01-01T00:00:00.000Z",
            error_type: "http_5xx",
            error_message: "Service unavailable",
            status_code: 503,
          },
        ],
      });

      expect(result.routingType).toBe("group");
      expect(result.groupName).toBe("openai-group");
      expect(result.lbStrategy).toBe("round_robin");
      expect(result.failoverAttempts).toBe(1);
    });

    it("should handle direct routing type", async () => {
      const { db } = await import("@/lib/db");
      const { logRequest } = await import("@/lib/services/request-logger");

      const mockLogEntry = {
        id: "log-5",
        apiKeyId: "key-1",
        upstreamId: "upstream-1",
        method: "POST",
        path: "/v1/chat/completions",
        model: "gpt-4",
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cachedTokens: 0,
        reasoningTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        statusCode: 200,
        durationMs: 500,
        errorMessage: null,
        routingType: "direct",
        groupName: null,
        lbStrategy: null,
        failoverAttempts: 0,
        failoverHistory: null,
        createdAt: new Date(),
      };

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockLogEntry]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const result = await logRequest({
        apiKeyId: "key-1",
        upstreamId: "upstream-1",
        method: "POST",
        path: "/v1/chat/completions",
        model: "gpt-4",
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        statusCode: 200,
        durationMs: 500,
        routingType: "direct",
      });

      expect(result.routingType).toBe("direct");
      expect(result.groupName).toBeNull();
      expect(result.lbStrategy).toBeNull();
      expect(result.failoverAttempts).toBe(0);
    });
  });

  describe("listRequestLogs", () => {
    it("should return paginated logs", async () => {
      const { db } = await import("@/lib/db");
      const { listRequestLogs } = await import("@/lib/services/request-logger");

      const mockLogs = [
        {
          id: "log-1",
          apiKeyId: "key-1",
          upstreamId: "upstream-1",
          method: "POST",
          path: "/v1/chat/completions",
          model: "gpt-4",
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cachedTokens: 0,
          reasoningTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          statusCode: 200,
          durationMs: 500,
          errorMessage: null,
          routingType: "direct",
          groupName: null,
          lbStrategy: null,
          failoverAttempts: 0,
          failoverHistory: null,
          createdAt: new Date(),
        },
      ];

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 1 }]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.query.requestLogs.findMany).mockResolvedValueOnce(mockLogs);

      const result = await listRequestLogs(1, 20);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it("should return logs with routing decision fields", async () => {
      const { db } = await import("@/lib/db");
      const { listRequestLogs } = await import("@/lib/services/request-logger");

      const mockLogs = [
        {
          id: "log-1",
          apiKeyId: "key-1",
          upstreamId: "upstream-1",
          method: "POST",
          path: "/v1/chat/completions",
          model: "gpt-4",
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cachedTokens: 0,
          reasoningTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          statusCode: 200,
          durationMs: 500,
          errorMessage: null,
          routingType: "group",
          groupName: "openai-group",
          lbStrategy: "round_robin",
          failoverAttempts: 1,
          failoverHistory: JSON.stringify([
            {
              upstream_id: "upstream-2",
              upstream_name: "openai-backup",
              attempted_at: "2024-01-01T00:00:00.000Z",
              error_type: "http_5xx",
              error_message: "Service unavailable",
              status_code: 503,
            },
          ]),
          createdAt: new Date(),
        },
      ];

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 1 }]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.query.requestLogs.findMany).mockResolvedValueOnce(mockLogs);

      const result = await listRequestLogs(1, 20);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].routingType).toBe("group");
      expect(result.items[0].groupName).toBe("openai-group");
      expect(result.items[0].lbStrategy).toBe("round_robin");
      expect(result.items[0].failoverAttempts).toBe(1);
      expect(result.items[0].failoverHistory).toHaveLength(1);
      expect(result.items[0].failoverHistory![0].error_type).toBe("http_5xx");
    });

    it("should clamp page to minimum of 1", async () => {
      const { db } = await import("@/lib/db");
      const { listRequestLogs } = await import("@/lib/services/request-logger");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 0 }]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.query.requestLogs.findMany).mockResolvedValueOnce([]);

      const result = await listRequestLogs(-1, 20);

      expect(result.page).toBe(1);
    });

    it("should clamp pageSize to maximum of 100", async () => {
      const { db } = await import("@/lib/db");
      const { listRequestLogs } = await import("@/lib/services/request-logger");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 0 }]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.query.requestLogs.findMany).mockResolvedValueOnce([]);

      const result = await listRequestLogs(1, 200);
      expect(result.pageSize).toBe(100);
    });

    it("should clamp pageSize to minimum of 1", async () => {
      const { db } = await import("@/lib/db");
      const { listRequestLogs } = await import("@/lib/services/request-logger");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 0 }]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.query.requestLogs.findMany).mockResolvedValueOnce([]);

      const result = await listRequestLogs(1, 0);
      expect(result.pageSize).toBe(1);
    });

    it("should return empty result when no logs", async () => {
      const { db } = await import("@/lib/db");
      const { listRequestLogs } = await import("@/lib/services/request-logger");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 0 }]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.query.requestLogs.findMany).mockResolvedValueOnce([]);

      const result = await listRequestLogs(1, 20);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(1); // Minimum 1 page even with 0 items
    });

    it("should calculate totalPages correctly", async () => {
      const { db } = await import("@/lib/db");
      const { listRequestLogs } = await import("@/lib/services/request-logger");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 45 }]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.query.requestLogs.findMany).mockResolvedValueOnce([]);

      const result = await listRequestLogs(1, 20);

      expect(result.total).toBe(45);
      expect(result.totalPages).toBe(3); // ceil(45/20) = 3
    });
  });
});
