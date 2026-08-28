import { polygon, celo } from "viem/chains";
import type { EvmChainId } from "./types";

/** Canonical multicall3 deployment address — identical across virtually every EVM chain, including Polygon and Celo. */
export const MULTICALL3_ADDRESS: `0x${string}` = "0xcA11bde05977b3631167028862bE2a173976CA11";

export const EVM_CHAINS: Record<EvmChainId, typeof polygon | typeof celo> = {
  137: polygon,
  42220: celo,
};

export function getEvmChain(chainId: EvmChainId) {
  const chain = EVM_CHAINS[chainId];
  if (!chain) throw new Error(`Unsupported chain id: ${chainId}`);
  return chain;
}

export function toHexChainId(chainId: EvmChainId): `0x${string}` {
  return `0x${chainId.toString(16)}`;
}

export function fromHexChainId(hex: string): EvmChainId {
  return Number.parseInt(hex, 16) as EvmChainId;
}
