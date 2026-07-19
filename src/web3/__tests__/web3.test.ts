import { describe, expect, it, vi } from "vitest";
import { TransactionManager } from "../TransactionManager";
import { mapWeb3Error } from "../errorMapper";
import { encodeMulticallBatch, submitMulticallBatch, type ContractCall } from "../multicall";
import type { Eip1193Provider } from "../types";

const calls: ContractCall[] = [
  { target: "0x0000000000000000000000000000000000000001", data: "0xaaa" },
  { target: "0x0000000000000000000000000000000000000002", data: "0xbbb" },
  { target: "0x0000000000000000000000000000000000000003", data: "0xccc" },
];

describe("multicall batching", () => {
  it("limits batches to five calls and submits with a 20% gas buffer", async () => {
    expect(() => encodeMulticallBatch([...calls, ...calls])).toThrow("5 calls");
    const request = vi.fn(async ({ method, params }: { method: string; params?: Array<Record<string, string>> }) => {
      if (method === "eth_estimateGas") return "0x64";
      if (method === "eth_sendTransaction") {
        expect(params[0].gas).toBe("0x78");
        return "0xhash";
      }
      throw new Error(method);
    });
    await expect(submitMulticallBatch({ request } as Eip1193Provider, calls, { from: "0x000000000000000000000000000000000000000a", multicallAddress: "0x000000000000000000000000000000000000000b" })).resolves.toBe("0xhash");
  });
});

describe("TransactionManager", () => {
  it("tracks a three-call batch from pending to finalized", async () => {
    vi.useFakeTimers();
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_estimateGas") return "0x64";
      if (method === "eth_sendTransaction") return "0xhash";
      if (method === "eth_blockNumber") return "0x10";
      if (method === "eth_getTransactionReceipt") return { blockNumber: "0x0f", status: "0x1" };
      throw new Error(method);
    });
    const manager = new TransactionManager({ provider: { request } as Eip1193Provider, confirmationsToFinalize: 2, pollIntervalMs: 1_000 });
    const seen: string[] = [];
    manager.on("status", (tx) => seen.push(tx.status));
    const tx = await manager.submitBatch(calls, { from: "0x000000000000000000000000000000000000000a", multicallAddress: "0x000000000000000000000000000000000000000b" });
    await vi.runOnlyPendingTimersAsync();
    expect(manager.getTransaction(tx.id)?.status).toBe("finalized");
    expect(seen).toEqual(expect.arrayContaining(["pending", "submitted", "finalized"]));
    manager.stop();
    vi.useRealTimers();
  });
});

describe("error mapper", () => {
  it("maps revert reasons to friendly messages", () => {
    expect(mapWeb3Error({ message: "execution reverted: InsufficientAllowance" })).toContain("approve");
  });
});
