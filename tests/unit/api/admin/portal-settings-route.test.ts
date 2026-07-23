import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getSettingsMock, updateSettingsMock } = vi.hoisted(() => ({
  getSettingsMock: vi.fn(),
  updateSettingsMock: vi.fn(),
}));

// Only the gate decision is mocked; errorResponse stays real so the failure
// response shape is the one the route actually returns.
vi.mock("@/lib/utils/api-auth", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/utils/api-auth")>();
  return {
    ...actual,
    requireAdmin: vi.fn(async (request: Request) => {
      if (request.headers.get("authorization") === "Bearer valid-token") {
        return { kind: "admin_token" };
      }
      return actual.errorResponse("Unauthorized", 401);
    }),
  };
});

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

vi.mock("@/lib/services/portal-settings-service", () => ({
  getPortalSettings: (...args: unknown[]) => getSettingsMock(...args),
  updatePortalSettings: (...args: unknown[]) => updateSettingsMock(...args),
}));

const AUTH_HEADER = "Bearer valid-token";
const URL = "http://localhost/api/admin/portal-settings";

const settings = {
  exposeUpstreams: false,
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("portal settings admin route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects reads without admin auth", async () => {
    const { GET } = await import("@/app/api/admin/portal-settings/route");

    const response = await GET(new NextRequest(URL));

    expect(response.status).toBe(401);
    expect(getSettingsMock).not.toHaveBeenCalled();
  });

  it("rejects updates without admin auth", async () => {
    const { PATCH } = await import("@/app/api/admin/portal-settings/route");

    const response = await PATCH(
      new NextRequest(URL, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expose_upstreams: true }),
      })
    );

    expect(response.status).toBe(401);
    expect(updateSettingsMock).not.toHaveBeenCalled();
  });

  it("returns settings as API fields", async () => {
    const { GET } = await import("@/app/api/admin/portal-settings/route");
    getSettingsMock.mockResolvedValueOnce(settings);

    const response = await GET(new NextRequest(URL, { headers: { authorization: AUTH_HEADER } }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      expose_upstreams: false,
      updated_at: "2026-01-01T00:00:00.000Z",
    });
  });

  it("updates settings from API fields", async () => {
    const { PATCH } = await import("@/app/api/admin/portal-settings/route");
    updateSettingsMock.mockResolvedValueOnce({ ...settings, exposeUpstreams: true });

    const response = await PATCH(
      new NextRequest(URL, {
        method: "PATCH",
        headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
        body: JSON.stringify({ expose_upstreams: true }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(updateSettingsMock).toHaveBeenCalledWith({ exposeUpstreams: true });
    expect(body.expose_upstreams).toBe(true);
  });

  it("rejects a non-boolean exposure flag", async () => {
    const { PATCH } = await import("@/app/api/admin/portal-settings/route");

    const response = await PATCH(
      new NextRequest(URL, {
        method: "PATCH",
        headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
        body: JSON.stringify({ expose_upstreams: "yes" }),
      })
    );

    expect(response.status).toBe(400);
    expect(updateSettingsMock).not.toHaveBeenCalled();
  });
});
