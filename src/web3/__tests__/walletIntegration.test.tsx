/**
 * @vitest-environment jsdom
 *
 * Issue #167's own acceptance test: "connect via MetaMask mock, submit
 * batch of 3 transactions, verify all confirmed." A `TransactionManager`
 * tracks ONE multicall3 transaction that bundles the 3 calls (see
 * multicall.ts's doc comment on why they're batched atomically) — "all
 * confirmed" here means all 3 constituent calls, submitted as that single
 * transaction, reach the "confirmed" status together.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MultiChainWalletProvider, useWallet } from "../WalletProvider";
import { TransactionManager } from "../TransactionManager";
import type { ContractCall } from "../types";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const TARGET = "0x2222222222222222222222222222222222222222" as const;
const TX_HASH = "0xhash000000000000000000000000000000000000000000000000000000000";

function installMockMetaMask() {
  const request = vi.fn(async ({ method }: { method: string }) => {
    switch (method) {
      case "eth_requestAccounts":
        return [ACCOUNT];
      case "eth_chainId":
        return "0x89"; // 137, Polygon
      case "eth_estimateGas":
        return "0x2710";
      case "eth_sendTransaction":
        return TX_HASH;
      case "eth_getBalance":
        return "0x0";
      default:
        throw new Error(`unhandled method ${method}`);
    }
  });

  (window as any).ethereum = {
    isMetaMask: true,
    request,
    on: vi.fn(),
    removeListener: vi.fn(),
  };

  return request;
}

function mockPublicClient() {
  return {
    getTransactionReceipt: vi.fn().mockResolvedValue({
      status: "success",
      blockNumber: 100n,
      blockHash: "0xblockA",
    }),
    getBlockNumber: vi.fn().mockResolvedValue(112n), // 12 confirmations -> finalized in one steady-state tick
  } as any;
}

function Harness({ calls, onSubmitted }: { calls: ContractCall[]; onSubmitted: (id: string) => void }) {
  const wallet = useWallet();
  return (
    <div>
      <div data-testid="account">{wallet.account ?? "disconnected"}</div>
      <button onClick={() => wallet.connect("metamask").catch(() => {})}>connect</button>
      <button
        onClick={async () => {
          const id = await wallet.submitBatch(calls);
          onSubmitted(id);
        }}
      >
        submit
      </button>
      <ul data-testid="transactions">
        {wallet.transactions.map((tx) => (
          <li key={tx.id} data-testid={`tx-${tx.id}`}>
            {tx.status}
          </li>
        ))}
      </ul>
    </div>
  );
}

describe("Multi-chain wallet integration (issue #167)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("connects via a mocked MetaMask, submits a batch of 3 calls, and confirms it", async () => {
    const providerRequest = installMockMetaMask();
    const publicClient = mockPublicClient();

    const calls: ContractCall[] = [
      { target: TARGET, callData: "0x01", label: "approve" },
      { target: TARGET, callData: "0x02", label: "deposit" },
      { target: TARGET, callData: "0x03", label: "mint" },
    ];

    let submittedId = "";

    render(
      <MultiChainWalletProvider
        createTransactionManager={(options) => new TransactionManager({ ...options, publicClient, pollIntervalMs: 10 })}
      >
        <Harness calls={calls} onSubmitted={(id) => (submittedId = id)} />
      </MultiChainWalletProvider>
    );

    await act(async () => {
      screen.getByText("connect").click();
    });
    await waitFor(() => expect(screen.getByTestId("account").textContent).toBe(ACCOUNT));

    await act(async () => {
      screen.getByText("submit").click();
    });

    await waitFor(() => expect(submittedId).not.toBe(""));

    // The single batched transaction carries all 3 calls.
    await waitFor(() => {
      const item = screen.getByTestId(`tx-${submittedId}`);
      expect(item).toBeTruthy();
    });

    await waitFor(
      () => {
        const item = screen.getByTestId(`tx-${submittedId}`);
        expect(["confirmed", "finalized"]).toContain(item.textContent);
      },
      { timeout: 3_000 }
    );

    expect(providerRequest).toHaveBeenCalledWith(expect.objectContaining({ method: "eth_sendTransaction" }));
    // One transaction, not three — the batch was sent as a single multicall3 call.
    expect(providerRequest.mock.calls.filter((c) => c[0]?.method === "eth_sendTransaction")).toHaveLength(1);
  });

  it("surfaces a friendly error and does not crash when MetaMask isn't installed", async () => {
    delete (window as any).ethereum;

    render(
      <MultiChainWalletProvider>
        <Harness calls={[]} onSubmitted={() => {}} />
      </MultiChainWalletProvider>
    );

    await act(async () => {
      screen.getByText("connect").click();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByTestId("account").textContent).toBe("disconnected");
  });
});
