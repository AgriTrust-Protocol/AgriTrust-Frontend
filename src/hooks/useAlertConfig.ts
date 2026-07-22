/**
 * Threshold alert configuration hook.
 *
 * Manages user-configured price threshold alerts. Alerts are persisted
 * to localStorage and synced with the price feed store.  When an alert
 * triggers, the usePriceFeed hook handles browser notification delivery.
 *
 * Features:
 *  - CRUD for price alerts (create, read, update, delete)
 *  - Persistence to localStorage
 *  - Browser Notification permission request
 *  - Global notification enable/disable toggles
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useSignal } from "@/src/hooks/useSignal";
import { defaultPriceFeedStore } from "@/src/stores/priceFeedStore";
import type { PriceAlert } from "@/src/types/prices";

// ── Storage helpers ────────────────────────────────────────────────────────

const ALERTS_STORAGE_KEY = "agritrust-price-alerts";
const NOTIF_PREFS_KEY = "agritrust-notif-prefs";

interface NotifPrefs {
  browserNotificationsEnabled: boolean;
  emailNotificationsEnabled: boolean;
}

function loadAlerts(): PriceAlert[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ALERTS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PriceAlert[]) : [];
  } catch {
    return [];
  }
}

function persistAlerts(alerts: PriceAlert[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts));
  } catch {
    console.warn("[useAlertConfig] Failed to persist alerts to localStorage");
  }
}

function loadNotifPrefs(): NotifPrefs {
  if (typeof window === "undefined") return { browserNotificationsEnabled: true, emailNotificationsEnabled: false };
  try {
    const raw = localStorage.getItem(NOTIF_PREFS_KEY);
    return raw ? (JSON.parse(raw) as NotifPrefs) : { browserNotificationsEnabled: true, emailNotificationsEnabled: false };
  } catch {
    return { browserNotificationsEnabled: true, emailNotificationsEnabled: false };
  }
}

function persistNotifPrefs(prefs: NotifPrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    console.warn("[useAlertConfig] Failed to persist notification preferences");
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────

export interface UseAlertConfigReturn {
  /** Current list of configured alerts. */
  alerts: PriceAlert[];
  /** Add a new price alert. */
  addAlert: (alert: Omit<PriceAlert, "id" | "triggered" | "createdAt" | "lastTriggeredAt">) => PriceAlert;
  /** Update an existing alert. */
  updateAlert: (id: string, updates: Partial<PriceAlert>) => void;
  /** Remove an alert by ID. */
  removeAlert: (id: string) => void;
  /** Toggle enable/disable for a specific alert. */
  toggleAlert: (id: string) => void;
  /** Whether browser notifications are enabled globally. */
  browserNotificationsEnabled: boolean;
  /** Toggle browser notifications on/off. */
  setBrowserNotificationsEnabled: (enabled: boolean) => void;
  /** Whether email notifications are enabled globally. */
  emailNotificationsEnabled: boolean;
  /** Toggle email notifications on/off. */
  setEmailNotificationsEnabled: (enabled: boolean) => void;
  /** Request browser notification permission. Returns the result. */
  requestNotificationPermission: () => Promise<NotificationPermission>;
}

export function useAlertConfig(): UseAlertConfigReturn {
  const alerts = useSignal(defaultPriceFeedStore.alerts$);

  // ── Hydrate from localStorage on mount ────────────────────────────────

  useEffect(() => {
    const stored = loadAlerts();
    defaultPriceFeedStore.alerts$.set(stored);
  }, []);

  // ── CRUD operations ───────────────────────────────────────────────────

  const addAlert = useCallback(
    (
      input: Omit<PriceAlert, "id" | "triggered" | "createdAt" | "lastTriggeredAt">,
    ): PriceAlert => {
      const alert: PriceAlert = {
        ...input,
        id: crypto.randomUUID(),
        triggered: false,
        createdAt: Date.now(),
        lastTriggeredAt: null,
      };

      const current = defaultPriceFeedStore.alerts$.get();
      const updated = [...current, alert];
      defaultPriceFeedStore.alerts$.set(updated);
      persistAlerts(updated);

      return alert;
    },
    [],
  );

  const updateAlert = useCallback(
    (id: string, updates: Partial<PriceAlert>) => {
      const current = defaultPriceFeedStore.alerts$.get();
      const updated = current.map((a) =>
        a.id === id ? { ...a, ...updates } : a,
      );
      defaultPriceFeedStore.alerts$.set(updated);
      persistAlerts(updated);
    },
    [],
  );

  const removeAlert = useCallback((id: string) => {
    const current = defaultPriceFeedStore.alerts$.get();
    const updated = current.filter((a) => a.id !== id);
    defaultPriceFeedStore.alerts$.set(updated);
    persistAlerts(updated);
  }, []);

  const toggleAlert = useCallback((id: string) => {
    const current = defaultPriceFeedStore.alerts$.get();
    const updated = current.map((a) =>
      a.id === id ? { ...a, enabled: !a.enabled } : a,
    );
    defaultPriceFeedStore.alerts$.set(updated);
    persistAlerts(updated);
  }, []);

  // ── Notification preferences ──────────────────────────────────────────

  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>(() => loadNotifPrefs());

  const setBrowserNotificationsEnabled = useCallback((enabled: boolean) => {
    const updated = { ...notifPrefs, browserNotificationsEnabled: enabled };
    setNotifPrefs(updated);
    persistNotifPrefs(updated);
  }, [notifPrefs]);

  const setEmailNotificationsEnabled = useCallback((enabled: boolean) => {
    const updated = { ...notifPrefs, emailNotificationsEnabled: enabled };
    setNotifPrefs(updated);
    persistNotifPrefs(updated);
  }, [notifPrefs]);

  const requestNotificationPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "denied";
    }
    const result = await Notification.requestPermission();
    return result;
  }, []);

  return {
    alerts,
    addAlert,
    updateAlert,
    removeAlert,
    toggleAlert,
    browserNotificationsEnabled: notifPrefs.browserNotificationsEnabled,
    setBrowserNotificationsEnabled,
    emailNotificationsEnabled: notifPrefs.emailNotificationsEnabled,
    setEmailNotificationsEnabled,
    requestNotificationPermission,
  };
}
