"use client";

/**
 * Yield Dashboard — main page component that composes:
 *  - KpiGrid: farm-level KPI metrics with sparklines
 *  - PriceFeedCard grid: real-time crop price cards
 *  - PriceChart: interactive OHLC candlestick chart
 *  - Alert configuration modal
 *  - Connection state indicator
 *
 * Orchestrates usePriceFeed (WebSocket) and useAlertConfig hooks.
 * Data flows through the signal-based priceFeedStore for reactivity.
 */

import { useState, useCallback, useMemo } from "react";
import { PriceFeedCard } from "@/src/components/dashboard/PriceFeedCard";
import { PriceChart } from "@/src/components/dashboard/PriceChart";
import { KpiGrid } from "@/src/components/dashboard/KpiGrid";
import { usePriceFeed } from "@/src/hooks/usePriceFeed";
import { useAlertConfig } from "@/src/hooks/useAlertConfig";
import { useOnlineStatus } from "@/src/hooks/useOnlineStatus";
import { useSignal } from "@/src/hooks/useSignal";
import { defaultPriceFeedStore } from "@/src/stores/priceFeedStore";
import { InternationalizedText } from "@/src/components/common/InternationalizedText";


export function YieldDashboard() {
  const isOnline = useOnlineStatus();
  const {
    priceMap,
    connectionState,
    selectedPair,
    chartRange,
    ohlcData,
    selectPair,
    setChartRange,
    reconnect,
  } = usePriceFeed();

  const {
    alerts,
    addAlert,
    removeAlert,
    toggleAlert,
    setBrowserNotificationsEnabled,
    requestNotificationPermission,
  } = useAlertConfig();

  const kpis = useSignal(defaultPriceFeedStore.kpis$);
  const dataFreshness = useSignal(defaultPriceFeedStore.dataFreshness$);

  const [showAlertModal, setShowAlertModal] = useState(false);
  const [newAlertPair, setNewAlertPair] = useState("");
  const [newAlertDirection, setNewAlertDirection] = useState<"above" | "below">("below");
  const [newAlertThreshold, setNewAlertThreshold] = useState("");
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermission>(
    () =>
      typeof window !== "undefined" && "Notification" in window
        ? Notification.permission
        : "default",
  );

  // ── Derived data ───────────────────────────────────────────────────────

  const pairs = useMemo(() => Object.keys(priceMap), [priceMap]);
  const selectedTick = selectedPair ? priceMap[selectedPair] ?? null : null;
  const selectedBars = selectedPair ? (ohlcData[selectedPair] ?? []) : [];

  // ── Alert modal handlers ───────────────────────────────────────────────

  const handleAddAlert = useCallback(() => {
    if (!newAlertPair || !newAlertThreshold) return;
    addAlert({
      pair: newAlertPair,
      threshold: newAlertThreshold,
      direction: newAlertDirection,
      enabled: true,
    });
    setNewAlertPair("");
    setNewAlertThreshold("");
    setShowAlertModal(false);
  }, [newAlertPair, newAlertThreshold, newAlertDirection, addAlert]);

  const handleRequestNotifications = useCallback(async () => {
    const result = await requestNotificationPermission();
    setNotificationStatus(result);
    if (result === "granted") {
      setBrowserNotificationsEnabled(true);
    }
  }, [requestNotificationPermission, setBrowserNotificationsEnabled]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            <InternationalizedText id="dashboard.yield.title" />
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            <InternationalizedText id="dashboard.yield.subtitle" />
          </p>
        </div>

        {/* Connection status + actions */}
        <div className="flex items-center gap-3">
          {/* Connection indicator */}
          <div className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs dark:border-zinc-700">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                connectionState === "connected"
                  ? "bg-emerald-500"
                  : connectionState === "connecting" || connectionState === "reconnecting"
                    ? "bg-amber-500 animate-pulse"
                    : "bg-red-500"
              }`}
            />
            <span className="text-zinc-500 dark:text-zinc-400">
              {connectionState === "connected"
                ? "Live"
                : connectionState === "connecting"
                  ? "Connecting..."
                  : connectionState === "reconnecting"
                    ? "Reconnecting..."
                    : "Disconnected"}
            </span>
          </div>

          {/* Offline indicator */}
          {!isOnline && (
            <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              Offline — cached data
            </span>
          )}

          {/* Reconnect button */}
          {connectionState !== "connected" && (
            <button
              onClick={reconnect}
              className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              Retry
            </button>
          )}

          {/* Alert button */}
          <button
            onClick={() => setShowAlertModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 2a5 5 0 00-5 5v3l-1 2h12l-1-2V7a5 5 0 00-5-5z"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M9 13a1 1 0 01-2 0"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            Alerts
            {alerts.filter((a) => a.enabled).length > 0 && (
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
                {alerts.filter((a) => a.enabled).length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <KpiGrid kpis={kpis} />

      {/* Price Feed Cards Grid */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-zinc-500 dark:text-zinc-400">
          <InternationalizedText id="dashboard.yield.livePrices" />
        </h2>
        {pairs.length === 0 ? (
          <div className="flex items-center justify-center rounded-xl border border-zinc-200 p-12 dark:border-zinc-800">
            <div className="text-center">
              <svg
                className="mx-auto mb-3 h-8 w-8 text-zinc-300 dark:text-zinc-600 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeDasharray="31.4 31.4"
                  strokeLinecap="round"
                />
              </svg>
              <p className="text-sm text-zinc-400 dark:text-zinc-500">
                <InternationalizedText id="dashboard.yield.loading" />
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pairs.map((pair) => {
              const tick = priceMap[pair];
              if (!tick) return null;
              return (
                <PriceFeedCard
                  key={pair}
                  tick={tick}
                  isSelected={selectedPair === pair}
                  onSelect={selectPair}
                  freshness={dataFreshness[pair]}
                  ohlcBars={ohlcData[pair]}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Price Chart */}
      <PriceChart
        bars={selectedBars}
        range={chartRange}
        onRangeChange={setChartRange}
        pairLabel={
          selectedTick
            ? `${selectedTick.crop} (${selectedTick.pair})`
            : undefined
        }
      />

      {/* TODO: Insurance Policy Status section (#82)
          Display active policy coverage, premium due dates, and claim status
          per crop pair. Requires /api/insurance/policies endpoint. */}

      {/* TODO: Pending Settlement Amounts section (#82)
          Show pending oracle-based settlement amounts for completed
          crop cycles. Requires /api/settlements/pending endpoint. */}

      {/* TODO: Email notification integration (#82)
          Send email alerts when price thresholds are breached.
          Requires email service integration (e.g., SendGrid, SES).
          Hook into useAlertConfig.emailNotificationsEnabled. */}

      {/* Active Alerts list */}
      {alerts.length > 0 && (
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Active Alerts
            </h3>
            {notificationStatus !== "granted" && (
              <button
                onClick={handleRequestNotifications}
                className="text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                Enable notifications
              </button>
            )}
          </div>
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex items-center justify-between rounded-lg border p-3 text-xs transition-colors ${
                  alert.triggered
                    ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20"
                    : "border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Toggle */}
                  <button
                    onClick={() => toggleAlert(alert.id)}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      alert.enabled
                        ? "bg-emerald-500"
                        : "bg-zinc-300 dark:bg-zinc-600"
                    }`}
                    role="switch"
                    aria-checked={alert.enabled}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                        alert.enabled ? "translate-x-[18px]" : "translate-x-[3px]"
                      }`}
                    />
                  </button>

                  <div>
                    <p className="font-medium text-zinc-700 dark:text-zinc-300">
                      {alert.pair}{" "}
                      <span className="font-normal text-zinc-400">
                        {alert.direction}
                      </span>{" "}
                      ${parseFloat(alert.threshold).toFixed(2)}
                    </p>
                    {alert.lastTriggeredAt && (
                      <p className="text-zinc-400 dark:text-zinc-500">
                        Triggered{" "}
                        {new Date(alert.lastTriggeredAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => removeAlert(alert.id)}
                  className="text-zinc-400 hover:text-red-500 transition-colors"
                  aria-label="Remove alert"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M4 4l6 6M10 4l-6 6"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alert Configuration Modal */}
      {showAlertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
            role="dialog"
            aria-modal="true"
            aria-labelledby="alert-modal-title"
          >
            <h3
              id="alert-modal-title"
              className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100"
            >
              New Price Alert
            </h3>

            {/* Pair selector */}
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Crop Pair
            </label>
            <select
              value={newAlertPair}
              onChange={(e) => setNewAlertPair(e.target.value)}
              className="mb-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="">Select a pair...</option>
              {pairs.map((pair) => (
                <option key={pair} value={pair}>
                  {pair} — ${parseFloat(priceMap[pair]?.price ?? "0").toFixed(2)}
                </option>
              ))}
            </select>

            {/* Direction */}
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Condition
            </label>
            <div className="mb-3 flex gap-2">
              <button
                onClick={() => setNewAlertDirection("above")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  newAlertDirection === "above"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-400 dark:bg-emerald-900/20 dark:text-emerald-400"
                    : "border-zinc-200 text-zinc-500 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-400"
                }`}
              >
                Price above
              </button>
              <button
                onClick={() => setNewAlertDirection("below")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  newAlertDirection === "below"
                    ? "border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-900/20 dark:text-red-400"
                    : "border-zinc-200 text-zinc-500 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-400"
                }`}
              >
                Price below
              </button>
            </div>

            {/* Threshold */}
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Threshold Price ($)
            </label>
            <input
              type="number"
              step="0.01"
              value={newAlertThreshold}
              onChange={(e) => setNewAlertThreshold(e.target.value)}
              placeholder="e.g. 4.00"
              className="mb-4 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
            />

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAlertModal(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAlert}
                disabled={!newAlertPair || !newAlertThreshold}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Create Alert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
