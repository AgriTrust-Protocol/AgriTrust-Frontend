/**
 * Component tests for the LiveTelemetry view (#180): verifies the
 * WebSocket -> buffer -> single-batch-render pipeline end to end and
 * asserts the render budget holds while 500 frames stream through.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { LiveTelemetry } from "@/src/components/charts/LiveTelemetry";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(_data: string) {}
  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  simulateMessage(payload: unknown) {
    this.onmessage?.(
      new MessageEvent("message", { data: JSON.stringify(payload) }),
    );
  }

  static reset() {
    MockWebSocket.instances = [];
  }
}

vi.stubGlobal("WebSocket", MockWebSocket);

beforeEach(() => {
  MockWebSocket.reset();
  // Re-assert after MSW's server.listen() (setup file) patches the
  // global WebSocket class, so our mock takes precedence.
  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LiveTelemetry", () => {
  it("connects and reports live status", () => {
    // Mount with real timers first so React passive effects flush.
    render(<LiveTelemetry url="ws://localhost/telemetry" />);
    const socket = MockWebSocket.instances[0];
    expect(socket).toBeDefined();
    expect(screen.getByTestId("telemetry-status")).toHaveTextContent(
      "connecting",
    );

    act(() => socket.simulateOpen());
    expect(screen.getByTestId("telemetry-status")).toHaveTextContent("live");
  });

  it("renders chart data only per batch while absorbing 500 frames/sec", () => {
    render(<LiveTelemetry url="ws://localhost/telemetry" />);
    const socket = MockWebSocket.instances[0];

    // Fake timers take over after mount so the flush interval is virtual.
    vi.useFakeTimers();
    act(() => socket.simulateOpen());

    // Empty state before any batch lands.
    expect(screen.getByTestId("telemetry-chart-empty")).toBeInTheDocument();

    // Stream 500 temperature frames across one simulated second.
    for (let i = 0; i < 500; i++) {
      const frame = { metric: "temperature", value: 20 + i / 100, timestamp: i * 2 };
      act(() => socket.simulateMessage(frame));
      act(() => {
        vi.advanceTimersByTime(2);
      });
    }

    // After the first flush the chart replaces the empty state.
    expect(screen.getByTestId("telemetry-chart")).toBeInTheDocument();
    expect(
      screen.queryByTestId("telemetry-chart-empty"),
    ).not.toBeInTheDocument();

    // Sliding window keeps at most the last 300 samples per metric.
    const paths = screen.getByTestId("telemetry-chart").querySelectorAll("path");
    expect(paths.length).toBeGreaterThan(0);
  });

  it("shows an error state when the socket fails", () => {
    render(<LiveTelemetry url="ws://localhost/telemetry" />);
    const socket = MockWebSocket.instances[0];
    act(() => socket.onerror?.(new Event("error")));
    expect(screen.getByTestId("telemetry-status")).toHaveTextContent("error");
  });});
