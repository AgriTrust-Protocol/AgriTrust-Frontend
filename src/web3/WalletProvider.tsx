"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { POLYGON_CHAIN_ID, SOROBAN_CHAIN_ID } from "./chains";
import { createCoinbaseWalletConnector } from "./connectors/coinbase";
import { createMetaMaskConnector } from "./connectors/metamask";
import { createWalletConnectConnector } from "./connectors/walletconnect";
import type { Eip1193Provider, SupportedChainId, WalletConnector, WalletId, WalletSession } from "./types";

const SESSION_KEY = "agritrust.wallet.session";

type WalletStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

interface WalletContextValue {
  account: string | null;
  chainId: SupportedChainId | null;
  balance: string | null;
  status: WalletStatus;
  connector: WalletId | null;
  connect(walletId?: WalletId): Promise<void>;
  disconnect(): Promise<void>;
  switchChain(chainId: SupportedChainId): Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

function ethereum(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return (window as typeof window & { ethereum?: Eip1193Provider }).ethereum ?? null;
}

function createConnector(walletId: WalletId): WalletConnector {
  const provider = ethereum();
  if (walletId === "metamask") return createMetaMaskConnector(provider);
  if (!provider) throw new Error(`${walletId} provider is not available`);
  if (walletId === "walletconnect") return createWalletConnectConnector(provider);
  if (walletId === "coinbase") return createCoinbaseWalletConnector(provider);
  return {
    id: "soroban",
    name: "Stellar Soroban",
    getProvider: () => provider,
    async connect() {
      const account = await provider.request<string>({ method: "soroban_requestAccounts" });
      return account;
    },
    async switchChain(chainId: SupportedChainId) {
      if (chainId !== SOROBAN_CHAIN_ID) throw new Error("Soroban connector only supports Stellar Soroban");
    },
  };
}

async function getChainId(provider: Eip1193Provider | null): Promise<SupportedChainId> {
  if (!provider) return POLYGON_CHAIN_ID;
  const hex = await provider.request<string>({ method: "eth_chainId" }).catch(() => null);
  return hex ? (Number(BigInt(hex)) as SupportedChainId) : POLYGON_CHAIN_ID;
}

async function getBalance(provider: Eip1193Provider | null, account: string | null): Promise<string | null> {
  if (!provider || !account) return null;
  return provider.request<string>({ method: "eth_getBalance", params: [account, "latest"] }).catch(() => null);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<SupportedChainId | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [status, setStatus] = useState<WalletStatus>("disconnected");
  const [connector, setConnector] = useState<WalletId | null>(null);

  const persist = useCallback((session: WalletSession | null) => {
    if (typeof window === "undefined") return;
    if (!session) window.localStorage.removeItem(SESSION_KEY);
    else window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }, []);

  const connect = useCallback(async (walletId: WalletId = "metamask") => {
    setStatus("connecting");
    const next = createConnector(walletId);
    const nextAccount = await next.connect();
    const provider = next.getProvider() as Eip1193Provider | null;
    const nextChainId = walletId === "soroban" ? "stellar-soroban" : await getChainId(provider);
    setAccount(nextAccount);
    setChainId(nextChainId);
    setBalance(await getBalance(provider, nextAccount));
    setConnector(walletId);
    setStatus("connected");
    persist({ walletId, account: nextAccount, chainId: nextChainId });
  }, [persist]);

  const disconnect = useCallback(async () => {
    if (connector) await createConnector(connector).disconnect?.();
    setAccount(null); setChainId(null); setBalance(null); setConnector(null); setStatus("disconnected"); persist(null);
  }, [connector, persist]);

  const switchChain = useCallback(async (nextChainId: SupportedChainId) => {
    if (!connector) throw new Error("Connect a wallet before switching chains");
    const wallet = createConnector(connector);
    await wallet.switchChain(nextChainId);
    setChainId(nextChainId);
    if (account) persist({ walletId: connector, account, chainId: nextChainId });
  }, [account, connector, persist]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const session = JSON.parse(raw) as WalletSession;
    setStatus("reconnecting");
    void connect(session.walletId).catch(() => { persist(null); setStatus("disconnected"); });
  }, [connect, persist]);


  useEffect(() => {
    const provider = ethereum();
    if (!provider?.on) return;
    const handleAccounts = (accounts: unknown) => {
      const nextAccount = Array.isArray(accounts) ? String(accounts[0] ?? "") || null : null;
      setAccount(nextAccount);
      if (!nextAccount) {
        persist(null);
        setStatus("disconnected");
      } else if (connector && chainId) {
        persist({ walletId: connector, account: nextAccount, chainId });
      }
    };
    const handleChain = (next: unknown) => {
      const nextChainId = typeof next === "string" ? (Number(BigInt(next)) as SupportedChainId) : null;
      if (nextChainId) setChainId(nextChainId);
    };
    provider.on("accountsChanged", handleAccounts);
    provider.on("chainChanged", handleChain);
    provider.on("connect", () => void getChainId(provider).then(setChainId));
    provider.on("disconnect", () => void disconnect());
    return () => {
      provider.removeListener?.("accountsChanged", handleAccounts);
      provider.removeListener?.("chainChanged", handleChain);
    };
  }, [chainId, connector, disconnect, persist]);

  const value = useMemo(() => ({ account, chainId, balance, status, connector, connect, disconnect, switchChain }), [account, chainId, balance, status, connector, connect, disconnect, switchChain]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used within WalletProvider");
  return value;
}
