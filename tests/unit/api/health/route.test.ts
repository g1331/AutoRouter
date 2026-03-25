import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";
import { APP_VERSION } from "@/lib/app-version";

describe("GET /api/health", () => {
  it("returns the current application version", async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.status).toBe("healthy");
    expect(data.version).toBe(APP_VERSION);
    expect(typeof data.timestamp).toBe("string");
  });
});
