import { afterEach, describe, expect, it, vi } from "vitest";
import type { Upstream } from "@/lib/db";
import { resolveDownstreamModelList } from "@/lib/services/downstream-model-catalog";

function createUpstream(overrides: Partial<Upstream> = {}): Upstream {
  return {
    id: "upstream-1",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    officialWebsiteUrl: null,
    apiKeyEncrypted: "encrypted-key",
    isDefault: false,
    timeout: 60,
    isActive: true,
    currentConcurrency: 0,
    maxConcurrency: null,
    queuePolicy: null,
    config: null,
    weight: 1,
    priority: 0,
    routeCapabilities: ["openai_chat_compatible"],
    allowedModels: null,
    modelRedirects: null,
    modelDiscovery: null,
    modelCatalog: null,
    modelCatalogUpdatedAt: null,
    modelCatalogLastStatus: null,
    modelCatalogLastError: null,
    modelCatalogLastFailedAt: null,
    modelRules: null,
    affinityMigration: null,
    billingInputMultiplier: 1,
    billingOutputMultiplier: 1,
    spendingRules: null,
    createdAt: new Date("2026-04-25T00:00:00.000Z"),
    updatedAt: new Date("2026-04-25T00:00:00.000Z"),
    ...overrides,
  } as Upstream;
}

describe("resolveDownstreamModelList", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("aggregates authorized active catalogs in stable sorted order", () => {
    const upstreams = [
      createUpstream({
        id: "up-openai",
        modelCatalog: [
          { model: "gpt-5.2", source: "native" },
          { model: "gpt-4.1", source: "native" },
        ],
      }),
      createUpstream({
        id: "up-anthropic",
        modelCatalog: [
          { model: "claude-3.7", source: "native" },
          { model: "gpt-4.1", source: "native" },
        ],
      }),
    ];

    expect(
      resolveDownstreamModelList({
        upstreams,
        allowedUpstreamIds: new Set(["up-openai", "up-anthropic"]),
        apiKeyAllowedModels: null,
      })
    ).toEqual({
      models: ["claude-3.7", "gpt-4.1", "gpt-5.2"],
      authorizedUpstreamCount: 2,
      knownUpstreamCount: 2,
      complete: true,
    });
  });

  it("excludes inactive and unauthorized upstreams", () => {
    const upstreams = [
      createUpstream({
        id: "authorized",
        modelCatalog: [{ model: "visible", source: "native" }],
      }),
      createUpstream({
        id: "inactive",
        isActive: false,
        modelCatalog: [{ model: "inactive-model", source: "native" }],
      }),
      createUpstream({
        id: "unauthorized",
        modelCatalog: [{ model: "private-model", source: "native" }],
      }),
    ];

    expect(
      resolveDownstreamModelList({
        upstreams,
        allowedUpstreamIds: new Set(["authorized", "inactive"]),
        apiKeyAllowedModels: null,
      })
    ).toMatchObject({
      models: ["visible"],
      authorizedUpstreamCount: 1,
      knownUpstreamCount: 1,
      complete: true,
    });
  });

  it("marks the local view incomplete when an authorized upstream has no source", () => {
    const resolution = resolveDownstreamModelList({
      upstreams: [
        createUpstream({
          id: "known",
          modelCatalog: [{ model: "known-model", source: "native" }],
        }),
        createUpstream({ id: "unknown" }),
      ],
      allowedUpstreamIds: new Set(["known", "unknown"]),
      apiKeyAllowedModels: null,
    });

    expect(resolution).toEqual({
      models: ["known-model"],
      authorizedUpstreamCount: 2,
      knownUpstreamCount: 1,
      complete: false,
    });
  });

  it("reuses API-key allowlist order without requiring a catalog", () => {
    const resolution = resolveDownstreamModelList({
      upstreams: [createUpstream({ id: "upstream-without-catalog" })],
      allowedUpstreamIds: new Set(["upstream-without-catalog"]),
      apiKeyAllowedModels: [" gpt-5.5 ", "gpt-4.1", "gpt-5.5", "  "],
    });

    expect(resolution).toEqual({
      models: ["gpt-5.5", "gpt-4.1"],
      authorizedUpstreamCount: 1,
      knownUpstreamCount: 1,
      complete: true,
    });
  });

  it("intersects API-key models with explicit upstream rules", () => {
    const resolution = resolveDownstreamModelList({
      upstreams: [
        createUpstream({
          modelRules: [
            {
              type: "exact",
              value: "gpt-5.5",
              targetModel: null,
              source: "manual",
              displayLabel: null,
            },
          ],
        }),
      ],
      allowedUpstreamIds: new Set(["upstream-1"]),
      apiKeyAllowedModels: ["gpt-4.1", "gpt-5.5"],
    });

    expect(resolution.models).toEqual(["gpt-5.5"]);
  });

  it("projects exact, alias, and regex rules over cached catalogs", () => {
    const resolution = resolveDownstreamModelList({
      upstreams: [
        createUpstream({
          modelCatalog: [
            { model: "public-model", source: "native" },
            { model: "internal-model", source: "native" },
            { model: "claude-3-7-sonnet", source: "native" },
            { model: "unmatched", source: "native" },
          ],
          modelRules: [
            {
              type: "alias",
              value: "public-model",
              targetModel: "internal-model",
              source: "manual",
              displayLabel: null,
            },
            {
              type: "exact",
              value: "internal-model",
              targetModel: null,
              source: "manual",
              displayLabel: null,
            },
            {
              type: "exact",
              value: "configured-model",
              targetModel: null,
              source: "manual",
              displayLabel: null,
            },
            {
              type: "regex",
              value: "^claude-3",
              targetModel: null,
              source: "manual",
              displayLabel: null,
            },
          ],
        }),
      ],
      allowedUpstreamIds: new Set(["upstream-1"]),
      apiKeyAllowedModels: null,
    });

    expect(resolution.models).toEqual(["claude-3-7-sonnet", "configured-model", "public-model"]);
  });

  it("suppresses alias targets globally across authorized upstreams", () => {
    const resolution = resolveDownstreamModelList({
      upstreams: [
        createUpstream({
          id: "alias-owner",
          modelRedirects: { "public-model": "internal-model" },
        }),
        createUpstream({
          id: "catalog-owner",
          modelCatalog: [
            { model: "internal-model", source: "native" },
            { model: "other-model", source: "native" },
          ],
        }),
      ],
      allowedUpstreamIds: new Set(["alias-owner", "catalog-owner"]),
      apiKeyAllowedModels: null,
    });

    expect(resolution.models).toEqual(["other-model", "public-model"]);
  });

  it("normalizes legacy allowed models and redirects", () => {
    const resolution = resolveDownstreamModelList({
      upstreams: [
        createUpstream({
          allowedModels: [" legacy-model "],
          modelRedirects: { " public-model ": " legacy-model " },
        }),
      ],
      allowedUpstreamIds: new Set(["upstream-1"]),
      apiKeyAllowedModels: null,
    });

    expect(resolution.models).toEqual(["public-model"]);
  });

  it("treats empty local data as unknown and ignores blank names", () => {
    const resolution = resolveDownstreamModelList({
      upstreams: [
        createUpstream({
          modelCatalog: [{ model: "  ", source: "native" }],
          modelRules: [
            {
              type: "exact",
              value: "   ",
              targetModel: null,
              source: "manual",
              displayLabel: null,
            },
          ],
        }),
      ],
      allowedUpstreamIds: new Set(["upstream-1"]),
      apiKeyAllowedModels: null,
    });

    expect(resolution).toEqual({
      models: [],
      authorizedUpstreamCount: 1,
      knownUpstreamCount: 0,
      complete: false,
    });
  });

  it("returns stale persisted data without making a network request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const resolution = resolveDownstreamModelList({
      upstreams: [
        createUpstream({
          modelCatalog: [{ model: "stale-model", source: "native" }],
          modelCatalogLastStatus: "failed",
          modelCatalogLastError: "upstream unavailable",
        }),
      ],
      allowedUpstreamIds: new Set(["upstream-1"]),
      apiKeyAllowedModels: null,
    });

    expect(resolution.models).toEqual(["stale-model"]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
