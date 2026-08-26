"use client";

/**
 * ErrorToast.tsx
 *
 * Displays a translated Stellar/Soroban/Freighter error as an accessible
 * alert with severity-appropriate colour coding, a user-friendly action hint,
 * and an optional "Copy error details" button for unrecognised errors.
 */

import { useState, useCallback } from "react";
import type { TranslatedError, ErrorSeverity } from "@/src/utils/errorDecoder";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ErrorToastProps {
  /** The translated error to display. */
  translated: TranslatedError;
  /** Optional retry callback. When provided a "Retry" button is rendered. */
  onRetry?: () => void;
  /** Optional dismiss callback. When provided a close (×) button is rendered. */
  onDismiss?: () => void;
  /** Additional Tailwind class names to merge onto the root element. */
  className?: string;
}

// ─── Severity config ─────────────────────────────────────────────────────────

interface SeverityConfig {
  container: string;
  icon: string;
  iconLabel: string;
  retryButton: string;
}

const severityConfig: Record<ErrorSeverity, SeverityConfig> = {
  info: {
    container:
      "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-100",
    icon: "ℹ",
    iconLabel: "Info",
    retryButton:
      "bg-blue-600 hover:bg-blue-700 focus-visible:outline-blue-600 text-white",
  },
  warning: {
    container:
      "border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-800/60 dark:bg-yellow-950/40 dark:text-yellow-100",
    icon: "⚠",
    iconLabel: "Warning",
    retryButton:
      "bg-yellow-600 hover:bg-yellow-700 focus-visible:outline-yellow-600 text-white",
  },
  error: {
    container:
      "border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100",
    icon: "✕",
    iconLabel: "Error",
    retryButton:
      "bg-red-600 hover:bg-red-700 focus-visible:outline-red-600 text-white",
  },
  critical: {
    container:
      "border-red-400 bg-red-100 text-red-950 dark:border-red-700/80 dark:bg-red-950/60 dark:text-red-50",
    icon: "⚡",
    iconLabel: "Critical",
    retryButton:
      "bg-red-700 hover:bg-red-800 focus-visible:outline-red-700 text-white",
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ErrorToast({
  translated,
  onRetry,
  onDismiss,
  className = "",
}: ErrorToastProps) {
  const { title, description, action, severity, raw } = translated;
  const config = severityConfig[severity];

  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const text = raw ?? `${title}\n${description}\n${action}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select a hidden textarea
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [raw, title, description, action]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className={[
        "relative rounded-xl border p-4",
        config.container,
        className,
      ].join(" ")}
    >
      {/* Dismiss button */}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="absolute right-3 top-3 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          ×
        </button>
      )}

      <div className="flex items-start gap-3">
        {/* Severity icon */}
        <span
          aria-label={config.iconLabel}
          className="mt-0.5 flex-shrink-0 text-base leading-none"
        >
          {config.icon}
        </span>

        <div className="flex-1 min-w-0">
          {/* Title */}
          <h2 className="text-sm font-semibold leading-tight">{title}</h2>

          {/* Description */}
          <p className="mt-1 text-sm opacity-80 leading-snug">{description}</p>

          {/* Action hint */}
          {action && (
            <p className="mt-1.5 text-xs font-medium opacity-70">{action}</p>
          )}

          {/* Action row */}
          <div className="mt-3 flex flex-wrap gap-2">
            {/* Retry */}
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className={[
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                  config.retryButton,
                ].join(" ")}
              >
                Retry
              </button>
            )}

            {/* Copy error details — always shown when there's raw data or severity is error/critical */}
            {(raw != null || severity === "error" || severity === "critical") && (
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-lg border border-current px-3 py-1.5 text-xs font-semibold opacity-70 transition-opacity hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {copied ? "Copied!" : "Copy error details"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
