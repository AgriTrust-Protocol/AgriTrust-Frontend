import type { SupportedChainId } from "./types";

export const POLYGON_CHAIN_ID = 137;
export const CELO_CHAIN_ID = 42220;
export const SOROBAN_CHAIN_ID = "stellar-soroban" as const;

export const SUPPORTED_CHAINS: Record<string, { chainId: SupportedChainId; name: string; rpcUrls: string[]; nativeCurrency?: { name: string; symbol: string; decimals: number }; blockExplorerUrls?: string[] }> = {
  polygon: {
    chainId: POLYGON_CHAIN_ID,
    name: "Polygon Mainnet",
    rpcUrls: ["https://polygon-rpc.com"],
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    blockExplorerUrls: ["https://polygonscan.com"],
  },
  celo: {
    chainId: CELO_CHAIN_ID,
    name: "Celo Mainnet",
    rpcUrls: ["https://forno.celo.org"],
    nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
    blockExplorerUrls: ["https://celoscan.io"],
  },
  soroban: {
    chainId: SOROBAN_CHAIN_ID,
    name: "Stellar Soroban",
    rpcUrls: ["https://soroban-rpc.mainnet.stellar.gateway.fm"],
  },
};

export function toHexChainId(chainId: number): `0x${string}` {
  return `0x${chainId.toString(16)}`;
}
