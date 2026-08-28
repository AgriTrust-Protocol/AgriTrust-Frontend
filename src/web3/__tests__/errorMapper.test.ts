// @vitest-environment node
import { describe, it, expect } from "vitest";
import { mapWeb3Error } from "../errorMapper";

describe("mapWeb3Error (issue #167)", () => {
  it("maps a user-rejected request (EIP-1193 code 4001)", () => {
    expect(mapWeb3Error({ code: 4001, message: "User rejected the request." })).toMatch(/declined/i);
  });

  it("maps an unrecognized-chain error (code 4902)", () => {
    expect(mapWeb3Error({ code: 4902 })).toMatch(/network isn't added/i);
  });

  it("maps a known ERC20 revert reason to a friendly string", () => {
    const error = new Error("execution reverted: ERC20: transfer amount exceeds balance");
    expect(mapWeb3Error(error)).toMatch(/enough tokens/i);
  });

  it("maps insufficient funds", () => {
    expect(mapWeb3Error(new Error("insufficient funds for gas * price + value"))).toMatch(/insufficient balance/i);
  });

  it("maps nonce too low", () => {
    expect(mapWeb3Error(new Error("nonce too low"))).toMatch(/conflicts with another pending/i);
  });

  it("falls back to the raw message for an unrecognized plain Error", () => {
    expect(mapWeb3Error(new Error("some totally novel failure"))).toBe("some totally novel failure");
  });

  it("falls back to a generic message for a non-Error value", () => {
    expect(mapWeb3Error("not an error object")).toMatch(/something went wrong/i);
  });
});
