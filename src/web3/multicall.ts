import type { Eip1193Provider } from "./types";

export interface ContractCall {
  target: `0x${string}`;
  data: `0x${string}`;
  value?: `0x${string}` | bigint;
}

export interface BatchOptions {
  from: `0x${string}`;
  multicallAddress: `0x${string}`;
}

const MAX_BATCH_CALLS = 5;

function toHex(value: bigint): `0x${string}` {
  return `0x${value.toString(16)}`;
}

export function encodeMulticallBatch(calls: ContractCall[]): `0x${string}` {
  if (calls.length === 0) throw new Error("Batch requires at least one call");
  if (calls.length > MAX_BATCH_CALLS) throw new Error("Batch cannot exceed 5 calls");
  const payload = JSON.stringify(calls.map((call) => ({ ...call, value: call.value?.toString() ?? "0" })));
  const bytes = new TextEncoder().encode(payload);
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function estimateBatchGas(provider: Eip1193Provider, tx: { from: string; to: string; data: string }, bufferPercent = 20): Promise<`0x${string}`> {
  const estimated = BigInt(await provider.request<string>({ method: "eth_estimateGas", params: [tx] }));
  return toHex((estimated * BigInt(100 + bufferPercent)) / 100n);
}

export async function submitMulticallBatch(provider: Eip1193Provider, calls: ContractCall[], options: BatchOptions & { gasBufferPercent?: number }): Promise<string> {
  const tx = { from: options.from, to: options.multicallAddress, data: encodeMulticallBatch(calls) };
  const gas = await estimateBatchGas(provider, tx, options.gasBufferPercent ?? 20);
  return provider.request<string>({ method: "eth_sendTransaction", params: [{ ...tx, gas }] });
}
