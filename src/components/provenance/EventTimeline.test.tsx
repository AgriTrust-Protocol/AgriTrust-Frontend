import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventTimeline } from "./EventTimeline";
import type { ProvenanceEvent } from "./types";

function makeEvents(count: number): ProvenanceEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `event-${index}`,
    event_type: index === 0 ? "Harvest" : "Custody transfer",
    timestamp: new Date(Date.UTC(2026, 0, 1, index)).toISOString(),
    location: { name: `Checkpoint ${index}`, latitude: 6.5 + index * 0.01, longitude: 3.3 + index * 0.01 },
    custodian: `Custodian ${index}`,
    status: index % 3 === 0 ? "verified" : "in_transit",
    certificates: [{ id: `cert-${index}`, label: "Lab result", type: "pdf", uri: "https://example.com/cert.pdf" }],
    temperatureLogs: [{ timestamp: new Date(Date.UTC(2026, 0, 1, index, 30)).toISOString(), celsius: 4 + (index % 5) }],
  }));
}

describe("EventTimeline", () => {
  it("renders a 50-event provenance chain within the 3s budget", () => {
    const started = performance.now();
    render(<EventTimeline events={makeEvents(50)} onVerify={async () => ({ status: "verified" })} />);
    const elapsed = performance.now() - started;

    expect(screen.getAllByTestId("provenance-event-card")).toHaveLength(50);
    expect(elapsed).toBeLessThan(3000);
  });
});
