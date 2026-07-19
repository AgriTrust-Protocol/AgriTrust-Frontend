import type { Eip1193Provider, SupportedChainId, WalletConnector } from "../types";
import { toHexChainId } from "../chains";

export function createWalletConnectConnector(provider: Eip1193Provider): WalletConnector {
  return {
    id: "walletconnect",
    name: "WalletConnect",
    getProvider: () => provider,
    async connect() {
      const accounts = await provider.request<string[]>({ method: "eth_requestAccounts" });
      if (!accounts[0]) throw new Error("No WalletConnect account selected");
      return accounts[0];
    },
    async disconnect() {
      await provider.request({ method: "wallet_disconnect" }).catch(() => undefined);
    },
    async switchChain(chainId: SupportedChainId) {
      if (typeof chainId !== "number") throw new Error("WalletConnect only supports EVM chains here");
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: toHexChainId(chainId) }] });
    },
  };
}
