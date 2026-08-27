/**
 * errorDecoder.test.ts
 *
 * Unit tests for the Stellar / Freighter / Soroban error translation module.
 *
 * Covers:
 *  - All 30+ named error map entries
 *  - Direct code lookup (error.code)
 *  - Direct message lookup (error.message)
 *  - Pattern matching (string/message contents)
 *  - ContractError numeric codes
 *  - Generic fallback for unrecognised errors
 *  - DecodedError class
 *  - Non-Error thrown values (string, plain object, null)
 */

import { describe, it, expect } from "vitest";
import { decodeError, DecodedError } from "@/src/utils/errorDecoder";
import type { TranslatedError } from "@/src/utils/errorDecoder";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Creates an Error with a `.code` property (mimics Stellar SDK style). */
function errorWithCode(code: string, message = ""): Error & { code: string } {
  const e = new Error(message || code) as Error & { code: string };
  e.code = code;
  return e;
}

/** Asserts that a TranslatedError is valid (non-empty required fields). */
function assertValid(t: TranslatedError, label: string) {
  expect(t.title, `${label} — title must be non-empty`).toBeTruthy();
  expect(t.description, `${label} — description must be non-empty`).toBeTruthy();
  expect(t.action, `${label} — action must be non-empty`).toBeTruthy();
  expect(
    ["info", "warning", "error", "critical"],
    `${label} — severity must be valid`,
  ).toContain(t.severity);
}

// ─── Stellar transaction error codes ─────────────────────────────────────────

describe("decodeError — Stellar transaction codes", () => {
  const txCodes: Array<[string, string]> = [
    ["tx_bad_seq", "Transaction Sequence Error"],
    ["tx_bad_auth", "Authentication Failed"],
    ["tx_insufficient_balance", "Insufficient Balance"],
    ["tx_insufficient_fee", "Fee Too Low"],
    ["tx_bad_auth_extra", "Extra Signatures Detected"],
    ["tx_internal_error", "Network Internal Error"],
    ["tx_not_supported", "Transaction Not Supported"],
    ["tx_fee_bump_inner_failed", "Fee Bump Failed"],
    ["tx_too_late", "Transaction Expired"],
    ["tx_too_early", "Transaction Not Yet Valid"],
    ["tx_missing_operation", "Missing Operation"],
  ];

  for (const [code, expectedTitle] of txCodes) {
    it(`decodes error with code="${code}" → "${expectedTitle}"`, () => {
      const result = decodeError(errorWithCode(code));
      assertValid(result, code);
      expect(result.title).toBe(expectedTitle);
    });

    it(`decodes error whose message contains "${code}"`, () => {
      const result = decodeError(new Error(`TransactionError: ${code}`));
      assertValid(result, `message:${code}`);
      expect(result.title).toBe(expectedTitle);
    });
  }
});

// ─── Stellar operation error codes ───────────────────────────────────────────

describe("decodeError — Stellar operation codes", () => {
  const opCodes: Array<[string, string]> = [
    ["op_underfunded", "Insufficient Balance"],
    ["op_low_reserve", "Minimum Reserve Not Met"],
    ["op_bad_auth", "Operation Authentication Failed"],
    ["op_no_account", "Account Not Found"],
    ["op_no_trust", "No Trustline"],
    ["op_line_full", "Trustline Limit Reached"],
    ["op_not_authorized", "Operation Not Authorized"],
    ["op_buy_not_authorized", "Asset Purchase Not Authorized"],
    ["op_sell_no_trust", "No Sell Trustline"],
  ];

  for (const [code, expectedTitle] of opCodes) {
    it(`decodes error with code="${code}" → "${expectedTitle}"`, () => {
      const result = decodeError(errorWithCode(code));
      assertValid(result, code);
      expect(result.title).toBe(expectedTitle);
    });

    it(`decodes error whose message contains "${code}"`, () => {
      const result = decodeError(new Error(`OperationError: ${code}`));
      assertValid(result, `message:${code}`);
      expect(result.title).toBe(expectedTitle);
    });
  }
});

// ─── Soroban ContractError numeric codes ─────────────────────────────────────

describe("decodeError — ContractError numeric codes", () => {
  const contractErrors: Array<[number, string]> = [
    [1, "Contract Unauthorized"],
    [2, "Contract Invalid State"],
    [3, "Contract Not Found"],
    [4, "Contract Already Initialized"],
    [5, "Contract Insufficient Funds"],
    [6, "Contract Deadline Passed"],
    [7, "Contract Condition Unmet"],
    [8, "Contract Overflow"],
    [9, "Contract Division by Zero"],
    [10, "Contract Paused"],
  ];

  for (const [code, expectedTitle] of contractErrors) {
    it(`decodes ContractError({ code: ${code} }) → "${expectedTitle}"`, () => {
      const msg = `ContractError(ContractError { code: ${code}, msg: "some error" })`;
      const result = decodeError(new Error(msg));
      assertValid(result, `ContractError(${code})`);
      expect(result.title).toBe(expectedTitle);
    });

    it(`decodes string "contracterror code: ${code}" → "${expectedTitle}"`, () => {
      const result = decodeError(`ContractError code: ${code}`);
      assertValid(result, `string ContractError(${code})`);
      expect(result.title).toBe(expectedTitle);
    });
  }

  it("decodes overflow via code=8 property on error object", () => {
    const err = errorWithCode("contract_error_8", "overflow");
    const result = decodeError(err);
    assertValid(result, "contract_error_8 code property");
    expect(result.title).toBe("Contract Overflow");
  });
});

// ─── Freighter wallet errors ──────────────────────────────────────────────────

describe("decodeError — Freighter wallet errors", () => {
  it("detects freighter_not_installed", () => {
    const result = decodeError(new Error("Freighter is not installed"));
    assertValid(result, "freighter_not_installed");
    expect(result.title).toBe("Freighter Not Installed");
    expect(result.severity).toBe("error");
  });

  it("detects freighter_user_rejected", () => {
    const result = decodeError(new Error("User rejected the Freighter request"));
    assertValid(result, "freighter_user_rejected");
    expect(result.title).toBe("Transaction Rejected");
    expect(result.severity).toBe("info");
  });

  it("detects freighter_network_mismatch", () => {
    const result = decodeError(new Error("Freighter network mismatch detected"));
    assertValid(result, "freighter_network_mismatch");
    expect(result.title).toBe("Network Mismatch");
    expect(result.severity).toBe("warning");
  });

  it("detects freighter_connection_failed", () => {
    const result = decodeError(new Error("Could not connect to Freighter extension"));
    assertValid(result, "freighter_connection_failed");
    expect(result.title).toBe("Wallet Connection Failed");
  });

  it("decodes via error.code = 'freighter_not_installed'", () => {
    const result = decodeError(errorWithCode("freighter_not_installed"));
    assertValid(result, "freighter_not_installed code");
    expect(result.title).toBe("Freighter Not Installed");
  });
});

// ─── MetaMask / EVM errors ────────────────────────────────────────────────────

describe("decodeError — MetaMask / EVM errors", () => {
  it("detects metamask_user_rejected from message", () => {
    const result = decodeError(new Error("MetaMask: User denied transaction signature"));
    assertValid(result, "metamask_user_rejected");
    expect(result.title).toBe("Transaction Rejected");
  });

  it("detects metamask_not_installed", () => {
    const result = decodeError(new Error("MetaMask not installed in this browser"));
    assertValid(result, "metamask_not_installed");
    expect(result.title).toBe("MetaMask Not Installed");
  });

  it("decodes EIP-1193 code 4001 (user rejected)", () => {
    const err = errorWithCode("4001", "User rejected the request");
    const result = decodeError(err);
    assertValid(result, "4001");
    expect(result.title).toBe("Request Rejected by User");
    expect(result.severity).toBe("info");
  });

  it("decodes JSON-RPC error code -32002 from message", () => {
    const result = decodeError(new Error("Request pending: -32002"));
    assertValid(result, "-32002");
    expect(result.title).toBe("Request Already Pending");
    expect(result.severity).toBe("warning");
  });

  it("decodes JSON-RPC error code -32603 from error.code", () => {
    const err = errorWithCode("-32603", "Internal JSON-RPC error");
    const result = decodeError(err);
    assertValid(result, "-32603");
    expect(result.title).toBe("Wallet Internal Error");
  });
});

// ─── Soroban RPC errors ───────────────────────────────────────────────────────

describe("decodeError — Soroban RPC errors", () => {
  it("detects simulate_failed", () => {
    const result = decodeError(new Error("simulateTransaction failed: contract error"));
    assertValid(result, "simulate_failed");
    expect(result.title).toBe("Simulation Failed");
  });

  it("detects send_failed", () => {
    const result = decodeError(new Error("sendTransaction failed with status ERROR"));
    assertValid(result, "send_failed");
    expect(result.title).toBe("Transaction Submission Failed");
  });

  it("detects rpc_timeout", () => {
    const result = decodeError(new Error("RPC request timed out after 30000ms"));
    assertValid(result, "rpc_timeout");
    expect(result.title).toBe("RPC Timeout");
    expect(result.severity).toBe("warning");
  });

  it("decodes via error.code = 'rpc_timeout'", () => {
    const result = decodeError(errorWithCode("rpc_timeout"));
    assertValid(result, "rpc_timeout code");
    expect(result.title).toBe("RPC Timeout");
  });
});

// ─── Backend / API errors ─────────────────────────────────────────────────────

describe("decodeError — Backend API errors", () => {
  it("detects api_unauthorized from 401 in message", () => {
    const result = decodeError(new Error("HTTP 401 Unauthorized"));
    assertValid(result, "api_unauthorized");
    expect(result.title).toBe("Session Expired");
    expect(result.severity).toBe("warning");
  });

  it("detects api_forbidden from 403 in message", () => {
    const result = decodeError(new Error("HTTP 403 Forbidden"));
    assertValid(result, "api_forbidden");
    expect(result.title).toBe("Access Denied");
  });

  it("detects api_not_found from 404 in message", () => {
    const result = decodeError(new Error("HTTP 404 Not Found"));
    assertValid(result, "api_not_found");
    expect(result.title).toBe("Resource Not Found");
  });

  it("detects api_rate_limited from 429 in message", () => {
    const result = decodeError(new Error("HTTP 429 Rate Limit exceeded"));
    assertValid(result, "api_rate_limited");
    expect(result.title).toBe("Rate Limit Exceeded");
  });

  it("detects api_server_error from 500 in message", () => {
    const result = decodeError(new Error("HTTP 500 Internal Server Error"));
    assertValid(result, "api_server_error");
    expect(result.title).toBe("Server Error");
    expect(result.severity).toBe("critical");
  });

  it("decodes via error.code = 'api_unauthorized'", () => {
    const result = decodeError(errorWithCode("api_unauthorized"));
    assertValid(result, "api_unauthorized code");
    expect(result.title).toBe("Session Expired");
  });
});

// ─── Generic fallback ─────────────────────────────────────────────────────────

describe("decodeError — generic fallback", () => {
  it("returns Unknown Error for an unrecognised Error", () => {
    const result = decodeError(new Error("some completely unknown failure xyz123"));
    assertValid(result, "generic unknown error");
    expect(result.title).toBe("Unknown Error");
    expect(result.action).toContain("support");
    expect(result.severity).toBe("error");
  });

  it("preserves raw error string in the fallback", () => {
    const msg = "very unique unmatched error message 🦄";
    const result = decodeError(new Error(msg));
    expect(result.raw).toContain(msg);
  });

  it("handles a thrown string", () => {
    const result = decodeError("plain string error");
    assertValid(result, "thrown string");
    expect(result.title).toBe("Unknown Error");
    expect(result.raw).toBe("plain string error");
  });

  it("handles a thrown plain object", () => {
    const result = decodeError({ message: "unknown object error" });
    assertValid(result, "thrown object");
    expect(result.title).toBe("Unknown Error");
  });

  it("handles null", () => {
    const result = decodeError(null);
    assertValid(result, "null");
    expect(result.title).toBe("Unknown Error");
  });

  it("handles undefined", () => {
    const result = decodeError(undefined);
    assertValid(result, "undefined");
    expect(result.title).toBe("Unknown Error");
  });
});

// ─── DecodedError class ───────────────────────────────────────────────────────

describe("DecodedError", () => {
  it("wraps an Error and exposes .translated", () => {
    const original = new Error("tx_bad_seq");
    const decoded = new DecodedError(original);
    expect(decoded).toBeInstanceOf(Error);
    expect(decoded).toBeInstanceOf(DecodedError);
    expect(decoded.name).toBe("DecodedError");
    expect(decoded.translated.title).toBe("Transaction Sequence Error");
    expect(decoded.original).toBe(original);
  });

  it("message is the translated title", () => {
    const decoded = new DecodedError(new Error("op_underfunded"));
    expect(decoded.message).toBe("Insufficient Balance");
  });

  it("instanceof check works correctly in catch blocks", () => {
    let caught: unknown;
    try {
      throw new DecodedError(new Error("freighter_user_rejected"));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(DecodedError);
    const decoded = caught as DecodedError;
    expect(decoded.translated.severity).toBe("info");
  });

  it("correctly identifies an error re-thrown as DecodedError", () => {
    const original = errorWithCode("tx_insufficient_fee", "fee too low");
    const decoded = new DecodedError(original);
    expect(decoded.translated.title).toBe("Fee Too Low");
    expect(decoded.translated.severity).toBe("warning");
  });
});

// ─── Both sync and async usage ────────────────────────────────────────────────

describe("decodeError — async usage (Promise rejection)", () => {
  it("works inside a .catch handler", async () => {
    const failing = Promise.reject(new Error("tx_too_late"));
    const result = await failing.catch((e: unknown) => decodeError(e));
    expect(result.title).toBe("Transaction Expired");
  });

  it("works with async/await try-catch", async () => {
    async function failingOp() {
      throw new Error("op_line_full");
    }

    let translated;
    try {
      await failingOp();
    } catch (e) {
      translated = decodeError(e);
    }

    expect(translated?.title).toBe("Trustline Limit Reached");
  });
});

// ─── Severity distribution sanity check ──────────────────────────────────────

describe("decodeError — severity distribution", () => {
  it("at least 2 codes produce 'info' severity", () => {
    const infoCodes = [
      new Error("tx_too_early"),
      new Error("freighter_user_rejected"),
    ];
    const results = infoCodes.map(decodeError);
    expect(results.filter((r) => r.severity === "info").length).toBeGreaterThanOrEqual(2);
  });

  it("at least 5 codes produce 'warning' severity", () => {
    const warnCodes = [
      new Error("tx_bad_seq"),
      new Error("tx_insufficient_balance"),
      new Error("tx_insufficient_fee"),
      new Error("op_underfunded"),
      new Error("op_low_reserve"),
    ];
    const results = warnCodes.map(decodeError);
    expect(results.filter((r) => r.severity === "warning").length).toBeGreaterThanOrEqual(5);
  });

  it("at least 2 codes produce 'critical' severity", () => {
    const critCodes = [
      new Error("tx_internal_error"),
      new Error("HTTP 500 Internal Server Error"),
    ];
    const results = critCodes.map(decodeError);
    expect(results.filter((r) => r.severity === "critical").length).toBeGreaterThanOrEqual(2);
  });
});
