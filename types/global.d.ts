/// <reference types="vite/client" />

interface FreighterProvider {
  isConnected: () => boolean;
  connect: () => Promise<{ address: string }>;
  disconnect: () => void;
  signMessage: (message: string) => Promise<{ signedMessage: string }>;
  sign: (message: Uint8Array) => Promise<{ signature: string }>;
  getAccount: () => string | null;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

interface LobstrProvider {
  connect: () => Promise<{ publicKey: string }>;
  disconnect: () => void;
  isConnected: () => boolean;
  getPublicKey: () => string | null;
  sign: (message: string) => Promise<{ signature: string }>;
}

interface EthereumProvider {
  isMetaMask?: boolean;
  isWalletConnect?: boolean;
  isCoinbaseWallet?: boolean;
  selectedAddress?: string;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (
    event: string,
    handler: (...args: unknown[]) => void
  ) => void;
}

interface IdleDeadline {
  didTimeout: boolean;
  timeRemaining(): number;
}

interface Window {
  ethereum?: EthereumProvider;
  freighter?: FreighterProvider;
  lobstr?: LobstrProvider;
  sorobanEvents?: (account: string) => void;
  requestIdleCallback?: (
    callback: (deadline: IdleDeadline) => void,
    options?: { timeout: number }
  ) => number;
  cancelIdleCallback?: (id: number) => void;
}
