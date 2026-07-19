export type EvmChainId = 137 | 42220;
export type SorobanChainId = "stellar-soroban";
export type SupportedChainId = EvmChainId | SorobanChainId;
export type WalletId = "metamask" | "walletconnect" | "coinbase" | "soroban";

export interface Eip1193Provider {
  request<T = unknown>(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<T>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
  selectedAddress?: string | null;
  isMetaMask?: boolean;
  isWalletConnect?: boolean;
  isCoinbaseWallet?: boolean;
}

export interface SorobanProvider {
  request<T = unknown>(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<T>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

export interface WalletConnector {
  id: WalletId;
  name: string;
  getProvider(): Eip1193Provider | SorobanProvider | null;
  connect(): Promise<string>;
  disconnect?(): Promise<void> | void;
  switchChain(chainId: SupportedChainId): Promise<void>;
}

export interface WalletSession {
  walletId: WalletId;
  account: string;
  chainId: SupportedChainId;
}
