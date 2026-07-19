import { describe, expect, it, vi } from "vitest";
import { DeadLetterQueue } from "../deadLetterQueue";

describe("DeadLetterQueue", () => {
  it("stores failed messages with safe metadata and emits metrics", async () => {
    const onMetric = vi.fn();
    const queue = new DeadLetterQueue<{ orderId: string }>({ now: () => 1_700_000_000_000, onMetric });

    const message = await queue.enqueue({
      id: "msg-1",
      type: "order.created",
      payload: { orderId: "order-1" },
      attempts: 5,
      error: new Error("receiver timeout"),
      reason: "retry_exhausted",
      source: "webhook-delivery",
      correlationId: "event-1",
      replayable: true,
      metadata: { endpointHost: "example.com" },
    });

    expect(message).toMatchObject({
      id: "msg-1",
      lastError: "receiver timeout",
      occurredAt: "2023-11-14T22:13:20.000Z",
      replayable: true,
    });
    await expect(queue.list()).resolves.toHaveLength(1);
    expect(onMetric).toHaveBeenCalledWith({
      name: "dead_letter_message_stored",
      value: 1,
      tags: { source: "webhook-delivery", type: "order.created", reason: "retry_exhausted", replayable: true },
    });
  });

  it("replays only replayable messages and removes successful replays", async () => {
    const queue = new DeadLetterQueue<string>();
    await queue.enqueue({
      id: "msg-2",
      type: "inventory.adjusted",
      payload: "payload",
      attempts: 3,
      error: "bad gateway",
      reason: "retry_exhausted",
      source: "consumer",
      replayable: true,
    });

    const handler = vi.fn().mockResolvedValue(undefined);
    await expect(queue.replay("msg-2", handler)).resolves.toBe(true);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: "msg-2" }));
    await expect(queue.list()).resolves.toHaveLength(0);
  });
});
