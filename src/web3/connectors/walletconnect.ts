import type { Eip1193Provider, EvmChainId, WalletConnection, WalletConnector } from "../types";
import { fromHexChainId, toHexChainId, getEvmChain } from "../chains";

export type WalletConnectProviderFactory = () => Promise<Eip1193Provider>;

/**
 * WalletConnect v2 (EIP-1328) is fundamentally different from MetaMask/
 * Coinbase: there's no `window.ethereum` to detect — a real integration
 * pairs via a relay server and QR code/deep link using
 * `@walletconnect/ethereum-provider`, which is NOT installed in this repo
 * (not present in package.json) and needs a WalletConnect Cloud project ID
 * to function at all.
 *
 * Rather than fake that, this connector accepts an optional provider
 * *factory* — once `@walletconnect/ethereum-provider` is added and a
 * project ID configured, wire it up as:
 *
 *   new WalletConnectConnector(async () => {
 *     const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
 *     const provider = await EthereumProvider.init({ projectId: "...", chains: [137], ... });
 *     return provider as unknown as Eip1193Provider;
 *   })
 *
 * Without a factory, this connector also recognizes an already-injected
 * EIP-1193 provider flagged `isWalletConnect` (the case inside a
 * WalletConnect-compatible mobile wallet's in-app browser) — matching how
 * `components/providers/WalletContext.tsx` already detects it. With
 * neither, `connect()` throws a clear, actionable error instead of
 * silently no-oping.
 */
export class WalletConnectConnector implements WalletConnector {
  readonly id = "walletconnect" as const;
  private provider: Eip1193Provider | null = null;

  constructor(private readonly createProvider?: WalletConnectProviderFactory) {}

  isAvailable(): boolean {
    if (this.createProvider) return true;
    return !!this.getInjectedWalletConnectProvider();
  }

  private getInjectedWalletConnectProvider(): Eip1193Provider | undefined {
    if (typeof window === "undefined") return undefined;
    const injected = window.ethereum as (Eip1193Provider & { isWalletConnect?: boolean }) | undefined;
    return injected?.isWalletConnect ? injected : undefined;
  }

  private async resolveProvider(): Promise<Eip1193Provider> {
    if (this.provider) return this.provider;

    if (this.createProvider) {
      this.provider = await this.createProvider();
      return this.provider;
    }

    const injected = this.getInjectedWalletConnectProvider();
    if (injected) {
      this.provider = injected;
      return this.provider;
    }

    throw new Error(
      "WalletConnect is not configured: no provider factory was supplied to " +
        "WalletConnectConnector and no injected WalletConnect-compatible provider " +
        "was found. Install @walletconnect/ethereum-provider and pass a factory " +
        "(see the doc comment on this class)."
    );
  }

  async connect(): Promise<WalletConnection> {
    const provider = await this.resolveProvider();
    const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
    if (!accounts?.[0]) throw new Error("walletconnect: no account returned");
    const chainHex = (await provider.request({ method: "eth_chainId" })) as string;
    return { account: accounts[0], chainId: fromHexChainId(chainHex) };
  }

  disconnect(): void {
    this.provider = null;
  }

  getProvider(): Eip1193Provider | null {
    return this.provider;
  }

  async switchChain(chainId: EvmChainId): Promise<void> {
    const provider = await this.resolveProvider();
    const hexId = toHexChainId(chainId);
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
    } catch (error) {
      if ((error as { code?: number } | undefined)?.code === 4902) {
        const chain = getEvmChain(chainId);
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: hexId,
              chainName: chain.name,
              nativeCurrency: chain.nativeCurrency,
              rpcUrls: chain.rpcUrls.default.http,
            },
          ],
        });
        return;
      }
      throw error;
    }
  }

  onAccountsChanged(handler: (accounts: string[]) => void): () => void {
    if (!this.provider) return () => {};
    const wrapped = (accounts: unknown) => handler(Array.isArray(accounts) ? (accounts as string[]) : []);
    this.provider.on("accountsChanged", wrapped);
    return () => this.provider?.removeListener("accountsChanged", wrapped);
  }

  onChainChanged(handler: (chainId: EvmChainId) => void): () => void {
    if (!this.provider) return () => {};
    const wrapped = (hex: unknown) => handler(fromHexChainId(String(hex)));
    this.provider.on("chainChanged", wrapped);
    return () => this.provider?.removeListener("chainChanged", wrapped);
  }
}
