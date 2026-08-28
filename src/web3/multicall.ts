import { encodeFunctionData, createPublicClient, http, type Hex } from "viem";
import type { ContractCall, Eip1193Provider, EvmChainId } from "./types";
import { getEvmChain, MULTICALL3_ADDRESS } from "./chains";

export const MAX_BATCH_CALLS = 5;

const MULTICALL3_ABI = [
  {
    type: "function",
    name: "aggregate3Value",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "value", type: "uint256" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      {
        name: "returnData",
        type: "tuple[]",
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
      },
    ],
  },
] as const;

const GAS_ESTIMATE_BUFFER = 1.2; // +20%
const GAS_RETRY_INCREASE = 1.3; // +30% per retry
const MAX_GAS_RETRIES = 3;

export interface BatchedCallRequest {
  to: `0x${string}`;
  data: Hex;
  value: `0x${string}`;
  from: `0x${string}`;
}

/**
 * Encodes up to `MAX_BATCH_CALLS` contract calls into a single multicall3
 * `aggregate3Value` transaction — e.g. the issue's "approve + deposit +
 * mint" example becomes one user-signed transaction instead of three.
 * `allowFailure: false` per call, so any single call reverting reverts the
 * whole batch atomically (the natural choice for a dependent call chain
 * like approve -> deposit -> mint, where a partial application would leave
 * the user in a broken intermediate state).
 */
export function encodeBatch(calls: ContractCall[]): Hex {
  if (calls.length === 0) throw new Error("encodeBatch: at least one call is required");
  if (calls.length > MAX_BATCH_CALLS) {
    throw new Error(`encodeBatch: at most ${MAX_BATCH_CALLS} calls per batch, got ${calls.length}`);
  }

  return encodeFunctionData({
    abi: MULTICALL3_ABI,
    functionName: "aggregate3Value",
    args: [
      calls.map((call) => ({
        target: call.target,
        allowFailure: false,
        value: call.value ?? 0n,
        callData: call.callData,
      })),
    ],
  });
}

function totalValue(calls: ContractCall[]): bigint {
  return calls.reduce((sum, call) => sum + (call.value ?? 0n), 0n);
}

/**
 * Estimates gas for the batched call via the wallet's own
 * `eth_estimateGas`, applying the required 20% buffer. On failure, retries
 * up to `MAX_GAS_RETRIES` times with the buffered estimate increased 30%
 * each attempt — covers the common case where a first estimate against a
 * slightly stale RPC node undershoots actual execution cost.
 */
export async function estimateBatchGas(
  provider: Eip1193Provider,
  from: `0x${string}`,
  calls: ContractCall[]
): Promise<bigint> {
  const data = encodeBatch(calls);
  const value = totalValue(calls);

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_GAS_RETRIES; attempt++) {
    try {
      const raw = (await provider.request({
        method: "eth_estimateGas",
        params: [{ from, to: MULTICALL3_ADDRESS, data, value: `0x${value.toString(16)}` }],
      })) as string;

      const estimate = BigInt(raw);
      const bufferMultiplier = GAS_ESTIMATE_BUFFER * GAS_RETRY_INCREASE ** attempt;
      // Integer math via basis points to avoid floating point on bigint.
      const bufferBps = BigInt(Math.round(bufferMultiplier * 10_000));
      return (estimate * bufferBps) / 10_000n;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `Gas estimation failed after ${MAX_GAS_RETRIES + 1} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

/** Builds the single `eth_sendTransaction` request for a batch — the caller submits it via the wallet. */
export async function buildBatchTransaction(
  _provider: Eip1193Provider,
  from: `0x${string}`,
  calls: ContractCall[]
): Promise<BatchedCallRequest> {
  const data = encodeBatch(calls);
  const value = totalValue(calls);
  return { to: MULTICALL3_ADDRESS, data, value: `0x${value.toString(16)}`, from };
}

/** Read-only convenience: batches multiple `eth_call`s via multicall3 for a UI that needs several contract reads at once (not part of the write-batching flow above, but the natural counterpart). */
export function createBatchReadClient(chainId: EvmChainId) {
  const chain = getEvmChain(chainId);
  return createPublicClient({ chain, transport: http() });
}
