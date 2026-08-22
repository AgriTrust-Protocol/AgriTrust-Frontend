export type ClaimNotificationEvent = "status_changed" | "payout_issued";

export interface ClaimNotification {
  claimId: string;
  event: ClaimNotificationEvent;
  status?: string;
  amount?: string;
}

/** Sends browser push feedback now and leaves server delivery configurable. */
export async function notifyClaim(event: ClaimNotification): Promise<void> {
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    const title = event.event === "payout_issued" ? "Your claim was paid" : "Claim status updated";
    new Notification(title, { body: `Claim ${event.claimId}${event.status ? ` is ${event.status.replaceAll("_", " ")}` : ""}.` });
  }
  const endpoint = process.env.NEXT_PUBLIC_CLAIMS_NOTIFICATION_URL;
  if (endpoint) {
    await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event) });
  }
}