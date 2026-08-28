"use client";

/**
 * RpcEndpointIndicator (issue #171)
 *
 * Small dashboard-header status chip surfacing the RPC middleware's live
 * state: which endpoint is currently active, how deep the request queue
 * is, and whether we're presently rate-limited/retrying. Polls via
 * useSorobanRpc (see that hook for why polling vs. push).
 */

import { useSorobanRpc } from "@/src/hooks/useSorobanRpc";

function shortEndpoint(url: string | null): string {
  if (!url) return "—";
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function RpcEndpointIndicator() {
  const { currentEndpoint, queueDepth, rateLimited, retryCount } = useSorobanRpc();

  const dotClass = rateLimited
    ? "bg-amber-500"
    : currentEndpoint
      ? "bg-emerald-500"
      : "bg-zinc-400";

  const label = rateLimited ? "Throttled" : currentEndpoint ? "Connected" : "Idle";

  return (
    <div
      className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400"
      title={`RPC endpoint: ${currentEndpoint ?? "none"} · Queue depth: ${queueDepth} · Retries: ${retryCount}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
      <span className="font-medium">{label}</span>
      <span className="text-zinc-400 dark:text-zinc-600">·</span>
      <span className="font-mono">{shortEndpoint(currentEndpoint)}</span>
      {queueDepth > 0 && (
        <>
          <span className="text-zinc-400 dark:text-zinc-600">·</span>
          <span data-testid="rpc-queue-depth">queue {queueDepth}</span>
        </>
      )}
    </div>
  );
}
