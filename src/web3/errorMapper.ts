import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

/**
 * Translates a raw error thrown during wallet connection, chain switching,
 * gas estimation, or transaction submission into a short, user-facing
 * message. Kept framework/i18n-agnostic (plain English strings) — hook
 * these keys into `src/services/i18n` if/when this UI needs translation;
 * out of scope for this pass given the size of that catalog.
 */
export function mapWeb3Error(error: unknown): string {
  const revertReason = extractRevertReason(error) ?? extractRevertReasonFromMessage(error);
  if (revertReason) return mapRevertReason(revertReason);

  if (isUserRejection(error)) {
    return "You declined the request in your wallet.";
  }

  const code = (error as { code?: number } | undefined)?.code;
  if (code === 4902) return "That network isn't added to your wallet yet.";
  if (code === -32603) return "Your wallet rejected the transaction. Check your balance and try again.";

  if (error instanceof BaseError) {
    // viem's shortMessage is already reasonably user-facing (no stack trace, no ABI dump).
    return error.shortMessage || "Something went wrong with that transaction.";
  }

  if (error instanceof Error) {
    if (/insufficient funds/i.test(error.message)) {
      return "Insufficient balance to cover this transaction and gas.";
    }
    if (/nonce too low/i.test(error.message)) {
      return "This transaction conflicts with another pending one. Please try again.";
    }
    if (/gas required exceeds allowance|out of gas/i.test(error.message)) {
      return "This transaction ran out of gas. Try increasing the gas limit.";
    }
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

function isUserRejection(error: unknown): boolean {
  if (error instanceof UserRejectedRequestError) return true;
  const code = (error as { code?: number } | undefined)?.code;
  return code === 4001;
}

/** Pulls a Solidity `require`/`revert` reason string out of a viem contract-call error, if present. */
function extractRevertReason(error: unknown): string | null {
  if (!(error instanceof BaseError)) return null;
  const revertError = error.walk((e) => e instanceof ContractFunctionRevertedError);
  if (revertError instanceof ContractFunctionRevertedError) {
    return revertError.data?.errorName ?? revertError.reason ?? revertError.shortMessage ?? null;
  }
  return null;
}

/**
 * Fallback for the common case in this codebase: TransactionManager and
 * multicall.ts call `provider.request({ method: "eth_sendTransaction", ... })`
 * directly against the wallet's raw EIP-1193 provider, not through viem's
 * contract-write helpers — so real failures surface as plain JSON-RPC error
 * objects/strings (e.g. `"execution reverted: ERC20: transfer amount
 * exceeds balance"`), not `ContractFunctionRevertedError` instances. This
 * pulls the reason out of that plain text instead.
 */
function extractRevertReasonFromMessage(error: unknown): string | null {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : null;
  if (!message) return null;

  const match = message.match(/(?:execution reverted:?|revert(?:ed)?:?)\s*(.+)/i);
  return match?.[1]?.trim() || null;
}

const KNOWN_REVERT_REASONS: Record<string, string> = {
  "ERC20: transfer amount exceeds balance": "You don't have enough tokens for this transfer.",
  "ERC20: insufficient allowance": "This contract isn't approved to spend enough of your tokens yet.",
  "ERC20: transfer amount exceeds allowance": "This contract isn't approved to spend enough of your tokens yet.",
  "Ownable: caller is not the owner": "You don't have permission to perform this action.",
  Paused: "This contract is currently paused.",
};

function mapRevertReason(reason: string): string {
  return KNOWN_REVERT_REASONS[reason] ?? `Transaction reverted: ${reason}`;
}
