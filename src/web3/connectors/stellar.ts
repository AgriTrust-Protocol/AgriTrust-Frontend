import type { Eip1193Provider, EvmChainId, WalletConnection, WalletConnector } from "../types";

/**
 * Stellar has no EVM chain id and no EIP-1193 provider — it's included
 * here as a `WalletConnector` so `WalletProvider.tsx` can offer "connect
 * to Stellar (Soroban)" alongside the two EVM chains through one uniform
 * interface, per the issue's "Chains: Polygon, Celo, Stellar Soroban"
 * requirement.
 *
 * This delegates to `window.freighter`, the same global already declared
 * in types/global.d.ts and used by the existing
 * `components/providers/WalletContext.tsx` — it does not reimplement
 * Soroban wallet handling.
 */
export class StellarConnector implements WalletConnector {
  readonly id = "stellar" as const;

  isAvailable(): boolean {
    return typeof window !== "undefined" && !!window.freighter;
  }

  async connect(): Promise<WalletConnection> {
    const freighter = window.freighter;
    if (!freighter) throw new Error("Freighter not found");
    const { address } = await freighter.connect();
    return { account: address, chainId: null };
  }

  disconnect(): void {
    window.freighter?.disconnect();
  }

  getProvider(): Eip1193Provider | null {
    return null; // no EVM-style transport — Soroban RPC calls go through src/services/rpc/client.ts instead
  }

  async switchChain(_chainId: EvmChainId): Promise<void> {
    throw new Error("Stellar connector has no EVM chain to switch — it is already Soroban.");
  }

  onAccountsChanged(handler: (accounts: string[]) => void): () => void {
    const freighter = window.freighter;
    if (!freighter) return () => {};
    const wrapped = () => {
      const account = freighter.getAccount();
      handler(account ? [account] : []);
    };
    freighter.on("accountChanged", wrapped);
    return () => freighter.removeListener?.("accountChanged", wrapped);
  }

  onChainChanged(): () => void {
    return () => {}; // no chain-switching concept for this connector
  }
}
