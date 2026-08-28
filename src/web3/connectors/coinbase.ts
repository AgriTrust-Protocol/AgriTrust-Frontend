import type { Eip1193Provider } from "../types";
import { Eip1193Connector } from "./eip1193Base";

/**
 * Covers the Coinbase Wallet *browser extension*, which injects a standard
 * EIP-1193 provider flagged `isCoinbaseWallet`. Coinbase's mobile app uses a
 * separate SDK (deep-link/QR based, `@coinbase/wallet-sdk`) which isn't
 * installed in this repo and is out of scope here — same gap as
 * WalletConnect's relay-based mobile flow, see connectors/walletconnect.ts.
 */
export class CoinbaseConnector extends Eip1193Connector {
  readonly id = "coinbase" as const;

  protected getInjectedProvider(): Eip1193Provider | undefined {
    return typeof window === "undefined" ? undefined : (window.ethereum as Eip1193Provider | undefined);
  }

  protected matchesInjectedProvider(provider: Eip1193Provider): boolean {
    return !!(provider as unknown as { isCoinbaseWallet?: boolean }).isCoinbaseWallet;
  }
}
