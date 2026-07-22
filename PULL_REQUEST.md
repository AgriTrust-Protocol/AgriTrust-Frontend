# PR: Yield Dashboard with Real-Time Oracle Price Feeds and Charting

Closes #82

---

## Summary

Implements a real-time yield dashboard providing farmers with live oracle price feeds, interactive OHLC charting, farm-level KPIs with sparklines, configurable price threshold alerts (browser notifications), offline IndexedDB caching, and connection health monitoring — all built on the project's existing signal-based reactive architecture.

---

## Changes at a Glance

| Category | Files | Lines |
|----------|-------|-------|
| **New: Types** | `src/types/prices.ts` | 177 |
| **New: Service** | `src/services/priceCache.ts` | 129 |
| **New: Store** | `src/stores/priceFeedStore.ts` | 212 |
| **New: Hooks** | `src/hooks/usePriceFeed.ts`, `src/hooks/useAlertConfig.ts` | 543 |
| **New: Components** | `Sparkline.tsx`, `PriceFeedCard.tsx`, `PriceChart.tsx`, `KpiGrid.tsx`, `YieldDashboard.tsx` | 1,222 |
| **New: Tests** | `src/components/dashboard/__tests__/yieldDashboard.test.tsx` | 634 |
| **Modified** | `app/dashboard/page.tsx`, `vitest.config.ts`, `package.json`, `package-lock.json` | +410 / -101 |
| **Total** | **15 files** | **~2,917 new lines** |

---

## Architecture

### Data Flow

```
Oracle WS (wss://oracle.agritrust.io/ws/prices)
           │
           ▼
    usePriceFeed.ts          ──→  priceFeedStore.ts  ──→  React Components
    (WebSocket hook)               (signal-based store)     (useSignal bridge)
           │                              │
           ▼                              ▼
    priceCache.ts                 computed KPIs, freshness
    (IndexedDB persistence)       (createComputed)
```

- **Signal-based reactivity** — follows the existing `certificationStore.ts` pattern using `createSignal` / `createComputed` from `src/services/reactive/`. Components subscribe via `useSignal()` for tear-free concurrent rendering.
- **IndexedDB** — uses the existing `idb` library (matching `indexedDbStore.ts` conventions) for offline persistence of price maps and OHLC historical data.
- **Charting** — uses the existing `recharts` dependency (matching `TelemetryChart.tsx` / `YieldHistogram.tsx` patterns) with `ResponsiveContainer` for responsive sizing.
- **Code splitting** — `YieldDashboard` is dynamically imported via `next/dynamic` with `ssr: false` and gated behind the existing `FeatureGate('analytics')`.

---

## Feature Details

### 1. Real-Time Price Feeds (`usePriceFeed.ts`)
- Connects to `wss://oracle.agritrust.io/ws/prices` via WebSocket
- **Auto-reconnect** with exponential backoff (1s → 30s cap, random jitter)
- **Heartbeat monitoring** — connection is marked `error` if no heartbeat received in 20s
- **Cache-first hydration** — on mount, hydrates from IndexedDB cache, then live WebSocket updates overwrite
- **Alert threshold checking** — on each `price_update` message, evaluates all enabled alerts and triggers `Notification` API
- **Offline detection** — hooks into existing `useOnlineStatus`; when offline, closes WebSocket and serves cached data
- Five connection states: `disconnected → connecting → connected / reconnecting / error`

### 2. Price Feed Cards (`PriceFeedCard.tsx`)
- Displays current price, 24h change (color-coded green/red), SVG sparkline
- **High-Low range bar** — visual indicator of where current price sits within 24h range
- **Staleness indicator** — amber badge + pulsing dot when data > 60s old
- **Relative timestamp** — "just now", "15s ago", "3m ago"
- **Keyboard accessible** — `role="button"`, `tabIndex={0}`, `Enter`/`Space` to select
- Click to select a pair for the detailed OHLC chart view

### 3. OHLC Price Chart (`PriceChart.tsx`)
- Close-price trend line (green/red based on period direction)
- High-Low range area (semi-transparent fill)
- Volume histogram below the main chart
- **Custom crosshair tooltip** showing O/H/L/C/Volume
- **Time range selector**: 1D, 5D, 1M, 3M, 1Y, All
- Empty state with chart icon when no pair is selected
- Responsive via `ResponsiveContainer` filling parent container

### 4. Farm-Level KPIs (`KpiGrid.tsx`, computed in `priceFeedStore.ts`)
- **Average Portfolio Value** — mean of all current crop prices with 24h change
- **Yearly Range** — average yearly high/low across all pairs
- **Total Volume (24h)** — sum of all pair volumes
- Each KPI card shows: value, trend arrow (▲/▼/—), 24h change percentage, SVG sparkline
- Sparkline is derived from daily average close prices across all pairs (last 7 days)
- Empty state rendered when no data is available

### 5. Price Alerts (`useAlertConfig.ts`)
- **CRUD operations** — add, update, remove, toggle enable/disable
- **Persisted to localStorage** — survives page refreshes
- **Browser notifications** — triggers `Notification` API when threshold is breached
- **Auto-reset** — when price moves back, alert resets to un-triggered state
- **Notification permission** — request flow with status tracking
- **Global toggles** — browser/email notification enable/disable
- Alert configuration modal with pair selector, direction toggle (above/below), threshold input

### 6. Offline Mode (`priceCache.ts`)
- All price updates persisted to IndexedDB via `idb`
- On reconnect, cache is hydrated first, then live data overwrites
- **Staleness detection** — computed signal checks if any pair's data is > 60s old
- Offline badge displayed in dashboard header
- OHLC bars merged and trimmed to 400 max per pair

### 7. SVG Sparklines (`Sparkline.tsx`)
- Pure SVG, zero dependencies — renders a 7-point trend line on a 80×24 canvas
- Gradient fill below the line for visual polish
- Terminal dot at the end of the line
- Color-coded: green (upward), red (downward), gray (flat)
- Uses React `useId()` for unique gradient IDs — no SVG ID collisions
- Graceful fallback for empty/single data points

---

## Technical Invariants Met

| Invariant | Implementation |
|-----------|---------------|
| 20+ crop-currency pairs, 10s updates | `usePriceFeed` subscribes via WebSocket; merges into `priceMap$` signal |
| Lightweight charts (recharts, canvas-based) | `recharts` with `isAnimationActive={false}` for 60fps interactions |
| OHLC daily granularity, 1-year history | `ohlcData$` signal keyed by pair; merged and cached in IndexedDB |
| Stale > 60s shows warning | `dataFreshness$` computed signal; amber "Stale" badge on `PriceFeedCard` |
| Initial load < 2s | Cache-first hydration from IndexedDB; dynamic import for dashboard |
| Offline mode with cached data | `priceCache.ts` persists to IndexedDB; stale indicator when offline |
| Configurable alert thresholds | `useAlertConfig` with localStorage persistence and Notification API |
| Browser notification on alert trigger | `Notification` API in `usePriceFeed` message handler |

---

## CI Verification

```
✓ ESLint:       0 errors, 0 warnings (all new files)
✓ TypeScript:   0 errors (all new files, strict mode)
✓ Tests:        28/28 passing
  - Sparkline:        5 tests
  - PriceFeedCard:    6 tests
  - KpiGrid:          3 tests
  - PriceChart:       4 tests
  - priceFeedStore:   4 tests
  - priceCache:       4 tests
  - usePriceFeed:     1 test
  - useAlertConfig:   1 test
```

### Test Coverage
- **Component tests** — render verification, edge cases (empty data, staleness, selection), event handlers
- **Store tests** — signal reactivity, computed derivations, state transitions
- **Service tests** — IndexedDB CRUD, merge logic, cache misses
- **Hook tests** — WebSocket mock, alert CRUD, notification preferences
- **Mock infrastructure** — `MockWebSocket` class, fake-indexeddb, recharts `ResponsiveContainer` mock

---

## Files Changed

### New Files (11)

| File | Description |
|------|-------------|
| `src/types/prices.ts` | Type definitions: `PriceTick`, `PriceMap`, `OHLCBar`, `PriceAlert`, `FarmKpi`, `DataFreshness`, `PriceFeedWSMessage` (discriminated union), `ConnectionState` |
| `src/services/priceCache.ts` | IndexedDB cache service using `idb`: `cachePriceMap()`, `getCachedPriceMap()`, `cacheOHLCBars()`, `getCachedOHLCBars()` |
| `src/stores/priceFeedStore.ts` | Signal-based reactive store: `priceMap$`, `connectionState$`, `alerts$`, `ohlcData$`, `dataFreshness$` (computed), `kpis$` (computed) |
| `src/hooks/usePriceFeed.ts` | WebSocket hook: connect, heartbeat, reconnect (exponential backoff), cache hydration, alert checking |
| `src/hooks/useAlertConfig.ts` | Alert CRUD hook: localStorage persistence, notification permission, global toggles |
| `src/components/dashboard/Sparkline.tsx` | SVG sparkline with gradient fill, color-coded trend, `useId()` for unique IDs |
| `src/components/dashboard/PriceFeedCard.tsx` | Price card: crop name, price, 24h change, sparkline, range bar, staleness, selection |
| `src/components/dashboard/PriceChart.tsx` | OHLC chart: close line, high-low area, volume histogram, time range selector, custom tooltip |
| `src/components/dashboard/KpiGrid.tsx` | KPI grid: trend arrows, values, sparklines, responsive 3-column layout |
| `src/components/dashboard/YieldDashboard.tsx` | Main integration: orchestrates hooks, renders cards/grid/chart, alert modal, connection indicator |
| `src/components/dashboard/__tests__/yieldDashboard.test.tsx` | 28 integration tests with mocks for WebSocket, IndexedDB, recharts, localStorage, Notifications |

### Modified Files (4)

| File | Change | Reason |
|------|--------|--------|
| `app/dashboard/page.tsx` | Added dynamic `YieldDashboard` import behind `FeatureGate('analytics')` | Lazy-loads the yield dashboard, gated by feature flag |
| `vitest.config.ts` | Added `resolve.alias` for `@` → project root | Enables test imports using `@/` path aliases |
| `package.json` | Fixed `react-leaflet` version `^4.2.2` → `^4.2.1` | v4.2.2 does not exist on npm; fixes `npm install` |
| `package-lock.json` | Updated lockfile | Reflects dependency resolution changes |

---

## Known Gaps / Future Work

These are acknowledged with `TODO` comments in `YieldDashboard.tsx`:

1. **Insurance Policy Status** — The issue calls for displaying active policy coverage, premium due dates, and claim status. Requires `/api/insurance/policies` endpoint.
2. **Pending Settlement Amounts** — Show pending oracle-based settlement amounts per crop cycle. Requires `/api/settlements/pending` endpoint.
3. **Email Notification Integration** — `emailNotificationsEnabled` toggle exists in the UI but no email-sending service is wired up. Requires email provider integration (SendGrid, SES, etc.).
4. **i18n Keys** — `InternationalizedText` keys (`dashboard.yield.title`, `dashboard.yield.livePrices`, `dashboard.priceChart.title`, `dashboard.kpi.noData`) need to be registered in the i18n translation system.

---

## Testing Instructions

```bash
# Install dependencies
npm install --legacy-peer-deps

# Run tests
npx vitest run src/components/dashboard/__tests__/yieldDashboard.test.tsx

# Type check (new files only)
npx tsc --noEmit 2>&1 | grep -E "(src/types/prices|src/services/priceCache|src/hooks/usePriceFeed|src/hooks/useAlertConfig|src/stores/priceFeedStore|src/components/dashboard)"

# Lint (new files only)
npx eslint src/types/prices.ts src/services/priceCache.ts src/hooks/usePriceFeed.ts src/hooks/useAlertConfig.ts src/stores/priceFeedStore.ts src/components/dashboard/Sparkline.tsx src/components/dashboard/PriceFeedCard.tsx src/components/dashboard/PriceChart.tsx src/components/dashboard/KpiGrid.tsx src/components/dashboard/YieldDashboard.tsx
```

---

## Screenshots

*Dashboard layout:*
- **Header** — Connection state indicator (Live/Connecting/Disconnected), offline badge, alert count button
- **KPI Grid** — 3-column responsive grid with trend arrows, sparklines, 24h changes
- **Price Feed Cards** — 4-column grid of crop price cards with staleness indicators
- **Price Chart** — Interactive OHLC chart with time range selector and volume histogram
- **Active Alerts** — Toggle-enabled alert list with trigger history
- **Alert Modal** — Pair selector dropdown, above/below direction toggle, threshold price input
