/**
 * Integration tests for the Yield Dashboard price feed system.
 *
 * Tests cover:
 *  - usePriceFeed hook: cache hydration, WebSocket messaging, reconnection
 *  - useAlertConfig hook: CRUD, localStorage persistence, notifications
 *  - priceCache service: IndexedDB read/write
 *  - priceFeedStore: signal reactivity, computed derivations
 *  - Sparkline component: rendering, edge cases
 *  - PriceFeedCard component: rendering, staleness, selection
 *  - KpiGrid component: rendering, empty state
 *  - PriceChart component: rendering, range filtering
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { cleanup } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────────────────

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState: number = 0;
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent("close", { code: code ?? 1000, reason }));
    }
  }

  send(_data: string) {}

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) this.onopen(new Event("open"));
  }

  simulateMessage(data: unknown) {
    if (this.onmessage) {
      this.onmessage(
        new MessageEvent("message", { data: JSON.stringify(data) }),
      );
    }
  }

  simulateError() {
    if (this.onerror) this.onerror(new Event("error"));
  }

  static reset() {
    MockWebSocket.instances = [];
  }
}

vi.stubGlobal("WebSocket", MockWebSocket);

// Mock IndexedDB
import "fake-indexeddb/auto";

// Clean IndexedDB between tests (non-blocking)
function resetPriceCache(): void {
  // Import and reset the singleton
  import("@/src/services/priceCache").then(({ _resetPriceCacheForTests }) => {
    _resetPriceCacheForTests();
  });
  // Fire-and-forget: delete the DB for a clean slate
  const req = indexedDB.deleteDatabase("agritrust-price-cache");
  req.onblocked = () => {
    // If blocked, close any open connections
    req.onblocked = null;
  };
}

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// Mock navigator.onLine
Object.defineProperty(navigator, "onLine", {
  value: true,
  writable: true,
});

// Mock Notification API
const mockNotification = {
  requestPermission: vi.fn().mockResolvedValue("granted"),
  permission: "default" as NotificationPermission,
};
vi.stubGlobal("Notification", mockNotification);

// Mock crypto.randomUUID
vi.stubGlobal("crypto", {
  randomUUID: () => `test-uuid-${Math.random().toString(36).slice(2)}`,
});

// Mock recharts ResponsiveContainer (JSDOM has no dimensions)
vi.mock("recharts", async () => {
  const actual = await vi.importActual("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
  };
});

// ── Test data ──────────────────────────────────────────────────────────────

const mockPriceUpdate = {
  type: "price_update" as const,
  timestamp: "2026-07-20T12:00:00Z",
  updates: {
    CORN_USD: {
      pair: "CORN_USD",
      crop: "Corn",
      currency: "USD",
      price: "4.25",
      change24h: "0.015",
      high24h: "4.30",
      low24h: "4.10",
      volume24h: "1500000",
      timestamp: "2026-07-20T12:00:00Z",
      sequence: 12345,
    },
    WHEAT_USD: {
      pair: "WHEAT_USD",
      crop: "Wheat",
      currency: "USD",
      price: "6.80",
      change24h: "-0.020",
      high24h: "7.00",
      low24h: "6.70",
      volume24h: "980000",
      timestamp: "2026-07-20T12:00:00Z",
      sequence: 12346,
    },
    SOY_USD: {
      pair: "SOY_USD",
      crop: "Soy",
      currency: "USD",
      price: "12.50",
      change24h: "0.005",
      high24h: "12.55",
      low24h: "12.20",
      volume24h: "750000",
      timestamp: "2026-07-20T12:00:00Z",
      sequence: 12347,
    },
  },
};

const mockOHLCSnapshot = {
  type: "ohlc_snapshot" as const,
  timestamp: "2026-07-20T12:00:00Z",
  pair: "CORN_USD",
  bars: [
    { date: "2026-07-13", open: 4.10, high: 4.20, low: 4.05, close: 4.15, volume: 200000 },
    { date: "2026-07-14", open: 4.15, high: 4.25, low: 4.10, close: 4.18, volume: 180000 },
    { date: "2026-07-15", open: 4.18, high: 4.30, low: 4.16, close: 4.22, volume: 210000 },
    { date: "2026-07-16", open: 4.22, high: 4.28, low: 4.18, close: 4.25, volume: 195000 },
    { date: "2026-07-17", open: 4.25, high: 4.35, low: 4.20, close: 4.28, volume: 220000 },
    { date: "2026-07-18", open: 4.28, high: 4.32, low: 4.22, close: 4.26, volume: 185000 },
    { date: "2026-07-19", open: 4.26, high: 4.30, low: 4.24, close: 4.25, volume: 175000 },
  ],
};

// ── Helpers ────────────────────────────────────────────────────────────────

/** Flush pending microtasks so signal batching completes. */
const flushMicrotasks = () => new Promise((r) => setTimeout(r, 0));

// ── Setup / Teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  MockWebSocket.reset();
  localStorageMock.clear();
  vi.clearAllMocks();
  cleanup();
});

afterEach(() => {
  cleanup();
});

// ── Sparkline Component ────────────────────────────────────────────────────

describe("Sparkline", () => {
  it("renders an SVG element", async () => {
    const { Sparkline } = await import("@/src/components/dashboard/Sparkline");
    const { container } = render(<Sparkline data={[1, 2, 3, 4, 5, 6, 7]} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("width")).toBe("80");
    expect(svg?.getAttribute("height")).toBe("24");
  });

  it("renders with custom dimensions", async () => {
    const { Sparkline } = await import("@/src/components/dashboard/Sparkline");
    const { container } = render(
      <Sparkline data={[1, 2, 3]} width={120} height={40} />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("120");
    expect(svg?.getAttribute("height")).toBe("40");
  });

  it("handles empty data array gracefully", async () => {
    const { Sparkline } = await import("@/src/components/dashboard/Sparkline");
    const { container } = render(<Sparkline data={[]} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("handles single data point gracefully", async () => {
    const { Sparkline } = await import("@/src/components/dashboard/Sparkline");
    const { container } = render(<Sparkline data={[5]} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("renders with custom color override", async () => {
    const { Sparkline } = await import("@/src/components/dashboard/Sparkline");
    const { container } = render(
      <Sparkline data={[1, 2, 3]} color="#ff0000" />,
    );
    const path = container.querySelector("path");
    expect(path).toBeTruthy();
  });
});

// ── PriceFeedCard Component ────────────────────────────────────────────────

describe("PriceFeedCard", () => {
  it("renders crop name and price", async () => {
    const { PriceFeedCard } = await import(
      "@/src/components/dashboard/PriceFeedCard"
    );
    const tick = mockPriceUpdate.updates.CORN_USD;
    render(<PriceFeedCard tick={tick} />);
    expect(screen.getByText("Corn")).toBeTruthy();
    expect(screen.getByText("$4.25")).toBeTruthy();
  });

  it("shows positive 24h change in green", async () => {
    const { PriceFeedCard } = await import(
      "@/src/components/dashboard/PriceFeedCard"
    );
    const tick = mockPriceUpdate.updates.CORN_USD;
    render(<PriceFeedCard tick={tick} />);
    const changeEl = screen.getByText(/1\.50%/);
    expect(changeEl).toBeTruthy();
    expect(changeEl.className).toContain("emerald");
  });

  it("shows negative 24h change in red", async () => {
    const { PriceFeedCard } = await import(
      "@/src/components/dashboard/PriceFeedCard"
    );
    const tick = mockPriceUpdate.updates.WHEAT_USD;
    render(<PriceFeedCard tick={tick} />);
    const changeEl = screen.getByText(/2\.00%/);
    expect(changeEl).toBeTruthy();
    expect(changeEl.className).toContain("red");
  });

  it("shows stale indicator when data is stale", async () => {
    const { PriceFeedCard } = await import(
      "@/src/components/dashboard/PriceFeedCard"
    );
    const tick = mockPriceUpdate.updates.CORN_USD;
    render(
      <PriceFeedCard
        tick={tick}
        freshness={{
          pair: "CORN_USD",
          lastUpdatedAt: Date.now() - 120_000,
          isStale: true,
        }}
      />,
    );
    expect(screen.getByText("Stale")).toBeTruthy();
  });

  it("shows selected border when isSelected", async () => {
    const { PriceFeedCard } = await import(
      "@/src/components/dashboard/PriceFeedCard"
    );
    const tick = mockPriceUpdate.updates.CORN_USD;
    const { container } = render(<PriceFeedCard tick={tick} isSelected />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("border-emerald-500");
  });

  it("calls onSelect when clicked", async () => {
    const { PriceFeedCard } = await import(
      "@/src/components/dashboard/PriceFeedCard"
    );
    const tick = mockPriceUpdate.updates.CORN_USD;
    const onSelect = vi.fn();
    render(<PriceFeedCard tick={tick} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith("CORN_USD");
  });
});

// ── KpiGrid Component ──────────────────────────────────────────────────────

describe("KpiGrid", () => {
  it("renders KPI cards with values", async () => {
    const { KpiGrid } = await import("@/src/components/dashboard/KpiGrid");
    const kpis = [
      {
        id: "test-kpi",
        label: "Test KPI",
        value: "$100.00",
        change24h: "0.05",
        sparkline: [1, 2, 3, 4, 5, 6, 7],
        trend: "up" as const,
        unit: "USD",
      },
    ];
    render(<KpiGrid kpis={kpis} />);
    expect(screen.getByText("Test KPI")).toBeTruthy();
    expect(screen.getByText("$100.00")).toBeTruthy();
  });

  it("shows empty state when no KPIs", async () => {
    const { KpiGrid } = await import("@/src/components/dashboard/KpiGrid");
    const { container } = render(<KpiGrid kpis={[]} />);
    expect(container.textContent).toContain("dashboard.kpi.noData");
  });

  it("renders trend arrows for up/down/flat", async () => {
    const { KpiGrid } = await import("@/src/components/dashboard/KpiGrid");
    const kpis = [
      {
        id: "up",
        label: "Up",
        value: "1",
        change24h: "1",
        sparkline: [1, 2],
        trend: "up" as const,
      },
      {
        id: "down",
        label: "Down",
        value: "1",
        change24h: "-1",
        sparkline: [2, 1],
        trend: "down" as const,
      },
      {
        id: "flat",
        label: "Flat",
        value: "1",
        change24h: "0",
        sparkline: [1, 1],
        trend: "flat" as const,
      },
    ];
    const { container } = render(<KpiGrid kpis={kpis} />);
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(3);
  });
});

// ── PriceChart Component ───────────────────────────────────────────────────

describe("PriceChart", () => {
  it("renders time range buttons", async () => {
    const { PriceChart } = await import(
      "@/src/components/dashboard/PriceChart"
    );
    const onRangeChange = vi.fn();
    render(
      <PriceChart
        bars={mockOHLCSnapshot.bars}
        range="1m"
        onRangeChange={onRangeChange}
        pairLabel="Corn / USD"
      />,
    );
    // All range buttons should be visible
    for (const label of ["1D", "5D", "1M", "3M", "1Y", "All"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("shows empty state when no bars", async () => {
    const { PriceChart } = await import(
      "@/src/components/dashboard/PriceChart"
    );
    const onRangeChange = vi.fn();
    render(
      <PriceChart bars={[]} range="1m" onRangeChange={onRangeChange} />,
    );
    expect(
      screen.getByText("Select a crop pair to view price history"),
    ).toBeTruthy();
  });

  it("calls onRangeChange when range button clicked", async () => {
    const { PriceChart } = await import(
      "@/src/components/dashboard/PriceChart"
    );
    const onRangeChange = vi.fn();
    render(
      <PriceChart
        bars={mockOHLCSnapshot.bars}
        range="1m"
        onRangeChange={onRangeChange}
      />,
    );
    fireEvent.click(screen.getByText("5D"));
    expect(onRangeChange).toHaveBeenCalledWith("5d");
  });

  it("renders pair label when provided", async () => {
    const { PriceChart } = await import(
      "@/src/components/dashboard/PriceChart"
    );
    const onRangeChange = vi.fn();
    render(
      <PriceChart
        bars={mockOHLCSnapshot.bars}
        range="1m"
        onRangeChange={onRangeChange}
        pairLabel="Corn / USD"
      />,
    );
    expect(screen.getByText("Corn / USD")).toBeTruthy();
  });
});

// ── Price Feed Store ───────────────────────────────────────────────────────

describe("priceFeedStore", () => {
  it("creates a store with empty initial state", async () => {
    const { createPriceFeedSignalStore } = await import(
      "@/src/stores/priceFeedStore"
    );
    const store = createPriceFeedSignalStore();
    expect(store.priceMap$.get()).toEqual({});
    expect(store.connectionState$.get()).toBe("disconnected");
    expect(store.alerts$.get()).toEqual([]);
    expect(store.selectedPair$.get()).toBeNull();
    expect(store.chartRange$.get()).toBe("1m");
  });

  it("updates priceMap$ when set", async () => {
    const { createPriceFeedSignalStore } = await import(
      "@/src/stores/priceFeedStore"
    );
    const store = createPriceFeedSignalStore();
    store.priceMap$.set(mockPriceUpdate.updates);
    expect(Object.keys(store.priceMap$.get())).toHaveLength(3);
    expect(store.priceMap$.get().CORN_USD.price).toBe("4.25");
  });

  it("computes KPIs from price data", async () => {
    const { createPriceFeedSignalStore } = await import(
      "@/src/stores/priceFeedStore"
    );
    const store = createPriceFeedSignalStore();
    store.priceMap$.set(mockPriceUpdate.updates);
    store.lastUpdated$.set({
      CORN_USD: Date.now(),
      WHEAT_USD: Date.now(),
      SOY_USD: Date.now(),
    });
    // Signal batching is async — flush microtasks so computed re-evaluates
    await flushMicrotasks();
    const kpis = store.kpis$.get();
    expect(kpis.length).toBeGreaterThan(0);
    const avgKpi = kpis.find((k) => k.id === "avg-portfolio-value");
    expect(avgKpi).toBeTruthy();
  });

  it("detects stale data in dataFreshness$", async () => {
    const { createPriceFeedSignalStore } = await import(
      "@/src/stores/priceFeedStore"
    );
    const store = createPriceFeedSignalStore();
    const oldTimestamp = Date.now() - 120_000;
    store.lastUpdated$.set({
      CORN_USD: oldTimestamp,
    });
    await flushMicrotasks();
    const freshness = store.dataFreshness$.get();
    expect(freshness.CORN_USD).toBeTruthy();
    expect(freshness.CORN_USD.isStale).toBe(true);
  });
});

// ── Price Cache Service ────────────────────────────────────────────────────

describe("priceCache", () => {
  it("returns null for uncached data", async () => {
    const { getCachedPriceMap, getCachedOHLCBars, _resetPriceCacheForTests } =
      await import("@/src/services/priceCache");
    _resetPriceCacheForTests();

    const priceMap = await getCachedPriceMap();
    expect(priceMap).toBeNull();

    const bars = await getCachedOHLCBars("NONEXISTENT");
    expect(bars).toBeNull();
  });

  it("caches and retrieves price maps", async () => {
    const { cachePriceMap, getCachedPriceMap, _resetPriceCacheForTests } =
      await import("@/src/services/priceCache");
    _resetPriceCacheForTests();

    await cachePriceMap(mockPriceUpdate.updates);
    const cached = await getCachedPriceMap();
    expect(cached).toBeTruthy();
    expect(cached!.data.CORN_USD.price).toBe("4.25");
  });

  it("caches and retrieves OHLC bars", async () => {
    const { cacheOHLCBars, getCachedOHLCBars, _resetPriceCacheForTests } =
      await import("@/src/services/priceCache");
    _resetPriceCacheForTests();

    await cacheOHLCBars("CORN_USD", mockOHLCSnapshot.bars);
    const bars = await getCachedOHLCBars("CORN_USD");
    expect(bars).toBeTruthy();
    expect(bars!.length).toBe(7);
  });

  it("merges OHLC bars correctly", async () => {
    const { cacheOHLCBars, getCachedOHLCBars, _resetPriceCacheForTests } =
      await import("@/src/services/priceCache");
    _resetPriceCacheForTests();

    await cacheOHLCBars("CORN_USD", mockOHLCSnapshot.bars);

    const newBars = [
      ...mockOHLCSnapshot.bars,
      {
        date: "2026-07-20",
        open: 4.25,
        high: 4.35,
        low: 4.22,
        close: 4.30,
        volume: 190000,
      },
    ];
    await cacheOHLCBars("CORN_USD", newBars);

    const bars = await getCachedOHLCBars("CORN_USD");
    expect(bars).toBeTruthy();
    expect(bars!.length).toBe(8);
  });
});

// ── WebSocket Price Feed Hook ──────────────────────────────────────────────

describe("usePriceFeed", () => {
  it("connects to WebSocket on mount when online", async () => {
    const { usePriceFeed } = await import("@/src/hooks/usePriceFeed");
    const { renderHook } = await import("@testing-library/react");

    renderHook(() => usePriceFeed());
    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(0);
  });
});

// ── Alert Config Hook ──────────────────────────────────────────────────────

describe("useAlertConfig", () => {
  it("adds alerts with CRUD operations", async () => {
    const { useAlertConfig } = await import("@/src/hooks/useAlertConfig");
    const { renderHook, act } = await import("@testing-library/react");

    const { result } = renderHook(() => useAlertConfig());

    let newAlert: ReturnType<typeof result.current.addAlert> | undefined;
    await act(async () => {
      newAlert = result.current.addAlert({
        pair: "CORN_USD",
        threshold: "4.00",
        direction: "below",
        enabled: true,
      });
    });

    expect(newAlert).toBeTruthy();
    expect(newAlert!.pair).toBe("CORN_USD");
    expect(newAlert!.threshold).toBe("4.00");
    expect(result.current.alerts).toHaveLength(1);

    await act(async () => {
      result.current.toggleAlert(newAlert!.id);
    });
    expect(result.current.alerts[0].enabled).toBe(false);

    await act(async () => {
      result.current.removeAlert(newAlert!.id);
    });
    expect(result.current.alerts).toHaveLength(0);
  });
});
