"use client";

/**
 * Multi-chain wallet provider (issue #167).
 *
 * NAMING HEADS-UP: `useWallet` here is a DIFFERENT hook from the app's
 * existing `@/src/hooks/useWallet` and `@/components/providers/WalletContext`
 * (Stellar/Freighter-focused, cross-tab synced, already used throughout the
 * dashboard). This module is additive — it was built against the file list
 * in issue #167 itself (`src/web3/WalletProvider.tsx` didn't exist before
 * this), not a refactor of the existing wallet context. The two are not
 * wired together; if a file needs both, alias one import:
 *
 *   import { useWallet as useMultiChainWallet } from "@/src/web3/WalletProvider";
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPublicClient, formatEther, http } from "viem";
import type { ContractCall, EvmChainId, TrackedTransaction, WalletConnector, WalletKind } from "./types";
import { getEvmChain } from "./chains";
import { MetaMaskConnector } from "./connectors/metamask";
import { WalletConnectConnector, type WalletConnectProviderFactory } from "./connectors/walletconnect";
import { CoinbaseConnector } from "./connectors/coinbase";
import { StellarConnector } from "./connectors/stellar";
import { TransactionManager } from "./TransactionManager";
import { mapWeb3Error } from "./errorMapper";

export type ConnectorId = WalletKind | "stellar";

export interface MultiChainWalletState {
  account: string | null;
  chainId: EvmChainId | null;
  /** Formatted native-token balance (e.g. "1.2345"), null until resolved or unavailable (Stellar / not yet fetched). */
  balance: string | null;
  connectorId: ConnectorId | null;
  isConnecting: boolean;
  error: string | null;
  connect: (connectorId: ConnectorId) => Promise<void>;
  disconnect: () => void;
  switchChain: (chainId: EvmChainId) => Promise<void>;
  /** Batches up to 5 calls into one multicall3 transaction; EVM chains only. */
  submitBatch: (calls: ContractCall[]) => Promise<string>;
  getTransaction: (id: string) => TrackedTransaction | undefined;
  transactions: TrackedTransaction[];
}

const MultiChainWalletContext = createContext<MultiChainWalletState | null>(null);

function createConnectors(walletConnectFactory?: WalletConnectProviderFactory): Record<ConnectorId, WalletConnector> {
  return {
    metamask: new MetaMaskConnector(),
    walletconnect: new WalletConnectConnector(walletConnectFactory),
    coinbase: new CoinbaseConnector(),
    stellar: new StellarConnector(),
  };
}

export interface MultiChainWalletProviderProps {
  children: ReactNode;
  /** See connectors/walletconnect.ts — required to actually enable WalletConnect. */
  walletConnectFactory?: WalletConnectProviderFactory;
  /** Override for tests / alternate RPC setups; defaults to `new TransactionManager(options)`. */
  createTransactionManager?: (options: ConstructorParameters<typeof TransactionManager>[0]) => TransactionManager;
}

export function MultiChainWalletProvider({
  children,
  walletConnectFactory,
  createTransactionManager = (options) => new TransactionManager(options),
}: MultiChainWalletProviderProps) {
  const connectors = useMemo(() => createConnectors(walletConnectFactory), [walletConnectFactory]);

  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<EvmChainId | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [connectorId, setConnectorId] = useState<ConnectorId | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, bumpTxVersion] = useState(0);

  const txManagerRef = useRef<TransactionManager | null>(null);
  const cleanupListenersRef = useRef<(() => void) | null>(null);

  const refreshBalance = useCallback(async (addr: string, cid: EvmChainId | null) => {
    if (!cid) {
      setBalance(null);
      return;
    }
    try {
      const client = createPublicClient({ chain: getEvmChain(cid), transport: http() });
      const wei = await client.getBalance({ address: addr as `0x${string}` });
      setBalance(formatEther(wei));
    } catch {
      setBalance(null);
    }
  }, []);

  const teardownTxManager = useCallback(() => {
    txManagerRef.current?.destroy();
    txManagerRef.current = null;
  }, []);

  const attachTxManager = useCallback((provider: NonNullable<ReturnType<WalletConnector["getProvider"]>>, cid: EvmChainId) => {
    teardownTxManager();
    const manager = createTransactionManager({ provider, chainId: cid });
    manager.on("update", () => bumpTxVersion((n) => n + 1));
    txManagerRef.current = manager;
  }, [createTransactionManager, teardownTxManager]);

  const disconnect = useCallback(() => {
    if (connectorId) connectors[connectorId].disconnect();
    cleanupListenersRef.current?.();
    cleanupListenersRef.current = null;
    teardownTxManager();
    setAccount(null);
    setChainId(null);
    setBalance(null);
    setConnectorId(null);
    setError(null);
  }, [connectorId, connectors, teardownTxManager]);

  const connect = useCallback(
    async (id: ConnectorId) => {
      const connector = connectors[id];
      if (!connector.isAvailable()) {
        const message = `${id} is not available in this browser.`;
        setError(message);
        throw new Error(message);
      }

      setIsConnecting(true);
      setError(null);
      try {
        const { account: acct, chainId: cid } = await connector.connect();
        setAccount(acct);
        setChainId(cid);
        setConnectorId(id);
        void refreshBalance(acct, cid);

        cleanupListenersRef.current?.();
        const unsubAccounts = connector.onAccountsChanged((accounts) => {
          const next = accounts[0] ?? null;
          if (!next) {
            disconnect();
            return;
          }
          setAccount(next);
          void refreshBalance(next, cid);
        });
        const unsubChain = connector.onChainChanged((newChainId) => {
          setChainId(newChainId);
          if (acct) void refreshBalance(acct, newChainId);
          const provider = connector.getProvider();
          if (provider) attachTxManager(provider, newChainId);
        });
        cleanupListenersRef.current = () => {
          unsubAccounts();
          unsubChain();
        };

        const evmProvider = connector.getProvider();
        if (evmProvider && cid) {
          attachTxManager(evmProvider, cid);
        } else {
          teardownTxManager();
        }
      } catch (err) {
        setError(mapWeb3Error(err));
        throw err;
      } finally {
        setIsConnecting(false);
      }
    },
    [attachTxManager, connectors, disconnect, refreshBalance, teardownTxManager]
  );

  const switchChain = useCallback(
    async (targetChainId: EvmChainId) => {
      if (!connectorId) throw new Error("No wallet connected");
      const connector = connectors[connectorId];
      await connector.switchChain(targetChainId);
      setChainId(targetChainId);
      if (account) void refreshBalance(account, targetChainId);
      const evmProvider = connector.getProvider();
      if (evmProvider) attachTxManager(evmProvider, targetChainId);
    },
    [account, attachTxManager, connectorId, connectors, refreshBalance]
  );

  const submitBatch = useCallback(
    async (calls: ContractCall[]) => {
      if (!account || !txManagerRef.current) {
        throw new Error("Connect an EVM wallet (MetaMask, WalletConnect, or Coinbase) before submitting a batch.");
      }
      return txManagerRef.current.submitBatch(account as `0x${string}`, calls);
    },
    [account]
  );

  const getTransaction = useCallback((id: string) => txManagerRef.current?.get(id), []);
  const transactions = txManagerRef.current?.list() ?? [];

  useEffect(
    () => () => {
      cleanupListenersRef.current?.();
      teardownTxManager();
    },
    [teardownTxManager]
  );

  const value: MultiChainWalletState = {
    account,
    chainId,
    balance,
    connectorId,
    isConnecting,
    error,
    connect,
    disconnect,
    switchChain,
    submitBatch,
    getTransaction,
    transactions,
  };

  return <MultiChainWalletContext.Provider value={value}>{children}</MultiChainWalletContext.Provider>;
}

export function useWallet(): MultiChainWalletState {
  const ctx = useContext(MultiChainWalletContext);
  if (!ctx) throw new Error("useWallet (multi-chain, src/web3) must be used within a MultiChainWalletProvider");
  return ctx;
}
