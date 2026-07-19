export const REVERT_MESSAGES: Record<string, string> = {
  InsufficientAllowance: "Please approve token spending before continuing.",
  InsufficientBalance: "Your wallet balance is too low for this transaction.",
  SlippageExceeded: "The quoted price changed. Review the amount and try again.",
  Unauthorized: "Your wallet is not authorized to perform this action.",
  GasTooLow: "Network fees were too low. Retrying with a higher gas limit.",
};

export function parseRevertReason(error: unknown): string | null {
  const candidates = [
    (error as { shortMessage?: string })?.shortMessage,
    (error as { reason?: string })?.reason,
    (error as { message?: string })?.message,
    (error as { data?: { message?: string } })?.data?.message,
  ].filter(Boolean) as string[];
  const text = candidates.join(" ");
  const match = text.match(/(?:reverted with reason string|execution reverted:?|revert(?:ed)?):?\s*['\"]?([A-Za-z0-9_ -]+)/i);
  return (match?.[1] ?? text).trim() || null;
}

export function mapWeb3Error(error: unknown, locale = "en"): string {
  const reason = parseRevertReason(error);
  if (!reason) return "Transaction failed. Please try again.";
  const key = Object.keys(REVERT_MESSAGES).find((candidate) => reason.includes(candidate));
  if (key) return REVERT_MESSAGES[key];
  if ((error as { code?: number })?.code === 4001) return "Transaction rejected in wallet.";
  if (locale !== "en") return `Transaction failed: ${reason}`;
  return `Transaction failed: ${reason}`;
}
