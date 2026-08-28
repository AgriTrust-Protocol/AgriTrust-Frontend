/**
 * Shared types for the multi-chain wallet integration (issue #167).
 *
 * Scoped as a new, additive `src/web3/*` layer per the issue's own file
 * list — it does NOT replace `components/providers/WalletContext.tsx` /
 * `src/hooks/useWallet.ts`, which is existing, tested, Stellar/Freighter-
 * aware wallet state already used elsewhere in the app. See the top of
 * `WalletProvider.tsx` for why, and for a naming-collision heads-up.
 */

export type EvmChainId = 137 | 42220; // Polygon, Celo
export type ChainKey = "polygon" | "celo" | "stellar";

export type WalletKind = "metamask" | "walletconnect" | "coinbase";

export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
}

export interface WalletConnection {
  account: string;
  chainId: EvmChainId | null; // null for the Stellar connector, which has no EVM chain id
}

/** Common surface every connector (MetaMask, WalletConnect, Coinbase, Stellar) implements. */
export interface WalletConnector {
  readonly id: WalletKind | "stellar";
  isAvailable(): boolean;
  connect(): Promise<WalletConnection>;
  disconnect(): Promise<void> | void;
  /** EVM connectors only — used to build a viem custom transport. Null for Stellar. */
  getProvider(): Eip1193Provider | null;
  switchChain(chainId: EvmChainId): Promise<void>;
  onAccountsChanged(handler: (accounts: string[]) => void): () => void;
  onChainChanged(handler: (chainId: EvmChainId) => void): () => void;
}

/** A single call to be batched into one multicall3 transaction (issue's "approve + deposit + mint" example). */
export interface ContractCall {
  target: `0x${string}`;
  callData: `0x${string}`;
  value?: bigint;
  /** Human label surfaced in TransactionManager/UI, e.g. "approve", "deposit". */
  label?: string;
}

export type TransactionStatus =
  | "pending" // constructed, not yet sent to the wallet for signing
  | "submitted" // signed and broadcast, awaiting first confirmation
  | "confirmed" // included in a block; being watched for reorg/finality
  | "finalized" // survived REORG_SAFE_CONFIRMATIONS blocks without reorg
  | "reorged" // the block it was confirmed in was replaced
  | "failed"; // reverted, or gas estimation failed after all retries

export interface TrackedTransaction {
  id: string;
  hash: `0x${string}` | null;
  chainId: EvmChainId;
  status: TransactionStatus;
  calls: ContractCall[];
  submittedAt: number;
  confirmedBlockNumber: bigint | null;
  confirmedBlockHash: `0x${string}` | null;
  retries: number;
  error?: string;
}
