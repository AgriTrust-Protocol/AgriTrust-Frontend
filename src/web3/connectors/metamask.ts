import { SUPPORTED_CHAINS, toHexChainId } from "../chains";
import type { Eip1193Provider, SupportedChainId, WalletConnector } from "../types";

function injectedEthereum(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return (window as typeof window & { ethereum?: Eip1193Provider }).ethereum ?? null;
}

export function createMetaMaskConnector(provider: Eip1193Provider | null = injectedEthereum()): WalletConnector {
  return {
    id: "metamask",
    name: "MetaMask",
    getProvider: () => provider,
    async connect() {
      if (!provider) throw new Error("MetaMask is not installed");
      const accounts = await provider.request<string[]>({ method: "eth_requestAccounts" });
      if (!accounts[0]) throw new Error("No MetaMask account selected");
      return accounts[0];
    },
    async switchChain(chainId: SupportedChainId) {
      if (!provider) throw new Error("MetaMask is not installed");
      if (typeof chainId !== "number") throw new Error("MetaMask only supports EVM chains");
      try {
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: toHexChainId(chainId) }] });
      } catch (error) {
        const err = error as { code?: number };
        if (err.code !== 4902) throw error;
        const chain = Object.values(SUPPORTED_CHAINS).find((candidate) => candidate.chainId === chainId);
        if (!chain) throw new Error("Unsupported chain");
        await provider.request({ method: "wallet_addEthereumChain", params: [{ ...chain, chainId: toHexChainId(chainId) }] });
      }
    },
  };
}
