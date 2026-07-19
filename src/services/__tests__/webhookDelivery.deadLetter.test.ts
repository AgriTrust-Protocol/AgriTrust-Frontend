import { describe, expect, it, vi } from "vitest";
import { DeadLetterQueue } from "@/src/services/messaging/deadLetterQueue";
import { WebhookDeliveryService, type WebhookDeliveryDeadLetterPayload } from "../webhookDelivery";

const event = {
  id: "event-1",
  type: "shipment.failed",
  occurredAt: "2026-07-19T00:00:00.000Z",
  data: { shipmentId: "ship-1" },
};

describe("WebhookDeliveryService dead lettering", () => {
  it("dead-letters retry-exhausted deliveries after bounded attempts", async () => {
    const deadLetterQueue = new DeadLetterQueue<WebhookDeliveryDeadLetterPayload>();
    const fetchMock = vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 }));
    const service = new WebhookDeliveryService({
      deadLetterQueue,
      fetch: fetchMock,
      sleep: vi.fn().mockResolvedValue(undefined),
      random: () => 0.5,
      now: () => 1_700_000_000_000,
      retry: { maxAttempts: 2, initialDelayMs: 1, maxDelayMs: 1, jitter: 0 },
    });

    const result = await service.deliver({ event, url: "https://hooks.example.com/agritrust", signingKeyId: "key-1" }, "secret");

    expect(result).toMatchObject({ success: false, deadLettered: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(deadLetterQueue.list()).resolves.toEqual([
      expect.objectContaining({
        type: "shipment.failed",
        attempts: 2,
        reason: "retry_exhausted",
        source: "webhook-delivery",
        replayable: true,
        correlationId: "event-1",
      }),
    ]);
  });

  it("dead-letters non-retryable responses without replay eligibility", async () => {
    const deadLetterQueue = new DeadLetterQueue<WebhookDeliveryDeadLetterPayload>();
    const service = new WebhookDeliveryService({
      deadLetterQueue,
      fetch: vi.fn().mockResolvedValue(new Response("bad request", { status: 400 })),
      now: () => 1_700_000_000_000,
    });

    const result = await service.deliver({ event, url: "https://hooks.example.com/agritrust", signingKeyId: "key-1" }, "secret");

    expect(result.deadLettered).toBe(true);
    await expect(deadLetterQueue.list()).resolves.toEqual([
      expect.objectContaining({ reason: "non_retryable", replayable: false, attempts: 1 }),
    ]);
  });
});
