import { describe, expect, it, vi } from "vitest";
import {
  canonicalJson,
  retryDelayMs,
  isSafeWebhookUrl,
  signWebhookPayload,
  verifyWebhookSignature,
  WebhookDeliveryService,
} from "@/src/services/webhookDelivery";

const fixedNow = () => Date.parse("2026-07-17T12:00:00.000Z");
const event = { id: "evt_123", type: "certificate.issued", occurredAt: "2026-07-17T12:00:00.000Z", data: { farmId: "farm_1" } };

describe("webhook signatures", () => {
  it("canonicalizes nested object keys so signed bodies are deterministic", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, b: true } })).toBe('{"a":{"b":true,"y":2},"z":1}');
    expect(() => canonicalJson({ missing: undefined })).toThrow(/cannot be represented/i);
  });

  it("verifies a valid signature and rejects a tampered body or stale timestamp", async () => {
    const timestamp = "2026-07-17T12:00:00.000Z";
    const body = canonicalJson(event);
    const signature = await signWebhookPayload("secret", timestamp, "del_123", body);
    await expect(verifyWebhookSignature({ secret: "secret", timestamp, deliveryId: "del_123", body, signature, now: fixedNow })).resolves.toBe(true);
    await expect(verifyWebhookSignature({ secret: "secret", timestamp, deliveryId: "del_123", body: "{}", signature, now: fixedNow })).resolves.toBe(false);
    await expect(verifyWebhookSignature({ secret: "secret", timestamp: "2026-07-17T11:54:59.999Z", deliveryId: "del_123", body, signature, now: fixedNow })).resolves.toBe(false);
  });
});

describe("WebhookDeliveryService", () => {
  it("rejects non-HTTPS and private-network endpoints before dispatch", () => {
    expect(isSafeWebhookUrl("https://receiver.example/hooks")).toBe(true);
    expect(isSafeWebhookUrl("http://receiver.example/hooks")).toBe(false);
    expect(isSafeWebhookUrl("https://127.0.0.1/hooks")).toBe(false);
    expect(isSafeWebhookUrl("https://user:pass@receiver.example/hooks")).toBe(false);
  });

  it("retries a transient failure, honors retry-after, and preserves delivery identity", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 429, headers: { "retry-after": "2" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const metrics = vi.fn();
    const result = await new WebhookDeliveryService({ fetch, sleep, now: fixedNow, onMetric: metrics }).deliver({ event, url: "https://receiver.example/hooks", signingKeyId: "key_1" }, "secret");
    expect(result.success).toBe(true);
    expect(result.attempts).toHaveLength(2);
    expect(sleep).toHaveBeenCalledWith(2000);
    const firstHeaders = fetch.mock.calls[0][1].headers;
    const secondHeaders = fetch.mock.calls[1][1].headers;
    expect(firstHeaders["webhook-delivery-id"]).toBe(secondHeaders["webhook-delivery-id"]);
    expect(firstHeaders["idempotency-key"]).toBe(event.id);
    expect(metrics).toHaveBeenCalledWith(expect.objectContaining({ name: "webhook_delivery_completed", tags: { success: true, attempts: 2 } }));
  });

  it("does not retry a non-retryable client error", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("invalid", { status: 400 }));
    const result = await new WebhookDeliveryService({ fetch, now: fixedNow }).deliver({ event, url: "https://receiver.example/hooks", signingKeyId: "key_1" }, "secret");
    expect(result.success).toBe(false);
    expect(result.attempts).toHaveLength(1);
  });

  it("uses bounded exponential backoff with configurable jitter", () => {
    expect(retryDelayMs(1, { maxAttempts: 3, initialDelayMs: 100, maxDelayMs: 250, jitter: 0 }, () => 0.5)).toBe(100);
    expect(retryDelayMs(3, { maxAttempts: 3, initialDelayMs: 100, maxDelayMs: 250, jitter: 0 }, () => 0.5)).toBe(250);
  });
});
