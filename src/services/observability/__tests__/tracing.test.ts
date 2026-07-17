import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTraceContext,
  formatTraceparent,
  parseTraceparent,
  initializeTracing,
  shouldPropagateTrace,
  shutdownTracing,
} from "../tracing";

afterEach(() => shutdownTracing());

describe("W3C trace context", () => {
  it("round trips a valid traceparent", () => {
    const context = { traceId: "a".repeat(32), spanId: "b".repeat(16), traceFlags: "01" };
    expect(parseTraceparent(formatTraceparent(context))).toEqual(context);
  });

  it("rejects malformed and all-zero IDs", () => {
    expect(parseTraceparent("00-00000000000000000000000000000000-bbbbbbbbbbbbbbbb-01")).toBeUndefined();
    expect(parseTraceparent("01-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01")).toBeUndefined();
  });

  it("creates a child context that retains the trace ID", () => {
    const parent = { traceId: "a".repeat(32), spanId: "b".repeat(16), traceFlags: "01" };
    const child = createTraceContext(parent);
    expect(child.traceId).toBe(parent.traceId);
    expect(child.spanId).not.toBe(parent.spanId);
  });
});

describe("trace propagation boundary", () => {
  it("allows only the first-party and explicitly trusted origins", () => {
    expect(shouldPropagateTrace("https://api.agritrust.example/v1", ["https://api.agritrust.example"])).toBe(true);
    expect(shouldPropagateTrace("https://evil.example/v1", ["https://api.agritrust.example"])).toBe(false);
    expect(shouldPropagateTrace("http://api.agritrust.example/v1", ["https://api.agritrust.example"])).toBe(false);
  });
});

describe("fetch instrumentation", () => {
  it("adds a valid traceparent to trusted first-party requests", async () => {
    const nativeFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    window.fetch = nativeFetch;
    initializeTracing();

    await window.fetch("/api/health");

    const [, init] = nativeFetch.mock.calls[0] as [RequestInfo, RequestInit];
    expect(parseTraceparent(new Headers(init.headers).get("traceparent"))).toBeDefined();
  });

  it("does not add a trace header to an untrusted URL", async () => {
    const nativeFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    window.fetch = nativeFetch;
    initializeTracing();

    await window.fetch("https://untrusted.example/collect");

    expect(nativeFetch).toHaveBeenCalledWith("https://untrusted.example/collect", undefined);
  });
});
