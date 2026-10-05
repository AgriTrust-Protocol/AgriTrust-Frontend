"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Fingerprint,
  Leaf,
  Loader2,
  LogOut,
  Radio,
  Wallet,
  WalletCards,
} from "lucide-react";

import { ACTIVE_IDENTITY } from "@/lib/protocolState";
import { shortHash } from "@/lib/format";
import type { WalletSession, WalletStatus } from "@/lib/wallet";
import { connectWallet, restoreSession } from "@/lib/wallet";

interface NavbarProps {
  /** Populated by the wallet session store in the page shell. */
  readonly session: WalletSession | null;
  readonly onSessionChange: (session: WalletSession | null) => void;
}

/**
 * Protocol branding, decentralized identifier badge and Web3 wallet connector.
 *
 * The DID badge always reflects the identity the operator has authorised. Until
 * a wallet is connected it shows the sovereign originator DID the portal is
 * impersonating for the demo, which is labelled as such rather than presented
 * as an authenticated session.
 */
export default function Navbar({ session, onSessionChange }: NavbarProps) {
  const [status, setStatus] = useState<WalletStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Re-establish an existing wallet session on mount without prompting.
  useEffect(() => {
    let cancelled = false;

    void restoreSession().then((restored) => {
      if (cancelled) return;
      if (restored !== null) {
        onSessionChange(restored);
        setStatus("connected");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [onSessionChange]);

  const handleConnect = useCallback(async () => {
    setStatus("connecting");
    setError(null);

    try {
      const connected = await connectWallet();
      onSessionChange(connected);
      setStatus("connected");
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Could not reach the wallet.";
      setStatus(message.includes("not detected") ? "unsupported" : "error");
      setError(message);
      setMenuOpen(false);
    }
  }, [onSessionChange]);

  const handleDisconnect = useCallback(() => {
    // Freighter holds no server-side session to tear down; the portal simply
    // drops the authorisation it was acting under.
    onSessionChange(null);
    setStatus("disconnected");
    setMenuOpen(false);
  }, [onSessionChange]);

  const isConnected = status === "connected" && session !== null;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface-0/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-3 sm:px-6">
        {/* Protocol branding */}
        <div className="flex items-center gap-3">
          <span className="relative grid size-9 place-items-center rounded-lg border border-leaf/40 bg-leaf/10">
            <Leaf className="size-5 text-leaf" aria-hidden="true" />
            <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-leaf" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight text-ink">
              AgriTrust<span className="text-leaf"> Protocol</span>
            </p>
            <p className="hidden text-[11px] text-ink-faint sm:block">
              Farmer sovereignty · verifiable provenance
            </p>
          </div>
        </div>

        <span className="mx-1 hidden h-8 w-px bg-line sm:block" aria-hidden="true" />

        {/* Network + DID badge */}
        <div className="hidden items-center gap-2 md:flex">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink-muted">
            <Radio className="size-3 text-sky" aria-hidden="true" />
            Soroban · testnet
          </span>

          <span
            className="group inline-flex items-center gap-1.5 rounded-full border border-violet/35 bg-violet/10 px-2.5 py-1 font-mono text-[11px] text-violet"
            title={isConnected ? session.address : ACTIVE_IDENTITY.did}
          >
            <Fingerprint className="size-3" aria-hidden="true" />
            <span className="max-w-[13rem] truncate">
              {isConnected
                ? `did:pkh:${shortHash(session.address, 8, 6)}`
                : ACTIVE_IDENTITY.did}
            </span>
            {!isConnected && (
              <span className="hidden text-ink-faint lg:inline">(impersonated)</span>
            )}
          </span>
        </div>

        <div className="flex-1" />

        {/* Wallet connector */}
        <div className="relative">
          {isConnected ? (
            <>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-surface-3"
              >
                <span className="grid size-5 place-items-center rounded-full bg-leaf/15 text-leaf">
                  <Check className="size-3" aria-hidden="true" />
                </span>
                <span className="font-mono">
                  {shortHash(session.address, 5, 5)}
                </span>
                <ChevronDown className="size-3.5 text-ink-faint" aria-hidden="true" />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-line bg-surface-2 p-3 shadow-2xl shadow-black/60"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                    Authorised identity
                  </p>
                  <p className="mt-1 break-all font-mono text-[11px] text-ink">
                    {session.address}
                  </p>
                  <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-[11px]">
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-faint">Network</dt>
                      <dd className="text-ink-muted">{session.network}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-faint">Role</dt>
                      <dd className="text-ink-muted">{ACTIVE_IDENTITY.role}</dd>
                    </div>
                  </dl>

                  {session.address !== ACTIVE_IDENTITY.address && (
                    <p className="mt-3 flex gap-2 rounded-lg border border-clay/35 bg-clay/10 p-2 text-[11px] text-clay">
                      <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                      Connected address is not the sovereign originator of this batch, so
                      grant and revoke will be rejected as unauthorized.
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-line-strong px-3 py-2 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
                  >
                    <LogOut className="size-3.5" aria-hidden="true" />
                    Disconnect
                  </button>
                </div>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={handleConnect}
              disabled={status === "connecting"}
              className="inline-flex items-center gap-2 rounded-lg border border-leaf/45 bg-leaf/12 px-3.5 py-2 text-xs font-semibold text-leaf transition-colors hover:bg-leaf/20 disabled:cursor-wait disabled:opacity-70"
            >
              {status === "connecting" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : status === "unsupported" ? (
                <WalletCards className="size-4" aria-hidden="true" />
              ) : (
                <Wallet className="size-4" aria-hidden="true" />
              )}
              {status === "connecting"
                ? "Connecting…"
                : status === "unsupported"
                  ? "Wallet not found"
                  : "Connect Wallet"}
            </button>
          )}
        </div>
      </div>

      {error !== null && (
        <p
          role="status"
          className="border-t border-clay/25 bg-clay/8 px-4 py-2 text-center text-[11px] text-clay sm:px-6"
        >
          {error}
        </p>
      )}
    </header>
  );
}