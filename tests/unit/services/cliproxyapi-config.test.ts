import { beforeEach, describe, expect, it, vi } from "vitest";

type MockInsertChain = {
  values: ReturnType<typeof vi.fn>;
};

type MockUpdateChain = {
  set: ReturnType<typeof vi.fn>;
};

const connectionRecord = {
  id: "conn-1",
  name: "local-cpa",
  mode: "external",
  baseUrl: "http://localhost:8317/v1",
  clientApiKeyEncrypted: "encrypted:sk-cpa-client",
  managementUrl: "http://localhost:8317/v0/management",
  managementSecretEncrypted: "encrypted:mgmt-secret",
  outboundProxyUrl: "http://proxy.local:7890",
  isEnabled: true,
  isDefault: true,
  lastTestedAt: null,
  lastStatus: "success",
  lastError: null,
  createdAt: new Date("2026-05-01T00:00:00.000Z"),
  updatedAt: new Date("2026-05-01T00:00:00.000Z"),
};

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      cliproxyapiConnections: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([connectionRecord])) })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
    })),
    delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
  },
  cliproxyapiConnections: {
    id: "id",
    name: "name",
    isDefault: "isDefault",
    isEnabled: "isEnabled",
    createdAt: "createdAt",
  },
}));

vi.mock("@/lib/utils/encryption", () => ({
  encrypt: vi.fn((value: string) => `encrypted:${value}`),
  decrypt: vi.fn((value: string) => value.replace("encrypted:", "")),
}));

describe("cliproxyapi-config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("masks configured secrets without revealing plaintext", async () => {
    const { maskCliproxyApiSecret } = await import("@/lib/services/cliproxyapi-config");

    expect(maskCliproxyApiSecret("sk-cpa-client")).toBe("sk***ient");
    expect(maskCliproxyApiSecret("short")).toBe("***");
    expect(maskCliproxyApiSecret(null)).toBeNull();
  });

  it("creates connection records with encrypted secrets", async () => {
    const { createCliproxyApiConnection } = await import("@/lib/services/cliproxyapi-config");
    const { db } = await import("@/lib/db");
    const { encrypt } = await import("@/lib/utils/encryption");

    const values = vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([connectionRecord])) }));
    vi.mocked(db.insert).mockReturnValue({ values } as unknown as MockInsertChain);

    const result = await createCliproxyApiConnection({
      name: "local-cpa",
      mode: "external",
      baseUrl: "http://localhost:8317/v1/",
      clientApiKey: "sk-cpa-client",
      managementUrl: "http://localhost:8317/v0/management/",
      managementSecret: "mgmt-secret",
      outboundProxyUrl: "http://proxy.local:7890",
      isDefault: true,
    });

    expect(encrypt).toHaveBeenCalledWith("sk-cpa-client");
    expect(encrypt).toHaveBeenCalledWith("mgmt-secret");
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "http://localhost:8317/v1",
        managementUrl: "http://localhost:8317/v0/management",
        clientApiKeyEncrypted: "encrypted:sk-cpa-client",
        managementSecretEncrypted: "encrypted:mgmt-secret",
      })
    );
    expect(result.clientApiKeyMasked).toBe("sk***ient");
    expect(result.managementSecretMasked).toBe("mg***cret");
  });

  it("returns decrypted secrets only through the secrets helper", async () => {
    const { getCliproxyApiConnectionWithSecrets } =
      await import("@/lib/services/cliproxyapi-config");
    const { db } = await import("@/lib/db");

    vi.mocked(db.query.cliproxyapiConnections.findFirst).mockResolvedValue(connectionRecord);

    const result = await getCliproxyApiConnectionWithSecrets("conn-1");

    expect(result.clientApiKey).toBe("sk-cpa-client");
    expect(result.managementSecret).toBe("mgmt-secret");
    expect(result.clientApiKeyMasked).toBe("sk***ient");
  });

  it("updates a connection without encrypting omitted secrets", async () => {
    const { updateCliproxyApiConnection } = await import("@/lib/services/cliproxyapi-config");
    const { db } = await import("@/lib/db");
    const { encrypt } = await import("@/lib/utils/encryption");

    vi.mocked(db.query.cliproxyapiConnections.findFirst).mockResolvedValue(connectionRecord);
    const set = vi.fn(() => ({
      where: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([connectionRecord])) })),
    }));
    vi.mocked(db.update).mockReturnValue({ set } as unknown as MockUpdateChain);

    await updateCliproxyApiConnection("conn-1", { name: "renamed" });

    expect(encrypt).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ name: "renamed" }));
  });
});
