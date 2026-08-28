import type { Eip1193Provider } from "../types";
import { Eip1193Connector } from "./eip1193Base";

export class MetaMaskConnector extends Eip1193Connector {
  readonly id = "metamask" as const;

  protected getInjectedProvider(): Eip1193Provider | undefined {
    return typeof window === "undefined" ? undefined : (window.ethereum as Eip1193Provider | undefined);
  }

  protected matchesInjectedProvider(provider: Eip1193Provider): boolean {
    return !!(provider as unknown as { isMetaMask?: boolean }).isMetaMask;
  }
}
