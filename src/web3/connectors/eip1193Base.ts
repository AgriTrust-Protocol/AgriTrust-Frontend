import type { Eip1193Provider, EvmChainId, WalletConnection, WalletConnector, WalletKind } from "../types";
import { fromHexChainId, toHexChainId, getEvmChain } from "../chains";

/**
 * Shared implementation for wallets that inject a standard EIP-1193
 * `window.ethereum`-shaped provider (MetaMask, Coinbase Wallet's browser
 * extension). WalletConnect v2 does NOT inject a provider this way — see
 * connectors/walletconnect.ts for why it's a distinct, smaller connector.
 */
export abstract class Eip1193Connector implements WalletConnector {
  abstract readonly id: WalletKind;

  protected abstract getInjectedProvider(): Eip1193Provider | undefined;
  /** Distinguishes this wallet from other extensions that may also inject `window.ethereum`. */
  protected abstract matchesInjectedProvider(provider: Eip1193Provider): boolean;

  isAvailable(): boolean {
    const provider = this.getInjectedProvider();
    return !!provider && this.matchesInjectedProvider(provider);
  }

  async connect(): Promise<WalletConnection> {
    const provider = this.requireProvider();
    const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
    if (!accounts?.[0]) throw new Error(`${this.id}: no account returned`);

    const chainHex = (await provider.request({ method: "eth_chainId" })) as string;
    return { account: accounts[0], chainId: fromHexChainId(chainHex) };
  }

  disconnect(): void {
    // EIP-1193 has no standard "disconnect" request most injected wallets honor;
    // the caller (WalletProvider) is responsible for clearing local session state.
  }

  getProvider(): Eip1193Provider | null {
    return this.getInjectedProvider() ?? null;
  }

  async switchChain(chainId: EvmChainId): Promise<void> {
    const provider = this.requireProvider();
    const hexId = toHexChainId(chainId);

    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
    } catch (error) {
      // 4902: chain not yet added to the wallet — add it, then retry the switch.
      if (isUnrecognizedChainError(error)) {
        const chain = getEvmChain(chainId);
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: hexId,
              chainName: chain.name,
              nativeCurrency: chain.nativeCurrency,
              rpcUrls: chain.rpcUrls.default.http,
              blockExplorerUrls: chain.blockExplorers?.default ? [chain.blockExplorers.default.url] : undefined,
            },
          ],
        });
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
        return;
      }
      throw error;
    }
  }

  onAccountsChanged(handler: (accounts: string[]) => void): () => void {
    const provider = this.getInjectedProvider();
    if (!provider) return () => {};
    const wrapped = (accounts: unknown) => handler(Array.isArray(accounts) ? (accounts as string[]) : []);
    provider.on("accountsChanged", wrapped);
    return () => provider.removeListener("accountsChanged", wrapped);
  }

  onChainChanged(handler: (chainId: EvmChainId) => void): () => void {
    const provider = this.getInjectedProvider();
    if (!provider) return () => {};
    const wrapped = (hex: unknown) => handler(fromHexChainId(String(hex)));
    provider.on("chainChanged", wrapped);
    return () => provider.removeListener("chainChanged", wrapped);
  }

  private requireProvider(): Eip1193Provider {
    const provider = this.getInjectedProvider();
    if (!provider || !this.matchesInjectedProvider(provider)) {
      throw new Error(`${this.id} provider not found`);
    }
    return provider;
  }
}

function isUnrecognizedChainError(error: unknown): boolean {
  const code = (error as { code?: number } | undefined)?.code;
  return code === 4902;
}
