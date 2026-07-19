import type { Eip1193Provider, SupportedChainId, WalletConnector } from "../types";
import { toHexChainId } from "../chains";

export function createCoinbaseWalletConnector(provider: Eip1193Provider): WalletConnector {
  return {
    id: "coinbase",
    name: "Coinbase Wallet",
    getProvider: () => provider,
    async connect() {
      const accounts = await provider.request<string[]>({ method: "eth_requestAccounts" });
      if (!accounts[0]) throw new Error("No Coinbase Wallet account selected");
      return accounts[0];
    },
    async switchChain(chainId: SupportedChainId) {
      if (typeof chainId !== "number") throw new Error("Coinbase Wallet only supports EVM chains here");
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: toHexChainId(chainId) }] });
    },
  };
}
