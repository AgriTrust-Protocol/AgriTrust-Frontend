import { type ClaimStatus } from "@/src/components/claims/claimTypes";

export interface ClaimNotificationPayload {
  claimId: string;
  status: ClaimStatus;
  farmerEmail?: string;
  payoutCents?: number;
}

export async function notifyClaimStatusChange(payload: ClaimNotificationPayload) {
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    new Notification("Claim status updated", { body: `Claim ${payload.claimId} is now ${payload.status.replaceAll("_", " ")}.` });
  }
  await fetch("/api/v1/claims/notifications/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => undefined);
}

export async function notifyPayout(payload: ClaimNotificationPayload) {
  await fetch("/api/v1/claims/notifications/payout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => undefined);
}
