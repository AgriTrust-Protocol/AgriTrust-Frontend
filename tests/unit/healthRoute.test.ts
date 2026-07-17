import { afterEach, describe, expect, it } from "vitest";
import { GET } from "../../app/api/health/route";

describe("GET /api/health", () => {
  const originalVersion = process.env.APP_VERSION;

  afterEach(() => {
    if (originalVersion === undefined) delete process.env.APP_VERSION;
    else process.env.APP_VERSION = originalVersion;
  });

  it("returns a non-cacheable health response with the build version", async () => {
    process.env.APP_VERSION = "test-build";

    const response = GET();

    await expect(response.json()).resolves.toEqual({
      status: "ok",
      service: "agritrust-frontend",
      version: "test-build",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
  });
});
