import { describe, expect, it } from "vitest";
import { parsePluginManifest } from "@/src/services/plugins/pluginManifest";

describe("pluginManifest", () => {
  it("parses a valid plugin manifest", () => {
    expect(
      parsePluginManifest({
        name: "Residue Risk Inspector",
        version: "1.0.0",
        entry: "https://plugins.example.test/residue.js",
        integrity: "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        permissions: ["read:inspection", "emit:events"],
      })
    ).toMatchObject({ name: "Residue Risk Inspector" });
  });

  it("rejects invalid integrity metadata", () => {
    expect(() =>
      parsePluginManifest({
        name: "Bad Plugin",
        version: "1.0.0",
        entry: "https://plugins.example.test/bad.js",
        integrity: "md5-not-allowed",
        permissions: [],
      })
    ).toThrow(/invalid format/);
  });
});
