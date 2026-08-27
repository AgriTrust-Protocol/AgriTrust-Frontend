// src/components/notifications/TxRecoveryBanner.tsx
import React, { useState } from "react";
import type { RecoveredTx } from "../../hooks/useTxRetryQueue";
import "./TxRecoveryBanner.css";

interface TxRecoveryBannerProps {
  recovered: RecoveredTx[];
  onRetry: (operationId: string) => void;
  onDismiss: (operationId: string) => void;
  onDismissAll: () => void;
}

const STATUS_LABEL: Record<RecoveredTx["status"], string> = {
  preparing: "Preparing",
  broadcasting: "Broadcasting",
  pending_confirmation: "Pending confirmation",
  confirmed: "Confirmed",
  failed: "Failed",
  unknown: "Unknown — recheck",
};

export default function TxRecoveryBanner({
  recovered,
  onRetry,
  onDismiss,
  onDismissAll,
}: TxRecoveryBannerProps) {
  const [expanded, setExpanded] = useState(false);

  if (recovered.length === 0) return null;

  return (
    <div className="tx-recovery-banner" role="status" aria-live="polite">
      <div className="tx-recovery-banner__summary">
        <span>
          {recovered.length} pending transaction{recovered.length === 1 ? "" : "s"} recovered
        </span>
        <div className="tx-recovery-banner__actions">
          <button
            type="button"
            className="tx-recovery-banner__link"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Hide" : "Review"}
          </button>
          <button
            type="button"
            className="tx-recovery-banner__link"
            onClick={onDismissAll}
          >
            Dismiss
          </button>
        </div>
      </div>

      {expanded && (
        <ul className="tx-recovery-banner__list">
          {recovered.map((tx) => (
            <li key={tx.operationId} className="tx-recovery-banner__item">
              <div className="tx-recovery-banner__item-main">
                <span className={`tx-recovery-banner__status is-${tx.status}`}>
                  {STATUS_LABEL[tx.status]}
                  {tx.timedOut ? " (check timed out)" : ""}
                </span>
                <span className="tx-recovery-banner__meta">
                  {tx.metadata.market ? `${tx.metadata.market} · ` : ""}
                  {tx.metadata.amount ?? ""}
                </span>
                {tx.txHash && (
                  <span className="tx-recovery-banner__hash" title={tx.txHash}>
                    {tx.txHash.slice(0, 8)}…{tx.txHash.slice(-6)}
                  </span>
                )}
              </div>
              <div className="tx-recovery-banner__item-actions">
                {(tx.status === "failed" || tx.status === "unknown") && (
                  <button
                    type="button"
                    className="tx-recovery-banner__retry"
                    onClick={() => onRetry(tx.operationId)}
                  >
                    Retry
                  </button>
                )}
                <button
                  type="button"
                  className="tx-recovery-banner__link"
                  onClick={() => onDismiss(tx.operationId)}
                >
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
