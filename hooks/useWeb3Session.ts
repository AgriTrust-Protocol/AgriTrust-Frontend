import { useState, useEffect, useCallback, useRef } from "react";
import {
  sessionMonitor,
  SESSION_EXPIRED,
  ACCOUNT_CHANGED,
  type WalletProvider,
} from "@/services/sessionMonitor";
import { queryClient } from "@/lib/queryClient";
import {
  authApi,
  setAccessToken,
  getAccessToken,
  type SessionResponse,
} from "@/lib/apiClient";

// ─── Auth status types ───────────────────────────────────────────────

export type AuthStatus =
  | "idle"
  | "challenge_pending"
  | "signing"
  | "verifying"
  | "authenticated"
  | "expired"
  | "error";

export interface AuthUser {
  address: string;
  provider: string;
}

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  error: string | null;
}

// ─── Hook options ────────────────────────────────────────────────────

interface UseWeb3SessionOptions {
  account: string | null;
  provider: WalletProvider;
  onSessionExpired?: () => void;
  onAccountChanged?: (newAccount: string) => void;
}

// ─── Hook return type ────────────────────────────────────────────────

export interface UseWeb3SessionReturn {
  /** Current authentication status */
  status: AuthStatus;
  /** Authenticated user info (null when not authenticated) */
  user: AuthUser | null;
  /** Error message when status is 'error' */
  error: string | null;
  /** Start the challenge-signing login flow */
  login: (address: string, providerType: WalletProvider) => Promise<void>;
  /** Log out and clear session */
  logout: () => Promise<void>;
  /** Manually refresh the access token */
  refresh: () => Promise<boolean>;
  /** Session monitor status (backward-compatible) */
  monitorStatus: {
    isRunning: boolean;
    lastKnownAccount: string | null;
    consecutiveFailures: number;
  };
}

// ─── Wallet signing helpers ──────────────────────────────────────────

async function signMessageWithWallet(
  nonce: string,
  address: string,
  providerType: WalletProvider
): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("Cannot sign outside of browser environment");
  }

  switch (providerType) {
    case "freighter": {
      if (!window.freighter) {
        throw new Error("Freighter wallet not found");
      }
      // Freighter uses Stellar's SEP-7 style signing for Ed25519
      const result = await window.freighter.signMessage(nonce);
      // Freighter returns { signedMessage: "base64-encoded-signature" }
      if (typeof result === "object" && result !== null && "signedMessage" in result) {
        return (result as { signedMessage: string }).signedMessage;
      }
      return String(result);
    }
    case "metamask":
    case "walletconnect": {
      if (!window.ethereum) {
        throw new Error("Ethereum provider not found");
      }
      // EIP-191 personal_sign
      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [nonce, address],
      });
      return signature as string;
    }
    default:
      throw new Error(`Unsupported wallet provider: ${providerType}`);
  }
}

// ─── Session ping interval ───────────────────────────────────────────

const SESSION_PING_INTERVAL_MS = 60_000; // 60 seconds per spec

// ─── The hook ────────────────────────────────────────────────────────

export function useWeb3Session({
  account,
  provider,
  onSessionExpired,
  onAccountChanged,
}: UseWeb3SessionOptions): UseWeb3SessionReturn {
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlersRegistered = useRef(false);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLoginInProgress = useRef(false);
  const handleSessionCleanupRef = useRef<() => void>(() => {});

  const stopPingLoop = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  const startPingLoop = useCallback(() => {
    stopPingLoop();
    pingIntervalRef.current = setInterval(async () => {
      try {
        await authApi.ping();
      } catch (err) {
        const apiErr = err as { status?: number };
        if (apiErr.status === 401) {
          setStatus("expired");
          stopPingLoop();
          // Use ref to always get the latest handleSessionCleanup
          handleSessionCleanupRef.current();
        }
      }
    }, SESSION_PING_INTERVAL_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopPingLoop]);

  // ── Mount: check for existing session ──────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function checkExistingSession(): Promise<void> {
      try {
        const session = await authApi.getSession();
        if (cancelled) return;

        if (session.user) {
          setUser({
            address: session.user.address,
            provider: session.user.provider,
          });
          setStatus("authenticated");
          // Start ping loop to keep session alive / detect expiry
          startPingLoop();
        } else {
          // No existing session cookie — stay idle
          setStatus("idle");
        }
      } catch {
        if (!cancelled) {
          setStatus("idle");
        }
      }
    }

    checkExistingSession();

    return () => {
      cancelled = true;
    };
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  // ── login() — challenge-signing flow ───────────────────────────────

  const login = useCallback(
    async (address: string, providerType: WalletProvider): Promise<void> => {
      if (isLoginInProgress.current) return;
      isLoginInProgress.current = true;

      try {
        setError(null);
        setStatus("challenge_pending");

        // Step 1: Request a challenge nonce from the backend
        const { nonce, nonce_id } = await authApi.getChallenge(address);

        // Step 2: Prompt wallet to sign the nonce
        setStatus("signing");
        const signature = await signMessageWithWallet(
          nonce,
          address,
          providerType
        );

        // Step 3: Verify the signature with the backend
        setStatus("verifying");
        const { token, user: authUser } = await authApi.verify(
          nonce_id,
          signature,
          address
        );

        // Step 4: Store the token and update state
        setAccessToken(token);
        setUser({
          address: authUser.address,
          provider: authUser.provider,
        });
        setStatus("authenticated");

        // Start the session ping loop
        startPingLoop();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Authentication failed";
        setError(message);
        setStatus("error");
      } finally {
        isLoginInProgress.current = false;
      }
    },
    [startPingLoop]
  );

  // ── refresh() — manually refresh the access token ──────────────────

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const { token } = await authApi.refresh();
      setAccessToken(token);
      return true;
    } catch {
      setStatus("expired");
      setAccessToken(null);
      return false;
    }
  }, []);

  // ── logout() — clear session server-side and locally ───────────────

  const logout = useCallback(async (): Promise<void> => {
    try {
      await authApi.logout();
    } catch {
      // Logout failed on server — still clear local state
    }

    setAccessToken(null);
    setUser(null);
    setError(null);
    setStatus("idle");
    stopPingLoop();
    queryClient.clear();
  }, [stopPingLoop]);

  // ── Session cleanup helper ─────────────────────────────────────────

  const handleSessionCleanup = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    stopPingLoop();
    queryClient.clear();

    // Clear localStorage
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.clear();
    }

    // Call custom handler if provided
    if (onSessionExpired) {
      onSessionExpired();
    } else {
      // Default: redirect to login
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }

    // Optionally call server logout
    if (typeof window !== "undefined") {
      fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "include",
      }).catch(() => {
        // Silently fail — best effort
      });
    }
  }, [onSessionExpired, stopPingLoop]);

  // Keep ref updated so stale closures (e.g. setInterval) get the latest version
  useEffect(() => {
    handleSessionCleanupRef.current = handleSessionCleanup;
  }, [handleSessionCleanup]);

  // ── Event handlers (session expiry, account change) ────────────────

  const handleSessionExpired = useCallback(() => {
    setStatus("expired");
    handleSessionCleanup();
  }, [handleSessionCleanup]);

  const handleAccountChanged = useCallback(
    (newAccount: string) => {
      if (onAccountChanged) {
        onAccountChanged(newAccount);
      }
    },
    [onAccountChanged]
  );

  // ── Register session monitor event handlers ────────────────────────

  useEffect(() => {
    if (!handlersRegistered.current) {
      sessionMonitor.on(SESSION_EXPIRED, handleSessionExpired);
      sessionMonitor.on(ACCOUNT_CHANGED, handleAccountChanged);
      handlersRegistered.current = true;
    }

    return () => {
      if (handlersRegistered.current) {
        sessionMonitor.off(SESSION_EXPIRED, handleSessionExpired);
        sessionMonitor.off(ACCOUNT_CHANGED, handleAccountChanged);
        handlersRegistered.current = false;
      }
    };
  }, [handleSessionExpired, handleAccountChanged]);

  // ── Start/stop session monitoring based on account and provider ────

  useEffect(() => {
    if (account && provider) {
      sessionMonitor.start(provider, account);
    } else {
      sessionMonitor.stop();
    }

    return () => {
      sessionMonitor.stop();
    };
  }, [account, provider]);

  // ── Return ─────────────────────────────────────────────────────────

  return {
    status,
    user,
    error,
    login,
    logout,
    refresh,
    monitorStatus: sessionMonitor.getStatus(),
  };
}
