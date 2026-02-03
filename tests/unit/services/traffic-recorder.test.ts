import { describe, expect, it } from "vitest";
import { redactHeaders } from "@/lib/services/traffic-recorder";

describe("traffic recorder", () => {
  it("redacts sensitive headers from Headers objects", () => {
    const headers = new Headers({
      Authorization: "Bearer secret",
      "x-api-key": "secret-key",
      Cookie: "session=token",
      "content-type": "application/json",
    });

    expect(redactHeaders(headers)).toEqual({
      authorization: "[REDACTED]",
      "x-api-key": "[REDACTED]",
      cookie: "[REDACTED]",
      "content-type": "application/json",
    });
  });

  it("redacts sensitive headers from plain objects", () => {
    expect(
      redactHeaders({
        authorization: "Bearer secret",
        "set-cookie": "token",
        accept: "application/json",
      })
    ).toEqual({
      authorization: "[REDACTED]",
      "set-cookie": "[REDACTED]",
      accept: "application/json",
    });
  });
});
