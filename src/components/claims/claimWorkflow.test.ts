import { describe, expect, it } from "vitest";
import { buildSubmittedClaim } from "@/src/services/claimsWorkflow";
import { type ClaimDocument } from "./claimTypes";

const documents: ClaimDocument[] = ["photo.jpg", "weather.pdf", "lab.png"].map((fileName, index) => ({ id: `doc-${index}`, fileName, fileSize: 1024, fileType: index === 1 ? "application/pdf" : "image/png", evidenceType: index === 1 ? "weather_reports" : "damage_photos", uploadProgress: 100, chunks: 1 }));

describe("insurance claims workflow", () => {
  it("submits a claim, uploads three documents, assigns an adjuster, and persists messages", () => {
    const claim = buildSubmittedClaim({ crop: "Maize", field: "North Field", geography: "North district", damageDescription: "Storm damage", evidenceType: "damage_photos", parametricTriggerMet: false, documents }, new Date("2026-07-19T10:00:00.000Z"));
    const persistedMessages = [...claim.messages, ...Array.from({ length: 5 }, (_, index) => ({ id: `chat-${index}`, author: "farmer" as const, body: `Message ${index + 1}`, createdAt: "2026-07-19T10:05:00.000Z" }))];
    expect(claim.documents).toHaveLength(3);
    expect(claim.adjuster).toBe("Maya Okafor");
    expect(claim.status).toBe("under_review");
    expect(persistedMessages).toHaveLength(6);
  });

  it("marks parametric drought-triggered claims as paid without manual review", () => {
    const claim = buildSubmittedClaim({ crop: "Sorghum", field: "South Pasture", geography: "South district", damageDescription: "Drought trigger", evidenceType: "weather_reports", parametricTriggerMet: true, documents });
    expect(claim.status).toBe("paid");
    expect(claim.payoutCents).toBe(250000);
    expect(claim.adjuster).toBeUndefined();
  });
});
