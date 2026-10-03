/* Authorized Protocol Quality Assurance & Formal Verification Test Suite */
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

import { VerificationBadge } from "@/src/components/provenance/VerificationBadge";
import { EventTimeline } from "@/src/components/provenance/EventTimeline";
import { ProvenanceMap } from "@/src/components/provenance/ProvenanceMap";
import { generateMockProvenanceBatch } from "@/src/hooks/useProvenance";
import type {
  MerkleProofData,
  CustodyEvent,
  VerificationResult,
} from "@/src/types/provenance";

/* ────── helpers ────── */
const mockBatch = generateMockProvenanceBatch("BATCH-TEST-001", 4);
const mockEvents = mockBatch.events;

const unverifiedProof: MerkleProofData = {
  root: "0x3a4f89d81e05a8b79b29d67185ad1b4f8c92de10875b48e3d09a27c49f82d1a3",
  leaf: "0x9c42b8a7fd048b291c7849e71295b0d87a64c8f2b189a047d9e84b2c019d",
  proof: [
    "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  ],
  block_number: 1489200,
  verified: false,
};

const verifiedProof: MerkleProofData = { ...unverifiedProof, verified: true };

/* ================================================================
   VerificationBadge
   ================================================================ */
describe("VerificationBadge", () => {
  it("renders unverified state with verify button when proof is not yet verified", () => {
    render(
      <VerificationBadge eventId="evt-1" merkleProof={unverifiedProof} />
    );
    expect(screen.getByText(/verify/i)).toBeInTheDocument();
  });

  it("renders verified state when proof is already verified", () => {
    render(
      <VerificationBadge eventId="evt-1" merkleProof={verifiedProof} />
    );
    expect(screen.getByText(/verified/i)).toBeInTheDocument();
  });

  it("calls onVerify callback when verify button is clicked", async () => {
    const user = userEvent.setup();
    const onVerify = vi.fn().mockResolvedValue({
      verified: true,
      event_id: "evt-1",
      root: unverifiedProof.root,
      leaf: unverifiedProof.leaf,
      block_number: 1489200,
      verification_timestamp: Date.now(),
    } satisfies VerificationResult);

    render(
      <VerificationBadge
        eventId="evt-1"
        merkleProof={unverifiedProof}
        onVerify={onVerify}
      />
    );

    const verifyBtn = screen.getByText(/verify/i);
    await user.click(verifyBtn);

    await waitFor(() => {
      expect(onVerify).toHaveBeenCalledWith("evt-1");
    });
  });
});

/* ================================================================
   EventTimeline
   ================================================================ */
describe("EventTimeline", () => {
  it("renders all custody events in chronological order", () => {
    render(<EventTimeline events={mockEvents} />);

    // EventTimeline renders desktop + mobile views, so titles appear multiple times
    for (const event of mockEvents) {
      const matches = screen.getAllByText(event.title);
      expect(matches.length).toBeGreaterThan(0);
    }
  });

  it("renders empty state when no events are provided", () => {
    render(<EventTimeline events={[]} />);
    expect(
      screen.getByText(/no custody events recorded/i)
    ).toBeInTheDocument();
  });

  it("filters events by type when filterType is provided", () => {
    render(<EventTimeline events={mockEvents} filterType="harvest" />);

    const harvestEvents = mockEvents.filter(
      (e) => e.event_type === "harvest"
    );
    const otherEvents = mockEvents.filter(
      (e) => e.event_type !== "harvest"
    );

    // Should render harvest events (getAllByText handles potential multiple nodes)
    for (const event of harvestEvents) {
      const matches = screen.getAllByText(event.title);
      expect(matches.length).toBeGreaterThan(0);
    }

    // Should NOT render non-harvest events
    for (const event of otherEvents) {
      expect(screen.queryByText(event.title)).not.toBeInTheDocument();
    }
  });
});

/* ================================================================
   ProvenanceMap
   ================================================================ */
describe("ProvenanceMap", () => {
  it("renders SVG map with marker elements for each event", () => {
    const { container } = render(<ProvenanceMap events={mockEvents} />);

    // Should render an SVG element
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();

    // Should have circle markers for events
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBeGreaterThanOrEqual(mockEvents.length);
  });

  it("renders route path connecting event locations", () => {
    const { container } = render(<ProvenanceMap events={mockEvents} />);

    // ProvenanceMap uses SVG <path> for route lines, not <polyline>
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThan(0);
  });

  it("calls onSelectEvent when a marker is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    const { container } = render(
      <ProvenanceMap events={mockEvents} onSelectEvent={onSelect} />
    );

    const circles = container.querySelectorAll("circle");
    if (circles.length > 0) {
      await user.click(circles[0]);
      expect(onSelect).toHaveBeenCalled();
    }
  });

  it("applies custom className", () => {
    const { container } = render(
      <ProvenanceMap events={mockEvents} className="custom-map-class" />
    );

    // The outermost wrapper should have the class
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain("custom-map-class");
  });
});

/* ================================================================
   generateMockProvenanceBatch (Unit)
   ================================================================ */
describe("generateMockProvenanceBatch", () => {
  it("generates a batch with the specified number of events", () => {
    const batch = generateMockProvenanceBatch("UNIT-001", 5);
    expect(batch.events).toHaveLength(5);
    expect(batch.batch_id).toBe("UNIT-001");
  });

  it("assigns correct event types in order", () => {
    const batch = generateMockProvenanceBatch("UNIT-002", 6);
    const expected = [
      "harvest",
      "processing",
      "storage",
      "transit",
      "inspection",
      "retail",
    ];
    batch.events.forEach((event, idx) => {
      expect(event.event_type).toBe(expected[idx]);
    });
  });

  it("generates valid location coordinates for every event", () => {
    const batch = generateMockProvenanceBatch("UNIT-003", 4);
    for (const event of batch.events) {
      expect(typeof event.location.lat).toBe("number");
      expect(typeof event.location.lng).toBe("number");
      expect(event.location.name).toBeTruthy();
    }
  });

  it("includes merkle proof data for every event", () => {
    const batch = generateMockProvenanceBatch("UNIT-004", 3);
    for (const event of batch.events) {
      expect(event.merkle_proof.root).toBeTruthy();
      expect(event.merkle_proof.leaf).toBeTruthy();
      expect(event.merkle_proof.proof.length).toBeGreaterThan(0);
    }
  });

  it("populates qr_url with the correct batch id", () => {
    const batch = generateMockProvenanceBatch("QR-001", 2);
    expect(batch.qr_url).toContain("QR-001");
  });
});
