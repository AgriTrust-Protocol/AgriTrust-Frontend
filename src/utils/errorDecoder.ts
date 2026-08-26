/**
 * errorDecoder.ts
 *
 * Translates raw Stellar/Freighter/Soroban/RPC errors into user-friendly
 * messages with a title, description, actionable guidance, and severity.
 *
 * Usage (synchronous try/catch):
 *   try { ... } catch (e) { const t = decodeError(e); showToast(t); }
 *
 * Usage (Promise rejection):
 *   somePromise.catch(e => { throw new DecodedError(e); });
 */

// ─── Interfaces ─────────────────────────────────────────────────────────────

export type ErrorSeverity = "info" | "warning" | "error" | "critical";

export interface TranslatedError {
  /** Short title shown as the toast/modal heading, e.g. "Insufficient Balance" */
  title: string;
  /** 1–2 sentence description of what went wrong. */
  description: string;
  /** Recoverable action text, e.g. "Add funds to your wallet and retry." */
  action: string;
  /** Visual severity level for colour coding. */
  severity: ErrorSeverity;
  /** Original raw error string, preserved for developer copy-paste. */
  raw?: string;
}

// ─── Error Map ───────────────────────────────────────────────────────────────

/**
 * Each entry is a factory so future entries can include dynamic details
 * extracted from the original error (e.g. amounts, addresses).
 */
const errorMap: Record<string, (details?: string) => TranslatedError> = {
  // ── Stellar transaction result codes ─────────────────────────────────────
  tx_bad_seq: () => ({
    title: "Transaction Sequence Error",
    description: "Your wallet's transaction counter is out of sync with the network.",
    action: "Switch to a different account or wait 30 seconds and retry.",
    severity: "warning",
  }),
  tx_bad_auth: () => ({
    title: "Authentication Failed",
    description: "The transaction was not signed correctly by the required keys.",
    action: "Ensure you are using the correct wallet account and try signing again.",
    severity: "error",
  }),
  tx_insufficient_balance: () => ({
    title: "Insufficient Balance",
    description: "Your account does not have enough XLM to cover the transaction and the minimum reserve.",
    action: "Add XLM to your wallet and retry the transaction.",
    severity: "warning",
  }),
  tx_insufficient_fee: () => ({
    title: "Fee Too Low",
    description: "The fee you set is below the current network minimum.",
    action: "Increase the transaction fee in your wallet settings and retry.",
    severity: "warning",
  }),
  tx_bad_auth_extra: () => ({
    title: "Extra Signatures Detected",
    description: "The transaction contains more signatures than allowed.",
    action: "Remove extra signers and submit the transaction again.",
    severity: "error",
  }),
  tx_internal_error: () => ({
    title: "Network Internal Error",
    description: "The Stellar network encountered an internal error processing your transaction.",
    action: "Wait a few moments and try again. If it persists, contact support.",
    severity: "critical",
  }),
  tx_not_supported: () => ({
    title: "Transaction Not Supported",
    description: "This transaction type is not supported by the current network version.",
    action: "Ensure you are connected to the correct Stellar network (mainnet vs. testnet).",
    severity: "error",
  }),
  tx_fee_bump_inner_failed: () => ({
    title: "Fee Bump Failed",
    description: "The inner transaction in the fee bump failed to execute.",
    action: "Check the inner transaction details and retry.",
    severity: "error",
  }),
  tx_too_late: () => ({
    title: "Transaction Expired",
    description: "The transaction's time bounds have passed and it is no longer valid.",
    action: "Reconstruct and resign the transaction with updated time bounds.",
    severity: "warning",
  }),
  tx_too_early: () => ({
    title: "Transaction Not Yet Valid",
    description: "The transaction's earliest valid time has not been reached.",
    action: "Wait until the scheduled time and resubmit.",
    severity: "info",
  }),
  tx_missing_operation: () => ({
    title: "Missing Operation",
    description: "The transaction contains no operations.",
    action: "Add at least one operation to the transaction and retry.",
    severity: "error",
  }),

  // ── Stellar operation result codes ────────────────────────────────────────
  op_underfunded: () => ({
    title: "Insufficient Balance",
    description: "The source account does not have enough tokens for this operation.",
    action: "Add tokens to your wallet and retry.",
    severity: "warning",
  }),
  op_low_reserve: () => ({
    title: "Minimum Reserve Not Met",
    description: "This operation would push your balance below the minimum XLM reserve required by Stellar.",
    action: "Add more XLM to your account before proceeding.",
    severity: "warning",
  }),
  op_bad_auth: () => ({
    title: "Operation Authentication Failed",
    description: "The operation does not have sufficient signers to authorise it.",
    action: "Sign the operation with the correct key and retry.",
    severity: "error",
  }),
  op_no_account: () => ({
    title: "Account Not Found",
    description: "The destination account does not exist on the Stellar network.",
    action: "Verify the destination address and ensure it has been funded (minimum 1 XLM).",
    severity: "error",
  }),
  op_no_trust: () => ({
    title: "No Trustline",
    description: "The destination account has not established a trustline for this asset.",
    action: "Ask the recipient to add a trustline for this asset before retrying.",
    severity: "warning",
  }),
  op_line_full: () => ({
    title: "Trustline Limit Reached",
    description: "The destination account's trustline for this asset is full.",
    action: "The recipient must increase their trustline limit or clear existing balance.",
    severity: "warning",
  }),
  op_not_authorized: () => ({
    title: "Operation Not Authorized",
    description: "This account is not authorized to operate with the requested asset.",
    action: "Contact the asset issuer to request authorization.",
    severity: "error",
  }),
  op_buy_not_authorized: () => ({
    title: "Asset Purchase Not Authorized",
    description: "Your account is not authorized to buy this asset.",
    action: "Contact the asset issuer to obtain the necessary authorization.",
    severity: "error",
  }),
  op_sell_no_trust: () => ({
    title: "No Sell Trustline",
    description: "No trustline exists for the asset you are trying to sell.",
    action: "Establish a trustline for the asset before attempting to sell.",
    severity: "warning",
  }),

  // ── Soroban / smart contract errors ───────────────────────────────────────
  "contract_error_1": () => ({
    title: "Contract Unauthorized",
    description: "The contract call was rejected because the caller lacks the required permissions.",
    action: "Ensure your wallet address has the necessary role in the escrow contract.",
    severity: "error",
  }),
  "contract_error_2": () => ({
    title: "Contract Invalid State",
    description: "The contract is in an invalid state for this operation.",
    action: "Verify that all prerequisite contract steps have been completed.",
    severity: "error",
  }),
  "contract_error_3": () => ({
    title: "Contract Not Found",
    description: "The requested smart contract was not found on the network.",
    action: "Confirm the contract ID and network (mainnet/testnet) are correct.",
    severity: "error",
  }),
  "contract_error_4": () => ({
    title: "Contract Already Initialized",
    description: "This contract has already been initialized and cannot be re-initialized.",
    action: "Use the existing contract instance or deploy a new one.",
    severity: "warning",
  }),
  "contract_error_5": () => ({
    title: "Contract Insufficient Funds",
    description: "The contract escrow does not hold sufficient funds for this disbursement.",
    action: "Deposit the required amount into the escrow contract and retry.",
    severity: "warning",
  }),
  "contract_error_6": () => ({
    title: "Contract Deadline Passed",
    description: "The operation deadline specified in the contract has expired.",
    action: "Create a new escrow agreement with an updated deadline.",
    severity: "warning",
  }),
  "contract_error_7": () => ({
    title: "Contract Condition Unmet",
    description: "The release condition for this escrow payment has not been satisfied.",
    action: "Complete the required inspection or certification step, then retry.",
    severity: "info",
  }),
  "contract_error_8": () => ({
    title: "Contract Overflow",
    description: "The smart contract detected an arithmetic overflow with the provided values.",
    action: "Reduce the input amount and try again.",
    severity: "error",
  }),
  "contract_error_9": () => ({
    title: "Contract Division by Zero",
    description: "The smart contract attempted a division by zero.",
    action: "Check that no percentage or weight input is set to zero.",
    severity: "error",
  }),
  "contract_error_10": () => ({
    title: "Contract Paused",
    description: "The contract has been temporarily paused by the administrator.",
    action: "Wait for the contract to be unpaused or contact the contract owner.",
    severity: "warning",
  }),

  // ── Freighter wallet errors ───────────────────────────────────────────────
  freighter_not_installed: () => ({
    title: "Freighter Not Installed",
    description: "The Freighter browser extension is not installed or not detected.",
    action: "Install the Freighter extension from freighter.app and reload the page.",
    severity: "error",
  }),
  freighter_user_rejected: () => ({
    title: "Transaction Rejected",
    description: "You rejected the transaction request in your Freighter wallet.",
    action: "Re-initiate the operation and approve the request in Freighter.",
    severity: "info",
  }),
  freighter_network_mismatch: () => ({
    title: "Network Mismatch",
    description: "Your Freighter wallet is connected to a different Stellar network than the app expects.",
    action: "Open Freighter and switch to the correct network (mainnet or testnet).",
    severity: "warning",
  }),
  freighter_connection_failed: () => ({
    title: "Wallet Connection Failed",
    description: "Could not establish a connection to the Freighter wallet.",
    action: "Unlock your Freighter wallet and try connecting again.",
    severity: "error",
  }),

  // ── MetaMask / EVM wallet errors ──────────────────────────────────────────
  metamask_user_rejected: () => ({
    title: "Transaction Rejected",
    description: "You rejected the transaction request in MetaMask.",
    action: "Re-initiate the operation and approve the request in MetaMask.",
    severity: "info",
  }),
  metamask_not_installed: () => ({
    title: "MetaMask Not Installed",
    description: "The MetaMask browser extension is not installed or not detected.",
    action: "Install MetaMask from metamask.io and reload the page.",
    severity: "error",
  }),
  "4001": () => ({
    title: "Request Rejected by User",
    description: "The wallet request was rejected by the user.",
    action: "Re-initiate the operation and approve it in your wallet.",
    severity: "info",
  }),
  "-32002": () => ({
    title: "Request Already Pending",
    description: "A wallet request is already waiting for your approval.",
    action: "Open your wallet extension and approve or reject the pending request.",
    severity: "warning",
  }),
  "-32603": () => ({
    title: "Wallet Internal Error",
    description: "The wallet encountered an internal error processing your request.",
    action: "Reload the page, reconnect your wallet, and retry.",
    severity: "error",
  }),

  // ── Soroban RPC / network errors ──────────────────────────────────────────
  simulate_failed: () => ({
    title: "Simulation Failed",
    description: "The transaction simulation failed before it was submitted to the network.",
    action: "Check the contract inputs and ensure your account has sufficient balance.",
    severity: "error",
  }),
  send_failed: () => ({
    title: "Transaction Submission Failed",
    description: "The transaction could not be submitted to the Soroban RPC endpoint.",
    action: "Check your network connection and retry. If the problem persists, try a different RPC endpoint.",
    severity: "error",
  }),
  rpc_timeout: () => ({
    title: "RPC Timeout",
    description: "The request to the Soroban RPC node timed out.",
    action: "Check your internet connection and try again.",
    severity: "warning",
  }),

  // ── Backend / API errors ──────────────────────────────────────────────────
  api_unauthorized: () => ({
    title: "Session Expired",
    description: "Your authentication session has expired.",
    action: "Sign in again to continue.",
    severity: "warning",
  }),
  api_forbidden: () => ({
    title: "Access Denied",
    description: "Your account does not have permission to perform this action.",
    action: "Contact your administrator to request the necessary permissions.",
    severity: "error",
  }),
  api_not_found: () => ({
    title: "Resource Not Found",
    description: "The requested resource could not be found.",
    action: "Verify the identifier is correct and try again.",
    severity: "warning",
  }),
  api_server_error: () => ({
    title: "Server Error",
    description: "The AgriTrust server encountered an unexpected error.",
    action: "Try again in a few minutes. If the problem persists, contact support.",
    severity: "critical",
  }),
  api_rate_limited: () => ({
    title: "Rate Limit Exceeded",
    description: "Too many requests have been made in a short period.",
    action: "Wait a minute and then retry your request.",
    severity: "warning",
  }),
};

// ─── Pattern Matchers ────────────────────────────────────────────────────────

/**
 * Ordered list of [test, mapKey] pairs. The first match wins.
 * Tests run against the lower-cased stringified error.
 */
const patternMatchers: Array<[(s: string) => boolean, string]> = [
  // Soroban ContractError with numeric code
  [(s) => /contracterror.*code[:\s]+8/.test(s), "contract_error_8"],
  [(s) => /contracterror.*code[:\s]+9/.test(s), "contract_error_9"],
  [(s) => /contracterror.*code[:\s]+10/.test(s), "contract_error_10"],
  [(s) => /contracterror.*code[:\s]+1\b/.test(s), "contract_error_1"],
  [(s) => /contracterror.*code[:\s]+2\b/.test(s), "contract_error_2"],
  [(s) => /contracterror.*code[:\s]+3\b/.test(s), "contract_error_3"],
  [(s) => /contracterror.*code[:\s]+4\b/.test(s), "contract_error_4"],
  [(s) => /contracterror.*code[:\s]+5\b/.test(s), "contract_error_5"],
  [(s) => /contracterror.*code[:\s]+6\b/.test(s), "contract_error_6"],
  [(s) => /contracterror.*code[:\s]+7\b/.test(s), "contract_error_7"],
  // Freighter
  [(s) => s.includes("freighter") && s.includes("not installed"), "freighter_not_installed"],
  [(s) => s.includes("freighter") && (s.includes("rejected") || s.includes("denied")), "freighter_user_rejected"],
  [(s) => s.includes("freighter") && s.includes("network"), "freighter_network_mismatch"],
  [(s) => s.includes("freighter") && s.includes("connect"), "freighter_connection_failed"],
  // MetaMask
  [(s) => s.includes("metamask") && s.includes("not installed"), "metamask_not_installed"],
  [(s) => (s.includes("metamask") || s.includes("ethereum")) && (s.includes("rejected") || s.includes("denied")), "metamask_user_rejected"],
  // Numeric EIP-1193 / JSON-RPC codes
  [(s) => s.includes("4001"), "4001"],
  [(s) => s.includes("-32002"), "-32002"],
  [(s) => s.includes("-32603"), "-32603"],
  // Soroban RPC
  [(s) => s.includes("simulate") && s.includes("fail"), "simulate_failed"],
  [(s) => s.includes("sendtransaction") && s.includes("fail"), "send_failed"],
  [(s) => s.includes("timeout") || s.includes("timed out"), "rpc_timeout"],
  // Backend API HTTP statuses
  [(s) => s.includes("401") || s.includes("unauthorized"), "api_unauthorized"],
  [(s) => s.includes("403") || s.includes("forbidden"), "api_forbidden"],
  [(s) => s.includes("404") || s.includes("not found"), "api_not_found"],
  [(s) => s.includes("429") || s.includes("rate limit"), "api_rate_limited"],
  [(s) => s.includes("500") || s.includes("server error") || s.includes("internal server"), "api_server_error"],
  // Stellar TX/OP codes (string keys from error.code or error.message)
  [(s) => s.includes("tx_bad_seq"), "tx_bad_seq"],
  [(s) => s.includes("tx_bad_auth") && !s.includes("extra"), "tx_bad_auth"],
  [(s) => s.includes("tx_bad_auth_extra"), "tx_bad_auth_extra"],
  [(s) => s.includes("tx_insufficient_balance"), "tx_insufficient_balance"],
  [(s) => s.includes("tx_insufficient_fee"), "tx_insufficient_fee"],
  [(s) => s.includes("tx_internal_error"), "tx_internal_error"],
  [(s) => s.includes("tx_not_supported"), "tx_not_supported"],
  [(s) => s.includes("tx_fee_bump_inner_failed"), "tx_fee_bump_inner_failed"],
  [(s) => s.includes("tx_too_late"), "tx_too_late"],
  [(s) => s.includes("tx_too_early"), "tx_too_early"],
  [(s) => s.includes("tx_missing_operation"), "tx_missing_operation"],
  [(s) => s.includes("op_underfunded"), "op_underfunded"],
  [(s) => s.includes("op_low_reserve"), "op_low_reserve"],
  [(s) => s.includes("op_bad_auth"), "op_bad_auth"],
  [(s) => s.includes("op_no_account"), "op_no_account"],
  [(s) => s.includes("op_no_trust"), "op_no_trust"],
  [(s) => s.includes("op_line_full"), "op_line_full"],
  [(s) => s.includes("op_not_authorized"), "op_not_authorized"],
  [(s) => s.includes("op_buy_not_authorized"), "op_buy_not_authorized"],
  [(s) => s.includes("op_sell_no_trust"), "op_sell_no_trust"],
];

// ─── Generic fallback ─────────────────────────────────────────────────────────

function genericError(raw: string): TranslatedError {
  return {
    title: "Unknown Error",
    description: "An unexpected error occurred. Please try again.",
    action: "Copy the error details and contact support if the problem persists.",
    severity: "error",
    raw,
  };
}

// ─── decodeError ─────────────────────────────────────────────────────────────

/**
 * Converts any thrown value into a {@link TranslatedError}.
 *
 * Resolution order:
 *  1. `error.code` — direct map lookup (string or numeric key).
 *  2. `error.message` — direct map lookup.
 *  3. Full stringified error — pattern-matcher sweep.
 *  4. Generic fallback with `raw` preserved.
 */
export function decodeError(error: unknown): TranslatedError {
  // `raw` is the full error string kept for developer copy-paste support.
  // `matchStr` is the shorter string used for pattern matching — it MUST NOT
  // include the call stack because runtimes (e.g. vitest) inject helpers like
  // `runWithTimeout` into stack frames, causing false positives.
  let raw: string;
  let matchStr: string;

  if (error instanceof Error) {
    raw = `${error.message} ${error.stack ?? ""}`.trim();
    // Match only against the message to avoid stack-trace false positives
    matchStr = error.message;
  } else if (typeof error === "string") {
    raw = error;
    matchStr = error;
  } else if (error == null) {
    raw = String(error);
    matchStr = raw;
  } else {
    try {
      raw = JSON.stringify(error);
    } catch {
      raw = String(error);
    }
    matchStr = raw;
  }

  const lower = matchStr.toLowerCase();

  // 1. Check error.code
  if (error != null && typeof error === "object" && "code" in error) {
    const code = String((error as Record<string, unknown>).code);
    if (code in errorMap) {
      return { ...errorMap[code](), raw };
    }
  }

  // 2. Check error.message
  if (error instanceof Error && error.message in errorMap) {
    return { ...errorMap[error.message](), raw };
  }

  // 3. Pattern sweep over the full stringified error
  for (const [test, key] of patternMatchers) {
    if (test(lower)) {
      return { ...errorMap[key](), raw };
    }
  }

  // 4. Generic fallback
  return genericError(raw);
}

// ─── DecodedError class ───────────────────────────────────────────────────────

/**
 * A re-throwable Error that carries the translated message alongside the
 * original so catch blocks and error boundaries can render user-friendly UI.
 *
 * @example
 * try {
 *   await sendTransaction(xdr);
 * } catch (e) {
 *   throw new DecodedError(e instanceof Error ? e : new Error(String(e)));
 * }
 */
export class DecodedError extends Error {
  readonly translated: TranslatedError;
  readonly original: Error;

  constructor(original: Error) {
    const translated = decodeError(original);
    super(translated.title);
    this.name = "DecodedError";
    this.translated = translated;
    this.original = original;
    // Maintain proper prototype chain in transpiled environments
    Object.setPrototypeOf(this, DecodedError.prototype);
  }
}
