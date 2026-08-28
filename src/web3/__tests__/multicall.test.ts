// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { encodeBatch, estimateBatchGas, buildBatchTransaction, MAX_BATCH_CALLS } from "../multicall";
import type { ContractCall, Eip1193Provider } from "../types";

const FROM = "0x1111111111111111111111111111111111111111" as const;
const TARGET = "0x2222222222222222222222222222222222222222" as const;

function call(overrides: Partial<ContractCall> = {}): ContractCall {
  return { target: TARGET, callData: "0xabcdef", ...overrides };
}

describe("multicall.encodeBatch (issue #167)", () => {
  it("throws with zero calls", () => {
    expect(() => encodeBatch([])).toThrow(/at least one call/i);
  });

  it("throws with more than MAX_BATCH_CALLS calls", () => {
    const calls = Array.from({ length: MAX_BATCH_CALLS + 1 }, () => call());
    expect(() => encodeBatch(calls)).toThrow(/at most 5 calls/i);
  });

  it("encodes exactly MAX_BATCH_CALLS calls without throwing", () => {
    const calls = Array.from({ length: MAX_BATCH_CALLS }, () => call());
    expect(encodeBatch(calls).startsWith("0x")).toBe(true);
  });

  it("produces different calldata for different call sets", () => {
    const a = encodeBatch([call({ callData: "0x1111" })]);
    const b = encodeBatch([call({ callData: "0x2222" })]);
    expect(a).not.toBe(b);
  });
});

describe("multicall.buildBatchTransaction", () => {
  it("targets the multicall3 contract and sums call values", async () => {
    const provider = { request: vi.fn() } as unknown as Eip1193Provider;
    const calls = [call({ value: 100n }), call({ value: 50n })];
    const tx = await buildBatchTransaction(provider, FROM, calls);

    expect(tx.to).toBe("0xcA11bde05977b3631167028862bE2a173976CA11");
    expect(tx.from).toBe(FROM);
    expect(BigInt(tx.value)).toBe(150n);
  });
});

describe("multicall.estimateBatchGas (issue #167 — 20% buffer, 30% backoff, max 3 retries)", () => {
  it("applies a 20% buffer to a successful first estimate", async () => {
    const request = vi.fn().mockResolvedValue("0x2710"); // 10000
    const provider = { request } as unknown as Eip1193Provider;

    const gas = await estimateBatchGas(provider, FROM, [call()]);

    expect(gas).toBe(12_000n); // 10000 * 1.2
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("retries with a larger buffer on failure, succeeding on the 2nd attempt", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error("rpc hiccup"))
      .mockResolvedValueOnce("0x2710");
    const provider = { request } as unknown as Eip1193Provider;

    const gas = await estimateBatchGas(provider, FROM, [call()]);

    // attempt index 1 -> multiplier = 1.2 * 1.3^1 = 1.56
    expect(gas).toBe(15_600n);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("throws after MAX_GAS_RETRIES + 1 total attempts all fail", async () => {
    const request = vi.fn().mockRejectedValue(new Error("still failing"));
    const provider = { request } as unknown as Eip1193Provider;

    await expect(estimateBatchGas(provider, FROM, [call()])).rejects.toThrow(/Gas estimation failed/);
    expect(request).toHaveBeenCalledTimes(4); // initial + 3 retries
  });
});
