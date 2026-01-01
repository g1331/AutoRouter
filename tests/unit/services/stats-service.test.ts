import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the database module
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      upstreams: {
        findMany: vi.fn(),
      },
      apiKeys: {
        findMany: vi.fn(),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          groupBy: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([])),
            })),
          })),
        })),
      })),
    })),
  },
  requestLogs: {
    id: "id",
    apiKeyId: "apiKeyId",
    upstreamId: "upstreamId",
    model: "model",
    createdAt: "createdAt",
    statusCode: "statusCode",
    durationMs: "durationMs",
    totalTokens: "totalTokens",
  },
  apiKeys: {
    id: "id",
    name: "name",
    keyPrefix: "keyPrefix",
  },
  upstreams: {
    id: "id",
    name: "name",
    provider: "provider",
  },
}));

describe("stats-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Set a fixed date for consistent testing
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("getOverviewStats", () => {
    it("should return overview statistics for today", async () => {
      const { db } = await import("@/lib/db");
      const { getOverviewStats } = await import("@/lib/services/stats-service");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              totalRequests: 100,
              avgDuration: "500.5",
              totalTokens: "50000",
              successCount: 95,
            },
          ]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await getOverviewStats();

      expect(result.todayRequests).toBe(100);
      expect(result.avgResponseTimeMs).toBe(500.5);
      expect(result.totalTokensToday).toBe(50000);
      expect(result.successRateToday).toBe(95);
    });

    it("should return 100% success rate when no requests", async () => {
      const { db } = await import("@/lib/db");
      const { getOverviewStats } = await import("@/lib/services/stats-service");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              totalRequests: 0,
              avgDuration: null,
              totalTokens: null,
              successCount: 0,
            },
          ]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await getOverviewStats();

      expect(result.todayRequests).toBe(0);
      expect(result.avgResponseTimeMs).toBe(0);
      expect(result.totalTokensToday).toBe(0);
      expect(result.successRateToday).toBe(100);
    });

    it("should handle null values gracefully", async () => {
      const { db } = await import("@/lib/db");
      const { getOverviewStats } = await import("@/lib/services/stats-service");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              totalRequests: 50,
              avgDuration: null,
              totalTokens: null,
              successCount: 45,
            },
          ]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await getOverviewStats();

      expect(result.todayRequests).toBe(50);
      expect(result.avgResponseTimeMs).toBe(0);
      expect(result.totalTokensToday).toBe(0);
      expect(result.successRateToday).toBe(90);
    });

    it("should round success rate to one decimal place", async () => {
      const { db } = await import("@/lib/db");
      const { getOverviewStats } = await import("@/lib/services/stats-service");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              totalRequests: 3,
              avgDuration: "100",
              totalTokens: "1000",
              successCount: 2,
            },
          ]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await getOverviewStats();

      // 2/3 = 66.666...% should round to 66.7
      expect(result.successRateToday).toBe(66.7);
    });

    it("should round avgResponseTimeMs to one decimal place", async () => {
      const { db } = await import("@/lib/db");
      const { getOverviewStats } = await import("@/lib/services/stats-service");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              totalRequests: 10,
              avgDuration: "123.456789",
              totalTokens: "1000",
              successCount: 10,
            },
          ]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await getOverviewStats();

      expect(result.avgResponseTimeMs).toBe(123.5);
    });
  });

  describe("getTimeseriesStats", () => {
    it("should return timeseries data with hour granularity for today", async () => {
      const { db } = await import("@/lib/db");
      const { getTimeseriesStats } = await import("@/lib/services/stats-service");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([
                {
                  upstreamId: "upstream-1",
                  timeBucket: "2024-06-15 10:00:00",
                  requestCount: 50,
                  totalTokens: "5000",
                  avgDuration: "200.5",
                },
                {
                  upstreamId: "upstream-1",
                  timeBucket: "2024-06-15 11:00:00",
                  requestCount: 60,
                  totalTokens: "6000",
                  avgDuration: "180.3",
                },
              ]),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([
        { id: "upstream-1", name: "OpenAI" },
      ]);

      const result = await getTimeseriesStats("today");

      expect(result.range).toBe("today");
      expect(result.granularity).toBe("hour");
      expect(result.series).toHaveLength(1);
      expect(result.series[0].upstreamName).toBe("OpenAI");
      expect(result.series[0].data).toHaveLength(2);
    });

    it("should return timeseries data with day granularity for 7d", async () => {
      const { db } = await import("@/lib/db");
      const { getTimeseriesStats } = await import("@/lib/services/stats-service");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([]);

      const result = await getTimeseriesStats("7d");

      expect(result.range).toBe("7d");
      expect(result.granularity).toBe("day");
    });

    it("should return timeseries data with day granularity for 30d", async () => {
      const { db } = await import("@/lib/db");
      const { getTimeseriesStats } = await import("@/lib/services/stats-service");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([]);

      const result = await getTimeseriesStats("30d");

      expect(result.range).toBe("30d");
      expect(result.granularity).toBe("day");
    });

    it("should handle null upstreamId as Unknown", async () => {
      const { db } = await import("@/lib/db");
      const { getTimeseriesStats } = await import("@/lib/services/stats-service");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([
                {
                  upstreamId: null,
                  timeBucket: "2024-06-15 10:00:00",
                  requestCount: 10,
                  totalTokens: "1000",
                  avgDuration: "100",
                },
              ]),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([]);

      const result = await getTimeseriesStats("today");

      expect(result.series).toHaveLength(1);
      expect(result.series[0].upstreamName).toBe("Unknown");
      expect(result.series[0].upstreamId).toBeNull();
    });

    it("should group data by upstream", async () => {
      const { db } = await import("@/lib/db");
      const { getTimeseriesStats } = await import("@/lib/services/stats-service");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([
                {
                  upstreamId: "upstream-1",
                  timeBucket: "2024-06-15 10:00:00",
                  requestCount: 10,
                  totalTokens: "1000",
                  avgDuration: "100",
                },
                {
                  upstreamId: "upstream-1",
                  timeBucket: "2024-06-15 11:00:00",
                  requestCount: 20,
                  totalTokens: "2000",
                  avgDuration: "200",
                },
              ]),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([]);

      const result = await getTimeseriesStats("today");

      expect(result.series).toHaveLength(1);
      // Data points should be grouped by upstream
      expect(result.series[0].data).toHaveLength(2);
      expect(result.series[0].data[0].requestCount).toBe(10);
      expect(result.series[0].data[1].requestCount).toBe(20);
    });

    it("should handle empty result", async () => {
      const { db } = await import("@/lib/db");
      const { getTimeseriesStats } = await import("@/lib/services/stats-service");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([]);

      const result = await getTimeseriesStats("today");

      expect(result.series).toHaveLength(0);
    });

    it("should handle null totalTokens and avgDuration", async () => {
      const { db } = await import("@/lib/db");
      const { getTimeseriesStats } = await import("@/lib/services/stats-service");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([
                {
                  upstreamId: "upstream-1",
                  timeBucket: "2024-06-15 10:00:00",
                  requestCount: 10,
                  totalTokens: null,
                  avgDuration: null,
                },
              ]),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([
        { id: "upstream-1", name: "Test" },
      ]);

      const result = await getTimeseriesStats("today");

      expect(result.series[0].data[0].totalTokens).toBe(0);
      expect(result.series[0].data[0].avgDurationMs).toBe(0);
    });
  });

  describe("getLeaderboardStats", () => {
    it("should return leaderboard data structure with correct range", async () => {
      const { db } = await import("@/lib/db");
      const { getLeaderboardStats } = await import("@/lib/services/stats-service");

      // Mock all three queries to return empty data
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.query.apiKeys.findMany).mockResolvedValue([]);
      vi.mocked(db.query.upstreams.findMany).mockResolvedValue([]);

      const result = await getLeaderboardStats("7d", 5);

      expect(result.range).toBe("7d");
      expect(result.apiKeys).toBeDefined();
      expect(result.upstreams).toBeDefined();
      expect(result.models).toBeDefined();
      expect(Array.isArray(result.apiKeys)).toBe(true);
      expect(Array.isArray(result.upstreams)).toBe(true);
      expect(Array.isArray(result.models)).toBe(true);
    });

    it("should return model leaderboard data correctly", async () => {
      const { db } = await import("@/lib/db");
      const { getLeaderboardStats } = await import("@/lib/services/stats-service");

      // Mock for API keys and upstreams (empty)
      vi.mocked(db.select)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        } as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        } as unknown as ReturnType<typeof db.select>)
        // Mock for models leaderboard
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([
                    { model: "gpt-4", requestCount: 150, totalTokens: "15000" },
                    { model: "claude-3", requestCount: 100, totalTokens: "10000" },
                  ]),
                }),
              }),
            }),
          }),
        } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.query.apiKeys.findMany).mockResolvedValue([]);
      vi.mocked(db.query.upstreams.findMany).mockResolvedValue([]);

      const result = await getLeaderboardStats("7d", 5);

      expect(result.models).toHaveLength(2);
      expect(result.models[0].model).toBe("gpt-4");
      expect(result.models[0].requestCount).toBe(150);
      expect(result.models[0].totalTokens).toBe(15000);
      expect(result.models[1].model).toBe("claude-3");
    });

    it("should clamp limit between 1 and 50", async () => {
      const { db } = await import("@/lib/db");
      const { getLeaderboardStats } = await import("@/lib/services/stats-service");

      const mockLimitFn = vi.fn().mockResolvedValue([]);

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: mockLimitFn,
              }),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.query.apiKeys.findMany).mockResolvedValue([]);
      vi.mocked(db.query.upstreams.findMany).mockResolvedValue([]);

      // Test upper bound (100 should be clamped to 50)
      await getLeaderboardStats("7d", 100);
      expect(mockLimitFn).toHaveBeenCalledWith(50);
    });

    it("should handle unknown API keys and upstreams", async () => {
      const { db } = await import("@/lib/db");
      const { getLeaderboardStats } = await import("@/lib/services/stats-service");

      vi.mocked(db.select)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi
                    .fn()
                    .mockResolvedValue([
                      { apiKeyId: "unknown-key", requestCount: 10, totalTokens: "1000" },
                    ]),
                }),
              }),
            }),
          }),
        } as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi
                    .fn()
                    .mockResolvedValue([
                      { upstreamId: "unknown-upstream", requestCount: 20, totalTokens: "2000" },
                    ]),
                }),
              }),
            }),
          }),
        } as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        } as unknown as ReturnType<typeof db.select>);

      // Return empty arrays - simulating deleted keys/upstreams
      vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([]);
      vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([]);

      const result = await getLeaderboardStats("7d", 5);

      expect(result.apiKeys[0].name).toBe("Unknown");
      expect(result.apiKeys[0].keyPrefix).toBe("sk-****");
      expect(result.upstreams[0].name).toBe("Unknown");
      expect(result.upstreams[0].provider).toBe("unknown");
    });

    it("should handle null totalTokens", async () => {
      const { db } = await import("@/lib/db");
      const { getLeaderboardStats } = await import("@/lib/services/stats-service");

      vi.mocked(db.select)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi
                    .fn()
                    .mockResolvedValue([
                      { apiKeyId: "key-1", requestCount: 10, totalTokens: null },
                    ]),
                }),
              }),
            }),
          }),
        } as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        } as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
        { id: "key-1", name: "Test Key", keyPrefix: "sk-test-" },
      ]);
      vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([]);

      const result = await getLeaderboardStats("7d", 5);

      expect(result.apiKeys[0].totalTokens).toBe(0);
    });

    it("should handle null model as Unknown", async () => {
      const { db } = await import("@/lib/db");
      const { getLeaderboardStats } = await import("@/lib/services/stats-service");

      vi.mocked(db.select)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        } as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        } as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi
                    .fn()
                    .mockResolvedValue([{ model: null, requestCount: 5, totalTokens: "500" }]),
                }),
              }),
            }),
          }),
        } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([]);
      vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([]);

      const result = await getLeaderboardStats("7d", 5);

      expect(result.models[0].model).toBe("Unknown");
    });

    it("should return empty arrays when no data", async () => {
      const { db } = await import("@/lib/db");
      const { getLeaderboardStats } = await import("@/lib/services/stats-service");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([]);
      vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([]);

      const result = await getLeaderboardStats("7d", 5);

      expect(result.apiKeys).toHaveLength(0);
      expect(result.upstreams).toHaveLength(0);
      expect(result.models).toHaveLength(0);
    });
  });

  describe("TimeRange types", () => {
    it("should accept valid time ranges", async () => {
      const { getTimeseriesStats } = await import("@/lib/services/stats-service");
      const { db } = await import("@/lib/db");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.query.upstreams.findMany).mockResolvedValue([]);

      // These should all work without errors
      const todayResult = await getTimeseriesStats("today");
      expect(todayResult.range).toBe("today");

      const sevenDayResult = await getTimeseriesStats("7d");
      expect(sevenDayResult.range).toBe("7d");

      const thirtyDayResult = await getTimeseriesStats("30d");
      expect(thirtyDayResult.range).toBe("30d");
    });
  });
});
