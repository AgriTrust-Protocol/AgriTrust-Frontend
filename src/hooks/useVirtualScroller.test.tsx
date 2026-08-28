// src/hooks/useVirtualScroller.test.ts
import React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useVirtualScroller, type UseVirtualScrollerOptions } from "./useVirtualScroller";

/** Minimal ResizeObserver polyfill — jsdom doesn't implement one. */
class MockResizeObserver {
  constructor(private callback: ResizeObserverCallback) {}
  observe(el: Element) {
    this.callback(
      [{ contentRect: { height: (el as HTMLElement).clientHeight } } as ResizeObserverEntry],
      this as unknown as ResizeObserver
    );
  }
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    // @ts-expect-error -- test polyfill
    globalThis.ResizeObserver = MockResizeObserver;
  }
});

/** Renders a real scroll container so refs, sizes, and scroll events all behave like a browser. */
function renderScroller(options: UseVirtualScrollerOptions, viewportHeight = 400) {
  let hookResult: ReturnType<typeof useVirtualScroller>;

  function Harness() {
    hookResult = useVirtualScroller(options);
    return (
      <div
        ref={hookResult.containerRef}
        style={{ height: viewportHeight, overflow: "auto" }}
        data-testid="scroll-container"
      >
        <div style={{ height: hookResult.totalHeight }} />
      </div>
    );
  }

  const utils = render(<Harness />);
  const container = utils.getByTestId("scroll-container") as HTMLDivElement;

  // jsdom reports 0 for clientHeight by default; force the viewport height
  // we asked for so the visible-range math has something real to work with.
  Object.defineProperty(container, "clientHeight", {
    value: viewportHeight,
    configurable: true,
  });

  return { ...utils, container, getHook: () => hookResult! };
}

describe("useVirtualScroller", () => {
  it("computes a visible range roughly matching viewport size plus overscan", () => {
    const { container, getHook } = renderScroller({
      totalCount: 1000,
      estimatedHeight: 64,
      overscan: 5,
    });

    act(() => {
      container.dispatchEvent(new Event("scroll"));
    });

    const items = getHook().getVirtualItems();
    // 400px viewport / 64px rows ≈ 7 visible, + 5 overscan above/below ≈ 17.
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThan(30);
    expect(items[0].index).toBe(0);
  });

  it("scrolling down shifts the visible index range forward", () => {
    const { container, getHook } = renderScroller({
      totalCount: 1000,
      estimatedHeight: 64,
      overscan: 5,
    });

    Object.defineProperty(container, "scrollTop", { value: 6400, configurable: true }); // ~100 rows down
    act(() => {
      container.dispatchEvent(new Event("scroll"));
    });

    const items = getHook().getVirtualItems();
    expect(items[0].index).toBeGreaterThan(80);
    expect(items[0].index).toBeLessThan(110);
  });

  it("onItemsPrepended shifts scrollTop by exactly the inserted content height, preserving position", () => {
    let scrollTop = 5000;
    const { container, getHook } = renderScroller({
      totalCount: 500,
      estimatedHeight: 64,
      overscan: 5,
    });

    Object.defineProperty(container, "scrollTop", {
      get: () => scrollTop,
      set: (v) => {
        scrollTop = v;
      },
      configurable: true,
    });

    act(() => {
      getHook().onItemsPrepended(20);
    });

    // 20 new rows at the 64px default estimate = 1280px inserted above the
    // previous view; scrollTop must move by exactly that to keep the rows
    // the user was looking at in the same visual position.
    expect(scrollTop).toBe(5000 + 20 * 64);
  });

  it("fires onLoadMorePrevious when scrolled within one viewport of the top", async () => {
    const onLoadMorePrevious = vi.fn().mockResolvedValue(undefined);
    const { container } = renderScroller({
      totalCount: 1000,
      estimatedHeight: 64,
      overscan: 5,
      onLoadMorePrevious,
    });

    Object.defineProperty(container, "scrollTop", { value: 50, configurable: true }); // near top
    await act(async () => {
      container.dispatchEvent(new Event("scroll"));
      await Promise.resolve();
    });

    expect(onLoadMorePrevious).toHaveBeenCalled();
  });

  it("fires onLoadMoreNext when scrolled within one viewport of the bottom", async () => {
    const onLoadMoreNext = vi.fn().mockResolvedValue(undefined);
    const totalCount = 200; // 200 * 64px = 12,800px total content
    const { container } = renderScroller({
      totalCount,
      estimatedHeight: 64,
      overscan: 5,
      onLoadMoreNext,
    });

    // 400px viewport near the very bottom of ~12,800px content.
    Object.defineProperty(container, "scrollTop", { value: 12_500, configurable: true });
    await act(async () => {
      container.dispatchEvent(new Event("scroll"));
      await Promise.resolve();
    });

    expect(onLoadMoreNext).toHaveBeenCalled();
  });
});
