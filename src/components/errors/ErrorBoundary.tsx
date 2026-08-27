"use client";

/**
 * ErrorBoundary.tsx  (src/components/errors/)
 *
 * A React class-based error boundary that catches render-time exceptions,
 * runs them through decodeError(), and surfaces the translated message via
 * the ErrorToast component.
 *
 * For async / mutation errors (not caught by React's error boundary) use
 * the <ErrorToastPortal> helper exported from this file, or handle inside
 * your hook and render <ErrorToast> directly.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { decodeError, DecodedError, type TranslatedError } from "@/src/utils/errorDecoder";
import { ErrorToast } from "@/src/components/errors/ErrorToast";

// ─── ErrorBoundary ────────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  /**
   * Content to protect. Any render-time throw is caught and decoded.
   */
  children: ReactNode;

  /**
   * Optional custom fallback render prop. Receives the decoded translation
   * and a `reset` callback. When omitted, <ErrorToast> is rendered.
   */
  fallback?: (translated: TranslatedError, reset: () => void) => ReactNode;

  /**
   * Called after the error boundary resets so the parent can clear any
   * associated async state.
   */
  onReset?: () => void;

  /**
   * Called when an error is caught (useful for logging / observability).
   */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
  translated: TranslatedError | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null, translated: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // If the error is already decoded, use its translation directly
    const translated =
      error instanceof DecodedError ? error.translated : decodeError(error);
    return { error, translated };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (process.env.NODE_ENV === "development") {
      console.error("[ErrorBoundary] caught:", error, info);
    }
    this.props.onError?.(error, info);
  }

  reset = () => {
    this.setState({ error: null, translated: null });
    this.props.onReset?.();
  };

  render() {
    const { error, translated } = this.state;

    if (error && translated) {
      if (this.props.fallback) {
        return this.props.fallback(translated, this.reset);
      }

      return (
        <ErrorToast
          translated={translated}
          onRetry={this.reset}
          onDismiss={this.reset}
        />
      );
    }

    return this.props.children;
  }
}

// ─── Convenience wrapper ──────────────────────────────────────────────────────

/**
 * Wraps children in an ErrorBoundary that renders an ErrorToast on failure.
 * Accepts all ErrorBoundary props as a convenience shorthand.
 *
 * @example
 * <SorobanErrorBoundary onReset={() => refetch()}>
 *   <EscrowPanel />
 * </SorobanErrorBoundary>
 */
export function SorobanErrorBoundary({
  children,
  ...props
}: ErrorBoundaryProps) {
  return <ErrorBoundary {...props}>{children}</ErrorBoundary>;
}
