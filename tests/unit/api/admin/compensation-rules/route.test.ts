import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/utils/auth", () => ({
  validateAdminAuth: vi.fn((authHeader) => authHeader === "Bearer valid-token"),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ column: a, value: b })),
}));

vi.mock("@/lib/services/compensation-service", () => ({
  ensureBuiltinCompensationRulesExist: vi.fn(async () => undefined),
  invalidateCache: vi.fn(),
}));

const { mockSelect, mockInsert, mockUpdate, mockDelete } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  },
  compensationRules: {
    id: "id",
    name: "name",
    isBuiltin: "is_builtin",
    enabled: "enabled",
    capabilities: "capabilities",
    targetHeader: "target_header",
    sources: "sources",
    mode: "mode",
  },
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const BUILTIN_RULE = {
  id: "rule-builtin",
  name: "Session ID Recovery",
  isBuiltin: true,
  enabled: true,
  capabilities: ["codex_responses"],
  targetHeader: "session_id",
  sources: ["headers.session_id"],
  mode: "missing_only",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const CUSTOM_RULE = {
  id: "rule-custom",
  name: "Custom Rule",
  isBuiltin: false,
  enabled: true,
  capabilities: ["openai_chat_compatible"],
  targetHeader: "x-custom",
  sources: ["headers.x-custom"],
  mode: "missing_only",
  createdAt: new Date("2024-01-02"),
  updatedAt: new Date("2024-01-02"),
};

const AUTH_HEADER = "Bearer valid-token";

function makeChain(resolveWith: unknown) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(resolveWith),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([resolveWith]),
    set: vi.fn().mockReturnThis(),
  };
  return chain;
}

describe("GET /api/admin/compensation-rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 without valid auth", async () => {
    const { GET } = await import("@/app/api/admin/compensation-rules/route");
    const req = new NextRequest("http://localhost/api/admin/compensation-rules");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("should list all compensation rules", async () => {
    const { GET } = await import("@/app/api/admin/compensation-rules/route");
    const chain = makeChain([BUILTIN_RULE, CUSTOM_RULE]);
    mockSelect.mockReturnValue(chain);
    chain.where.mockResolvedValue([BUILTIN_RULE, CUSTOM_RULE]);
    // GET uses select().from() without where
    const fromChain = { from: vi.fn().mockResolvedValue([BUILTIN_RULE, CUSTOM_RULE]) };
    mockSelect.mockReturnValue(fromChain);

    const req = new NextRequest("http://localhost/api/admin/compensation-rules", {
      headers: { authorization: AUTH_HEADER },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(2);
    const first = body.data[0] as { is_builtin: boolean; name: string };
    expect(first.is_builtin).toBe(true);
    expect(first.name).toBe("Session ID Recovery");
  });
});

describe("POST /api/admin/compensation-rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 without valid auth", async () => {
    const { POST } = await import("@/app/api/admin/compensation-rules/route");
    const req = new NextRequest("http://localhost/api/admin/compensation-rules", {
      method: "POST",
      body: JSON.stringify({
        name: "test",
        capabilities: ["codex_responses"],
        target_header: "x",
        sources: ["headers.x"],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("should return 400 for missing required fields", async () => {
    const { POST } = await import("@/app/api/admin/compensation-rules/route");

    const req = new NextRequest("http://localhost/api/admin/compensation-rules", {
      method: "POST",
      headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ name: "test" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("should create a new custom rule", async () => {
    const { POST } = await import("@/app/api/admin/compensation-rules/route");

    // name collision check returns empty
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };
    mockSelect.mockReturnValue(selectChain);

    const newRule = { ...CUSTOM_RULE, id: "new-rule", name: "New Rule" };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([newRule]),
    };
    mockInsert.mockReturnValue(insertChain);

    const req = new NextRequest("http://localhost/api/admin/compensation-rules", {
      method: "POST",
      headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({
        name: "New Rule",
        capabilities: ["openai_chat_compatible"],
        target_header: "x-custom",
        sources: ["headers.x-custom"],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);

    const body = (await res.json()) as { data: { name: string; is_builtin: boolean } };
    expect(body.data.name).toBe("New Rule");
    expect(body.data.is_builtin).toBe(false);
  });

  it("should return 409 when name already exists", async () => {
    const { POST } = await import("@/app/api/admin/compensation-rules/route");

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ id: "existing" }]),
    };
    mockSelect.mockReturnValue(selectChain);

    const req = new NextRequest("http://localhost/api/admin/compensation-rules", {
      method: "POST",
      headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Session ID Recovery",
        capabilities: ["codex_responses"],
        target_header: "session_id",
        sources: ["headers.session_id"],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/admin/compensation-rules/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 403 when trying to delete a built-in rule", async () => {
    const { DELETE } = await import("@/app/api/admin/compensation-rules/[id]/route");

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ id: "rule-builtin", isBuiltin: true }]),
    };
    mockSelect.mockReturnValue(selectChain);

    const req = new NextRequest("http://localhost/api/admin/compensation-rules/rule-builtin", {
      method: "DELETE",
      headers: { authorization: AUTH_HEADER },
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "rule-builtin" }) });
    expect(res.status).toBe(403);
  });

  it("should delete a custom rule successfully", async () => {
    const { DELETE } = await import("@/app/api/admin/compensation-rules/[id]/route");

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ id: "rule-custom", isBuiltin: false }]),
    };
    mockSelect.mockReturnValue(selectChain);

    const deleteChain = { where: vi.fn().mockResolvedValue(undefined) };
    mockDelete.mockReturnValue(deleteChain);

    const req = new NextRequest("http://localhost/api/admin/compensation-rules/rule-custom", {
      method: "DELETE",
      headers: { authorization: AUTH_HEADER },
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "rule-custom" }) });
    expect(res.status).toBe(204);
  });

  it("should return 404 for non-existent rule", async () => {
    const { DELETE } = await import("@/app/api/admin/compensation-rules/[id]/route");

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };
    mockSelect.mockReturnValue(selectChain);

    const req = new NextRequest("http://localhost/api/admin/compensation-rules/nonexistent", {
      method: "DELETE",
      headers: { authorization: AUTH_HEADER },
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "nonexistent" }) });
    expect(res.status).toBe(404);
  });

  it("should return 401 without valid auth", async () => {
    const { DELETE } = await import("@/app/api/admin/compensation-rules/[id]/route");

    const req = new NextRequest("http://localhost/api/admin/compensation-rules/rule-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "rule-1" }) });
    expect(res.status).toBe(401);
  });
});

describe("PUT /api/admin/compensation-rules/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should allow toggling enabled for a built-in rule", async () => {
    const { PUT } = await import("@/app/api/admin/compensation-rules/[id]/route");

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([BUILTIN_RULE]),
    };
    mockSelect.mockReturnValue(selectChain);

    const updatedRule = { ...BUILTIN_RULE, enabled: false, updatedAt: new Date("2024-01-03") };
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([updatedRule]),
    };
    mockUpdate.mockReturnValue(updateChain);

    const req = new NextRequest("http://localhost/api/admin/compensation-rules/rule-builtin", {
      method: "PUT",
      headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });

    const res = await PUT(req, { params: Promise.resolve({ id: "rule-builtin" }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { enabled: boolean; is_builtin: boolean } };
    expect(body.data.is_builtin).toBe(true);
    expect(body.data.enabled).toBe(false);
  });

  it("should return 403 when trying to modify fields other than enabled for a built-in rule", async () => {
    const { PUT } = await import("@/app/api/admin/compensation-rules/[id]/route");

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([BUILTIN_RULE]),
    };
    mockSelect.mockReturnValue(selectChain);

    const req = new NextRequest("http://localhost/api/admin/compensation-rules/rule-builtin", {
      method: "PUT",
      headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ capabilities: ["openai_chat_compatible"] }),
    });

    const res = await PUT(req, { params: Promise.resolve({ id: "rule-builtin" }) });
    expect(res.status).toBe(403);
  });
});

describe("PUT /api/admin/compensation-rules/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should update an existing rule", async () => {
    const { PUT } = await import("@/app/api/admin/compensation-rules/[id]/route");

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([CUSTOM_RULE]),
    };
    mockSelect.mockReturnValue(selectChain);

    const updatedRule = { ...CUSTOM_RULE, enabled: false };
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([updatedRule]),
    };
    mockUpdate.mockReturnValue(updateChain);

    const req = new NextRequest("http://localhost/api/admin/compensation-rules/rule-custom", {
      method: "PUT",
      headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: "rule-custom" }) });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: { enabled: boolean } };
    expect(body.data.enabled).toBe(false);
  });

  it("should return 403 when trying to rename a built-in rule", async () => {
    const { PUT } = await import("@/app/api/admin/compensation-rules/[id]/route");

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([BUILTIN_RULE]),
    };
    mockSelect.mockReturnValue(selectChain);

    const req = new NextRequest("http://localhost/api/admin/compensation-rules/rule-builtin", {
      method: "PUT",
      headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: "rule-builtin" }) });
    expect(res.status).toBe(403);
  });
});
