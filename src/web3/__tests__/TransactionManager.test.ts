// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { TransactionManager } from "../TransactionManager";
import type { ContractCall, Eip1193Provider } from "../types";

const FROM = "0x1111111111111111111111111111111111111111" as const;
const TARGET = "0x2222222222222222222222222222222222222222" as const;
const TX_HASH = "0xhash000000000000000000000000000000000000000000000000000000000" as const;

function call(): ContractCall {
  return { target: TARGET, callData: "0xabcdef" };
}

function makeProvider(overrides: Partial<Record<string, (...args: unknown[]) => unknown>> = {}): Eip1193Provider {
  const request = vi.fn(async ({ method }: { method: string }) => {
    if (overrides[method]) return overrides[method]();
    if (method === "eth_estimateGas") return "0x2710";
    if (method === "eth_sendTransaction") return TX_HASH;
    throw new Error(`unhandled method ${method}`);
  });
  return { request, on: vi.fn(), removeListener: vi.fn() } as unknown as Eip1193Provider;
}

function makePublicClient(overrides: Partial<Record<string, (...args: unknown[]) => unknown>> = {}) {
  return {
    getTransactionReceipt: vi.fn(async () => ({ status: "success", blockNumber: 100n, blockHash: "0xblockA" })),
    getBlockNumber: vi.fn(async () => 100n),
    ...overrides,
  } as any;
}

describe("TransactionManager (issue #167)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("goes pending -> submitted -> confirmed -> finalized as blocks accumulate", async () => {
    vi.useFakeTimers();
    const publicClient = makePublicClient({
      getBlockNumber: vi.fn().mockResolvedValue(112n), // 112 - 100 = 12 confirmations, meets the default threshold
    });
    const provider = makeProvider();
    const manager = new TransactionManager({
      provider,
      chainId: 137,
      publicClient,
      pollIntervalMs: 1_000,
      finalityConfirmations: 12,
    });

    const updates: string[] = [];
    manager.on("update", (tx) => updates.push(tx.status));

    const id = await manager.submitBatch(FROM, [call()]);
    expect(updates).toEqual(expect.arrayContaining(["pending", "submitted"]));

    await vi.advanceTimersByTimeAsync(0); // first confirmation poll tick
    expect(manager.get(id)?.status).toBe("confirmed");

    await vi.advanceTimersByTimeAsync(1_000); // second tick -> enough confirmations -> finalized
    expect(manager.get(id)?.status).toBe("finalized");

    manager.destroy();
  });

  it("marks a transaction failed when the receipt reports reverted", async () => {
    vi.useFakeTimers();
    const publicClient = makePublicClient({
      getTransactionReceipt: vi.fn().mockResolvedValue({ status: "reverted", blockNumber: 100n, blockHash: "0xblockA" }),
    });
    const provider = makeProvider();
    const manager = new TransactionManager({ provider, chainId: 137, publicClient, pollIntervalMs: 1_000 });

    const id = await manager.submitBatch(FROM, [call()]);
    await vi.advanceTimersByTimeAsync(0);

    const tx = manager.get(id);
    expect(tx?.status).toBe("failed");
    expect(tx?.error).toMatch(/reverted/i);

    manager.destroy();
  });

  it("marks a transaction reorged when the confirmed block hash changes", async () => {
    vi.useFakeTimers();
    let call_ = 0;
    const publicClient = makePublicClient({
      getTransactionReceipt: vi.fn(async () => {
        call_ += 1;
        return call_ === 1
          ? { status: "success", blockNumber: 100n, blockHash: "0xblockA" }
          : { status: "success", blockNumber: 100n, blockHash: "0xblockB" }; // same height, different hash -> reorg
      }),
      getBlockNumber: vi.fn().mockResolvedValue(100n),
    });
    const provider = makeProvider();
    const manager = new TransactionManager({ provider, chainId: 137, publicClient, pollIntervalMs: 1_000 });

    const id = await manager.submitBatch(FROM, [call()]);
    await vi.advanceTimersByTimeAsync(0); // -> confirmed on blockA
    expect(manager.get(id)?.status).toBe("confirmed");

    await vi.advanceTimersByTimeAsync(1_000); // -> reorged onto blockB
    expect(manager.get(id)?.status).toBe("reorged");

    manager.destroy();
  });

  it("marks a transaction failed with a mapped message when gas estimation fails after all retries", async () => {
    const provider = makeProvider({
      eth_estimateGas: () => {
        throw new Error("always fails");
      },
    });
    const manager = new TransactionManager({ provider, chainId: 137, publicClient: makePublicClient() });

    const id = await manager.submitBatch(FROM, [call()]);
    const tx = manager.get(id);
    expect(tx?.status).toBe("failed");
    expect(tx?.error).toBeTruthy();
  });

  it("submits a batch of 3 calls and confirms all of them under one transaction", async () => {
    vi.useFakeTimers();
    const publicClient = makePublicClient({
      getBlockNumber: vi.fn().mockResolvedValue(112n),
    });
    const provider = makeProvider();
    const manager = new TransactionManager({
      provider,
      chainId: 137,
      publicClient,
      pollIntervalMs: 1_000,
      finalityConfirmations: 12,
    });

    const calls: ContractCall[] = [
      { target: TARGET, callData: "0x01", label: "approve" },
      { target: TARGET, callData: "0x02", label: "deposit" },
      { target: TARGET, callData: "0x03", label: "mint" },
    ];

    const id = await manager.submitBatch(FROM, calls);
    expect(manager.get(id)?.calls).toHaveLength(3);
    expect(provider.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: "eth_sendTransaction" })
    );

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(manager.get(id)?.status).toBe("finalized");

    manager.destroy();
  });
});
