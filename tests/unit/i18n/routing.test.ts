import { describe, expect, it } from "vitest";

import { localeCookieMaxAge, localeCookieName } from "@/i18n/config";
import { routing } from "@/i18n/routing";

describe("i18n routing", () => {
  it("persists the selected locale with a stable cookie name", () => {
    expect(routing.localeCookie).toMatchObject({
      name: localeCookieName,
      sameSite: "lax",
    });
  });

  it("keeps the selected locale across browser sessions", () => {
    expect(routing.localeCookie).toMatchObject({
      maxAge: localeCookieMaxAge,
    });
  });
});
