import { describe, expect, it, vi } from "vitest";
import { parseTraceparent, StructuredLogger, type OTelLogRecord } from "@/src/observability/logger";

describe("StructuredLogger", () => {
  it("emits OpenTelemetry-shaped records with resource and trace context", () => {
    const emit = vi.fn();
    const logger = new StructuredLogger({
      serviceName: "frontend",
      serviceVersion: "1.2.3",
      environment: "test",
      now: () => new Date("2026-01-02T03:04:05.000Z"),
      traceContext: () => ({ traceId: "a".repeat(32), spanId: "b".repeat(16), traceFlags: "01" }),
      sink: { emit },
    });

    logger.info("request complete", { "http.request.method": "GET", "http.response.status_code": 200 });
    const record = emit.mock.calls[0][0][0] as OTelLogRecord;
    expect(record).toMatchObject({
      timestamp: "2026-01-02T03:04:05.000Z",
      severityText: "INFO",
      body: "request complete",
      traceId: "a".repeat(32),
      spanId: "b".repeat(16),
      attributes: { "http.request.method": "GET", "http.response.status_code": 200 },
      resource: { "service.name": "frontend", "service.version": "1.2.3", "deployment.environment.name": "test" },
    });
  });

  it("redacts credentials and serializes errors without stack traces", () => {
    const emit = vi.fn();
    const logger = new StructuredLogger({ serviceName: "frontend", sink: { emit } });
    logger.error("request failed", { authorization: "Bearer secret", nested: { walletAddress: "GABC" } }, new TypeError("network unavailable"));
    const attributes = (emit.mock.calls[0][0][0] as OTelLogRecord).attributes;
    expect(attributes).toMatchObject({ authorization: "[redacted]", nested: { walletAddress: "[redacted]" }, error: { "error.type": "TypeError", "error.message": "network unavailable" } });
    logger.info("server recorded", { "server.address": "api.agritrust.example" });
    expect((emit.mock.calls[1][0][0] as OTelLogRecord).attributes["server.address"]).toBe("api.agritrust.example");
    expect(JSON.stringify(attributes)).not.toContain("Bearer secret");
  });
});

describe("parseTraceparent", () => {
  it("accepts valid W3C trace context and rejects malformed or zero IDs", () => {
    expect(parseTraceparent(`00-${"a".repeat(32)}-${"b".repeat(16)}-01`)).toEqual({ traceId: "a".repeat(32), spanId: "b".repeat(16), traceFlags: "01" });
    expect(parseTraceparent("invalid")).toBeUndefined();
    expect(parseTraceparent(`00-${"0".repeat(32)}-${"b".repeat(16)}-01`)).toBeUndefined();
  });
});
