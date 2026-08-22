import React, { useState } from "react";
import { useWallet } from "@/src/hooks/useWallet";

export function WalletConnector() {
  const { status, connect, disconnect } = useWallet();
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setError(null);
    try {
      await connect();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || "Failed to connect");
      } else {
        setError("Failed to connect");
      }
    }
  };

  return (
    <div>
      <div>Wallet status: {status}</div>
      {error && <div role="alert">{error}</div>}
      {status === "disconnected" || status === "reconnecting" || status === "connecting" || status === "approving" || status === "signing" ? (
        <button onClick={handleConnect}>Connect wallet</button>
      ) : (
        <button onClick={disconnect}>Disconnect wallet</button>
      )}
    </div>
  );
}
