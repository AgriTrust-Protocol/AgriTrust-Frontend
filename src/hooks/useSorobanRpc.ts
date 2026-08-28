"use client";

/**
 * useSorobanRpc (issue #171)
 *
 * Thin React wrapper around the shared `SorobanRpcClient`. Components call
 * `request`/`write`/`read`/`analytics` to issue calls through the rate
 * limiter, and read `rateLimited` / `retryCount` / `currentEndpoint` /
 * `queueDepth` to reflect live middleware state in the UI (see
 * RpcEndpointIndicator in the dashboard header).
 *
 * State is polled rather than pushed from the client: the limiter's queue
 * changes many times per second under load, and a 250ms poll is more than
 * enough for a status indicator while avoiding a bespoke pub/sub layer
 * inside the rate limiter itself.
 */

import { useCallback, useEffect, useState } from "react";
import { getSorobanRpcClient } from "@/src/services/rpc/client";
import { Priority, type RpcClientState, type RpcRequestInit } from "@/src/types/rpc";

const POLL_INTERVAL_MS = 250;

export interface UseSorobanRpcResult extends RpcClientState {
  request: <T>(request: RpcRequestInit, priority?: Priority) => Promise<T>;
  write: <T>(request: RpcRequestInit) => Promise<T>;
  read: <T>(request: RpcRequestInit) => Promise<T>;
  analytics: <T>(request: RpcRequestInit) => Promise<T>;
}

export function useSorobanRpc(): UseSorobanRpcResult {
  const client = getSorobanRpcClient();
  const [state, setState] = useState<RpcClientState>(() => client.getState());

  useEffect(() => {
    const interval = setInterval(() => setState(client.getState()), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [client]);

  const request = useCallback(
    <T,>(req: RpcRequestInit, priority?: Priority) => client.request<T>(req, priority),
    [client]
  );
  const write = useCallback(<T,>(req: RpcRequestInit) => client.write<T>(req), [client]);
  const read = useCallback(<T,>(req: RpcRequestInit) => client.read<T>(req), [client]);
  const analytics = useCallback(<T,>(req: RpcRequestInit) => client.analytics<T>(req), [client]);

  return { ...state, request, write, read, analytics };
}
