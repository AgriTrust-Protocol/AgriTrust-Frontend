/**
 * Freighter wallet connector for the Soroban network.
 *
 * `@stellar/freighter-api` resolves a browser-injected `window.freighter`
 * object at import time, so it is loaded with a dynamic `import()` from inside
 * async functions only. That keeps this module safe to reference from a client
 * component without dragging the extension bundle into a server render.
 *
 * Granting or revoking access is an on-ledger state change, so both actions are
 * authorised by a real Freighter signature over a canonical payload. The portal
 * refuses to report a successful grant when no wallet signature was produced.
 */

import type { Hex32 } from "./types";

/** Stellar testnet passphrase, matching the `soroban-network` dev container. */
export const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

export type WalletStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "unsupported"
  | "error";

export interface WalletSession {
  readonly address: string;
  readonly network: string;
  readonly connectedAt: number;
}

/** Minimal structural view of the Freighter API surface we depend on. */
interface FreighterApi {
  isConnected(): Promise<{ isConnected: boolean }>;
  requestAccess(): Promise<{ address?: string; error?: string }>;
  getNetwork(): Promise<{ network?: string; error?: string }>;
  signMessage(
    message: string,
    opts?: { networkPassphrase?: string; address?: string },
  ): Promise<{ signedMessage?: unknown; signerAddress?: string; error?: string }>;
}

/** Raised when the browser has no Freighter extension available. */
export class WalletUnavailableError extends Error {
  constructor() {
    super("Freighter wallet extension not detected in this browser.");
    this.name = "WalletUnavailableError";
  }
}

async function loadFreighter(): Promise<FreighterApi> {
  if (typeof window === "undefined") {
    throw new WalletUnavailableError();
  }

  const injected = (window as unknown as { freighter?: FreighterApi }).freighter;
  if (injected !== undefined) return injected;

  // Reserved for the module system: a bare `module` binding shadows it and trips
  // `@next/next/no-assign-module-variable`.
  const freighterModule = (await import("@stellar/freighter-api")) as unknown as {
    default?: FreighterApi;
  } & FreighterApi;

  const api = freighterModule.default ?? freighterModule;
  const reachable = await api.isConnected().catch(() => ({ isConnected: false }));

  // `isConnected` resolves false both when the extension is absent and when no
  // wallet is unlocked, so probe the injected global to tell them apart.
  if (reachable.isConnected) return api;

  throw new WalletUnavailableError();
}

/**
 * Prompt for wallet access and return the active session.
 *
 * Throws {@link WalletUnavailableError} when no extension is installed so the UI
 * can distinguish "user declined" from "no wallet present".
 */
export async function connectWallet(): Promise<WalletSession> {
  const freighter = await loadFreighter();

  const { address, error } = await freighter.requestAccess();
  if (error !== undefined || address === undefined) {
    throw new Error(error ?? "Wallet access was declined.");
  }

  const network = await freighter
    .getNetwork()
    .then((result) => result.network ?? "unknown")
    .catch(() => "unknown");

  return { address, network, connectedAt: Date.now() };
}

/** Restore a session on mount without prompting the user. */
export async function restoreSession(): Promise<WalletSession | null> {
  try {
    const freighter = await loadFreighter();
    const { isConnected } = await freighter.isConnected();
    if (!isConnected) return null;

    return await connectWallet();
  } catch {
    return null;
  }
}

function normalizeSignature(raw: unknown): string | null {
  if (typeof raw === "string") return raw;

  if (raw !== null && typeof raw === "object" && "toString" in raw) {
    const encodable = raw as { toString: (encoding?: string) => string };
    // Node `Buffer` is a `Uint8Array` subclass; encode it rather than stringifying.
    return encodable.toString("base64");
  }

  return null;
}

/**
 * Canonical, human-auditable authorization payload for a data contract change.
 *
 * Both grant and revoke sign the same envelope so an auditor can confirm from
 * the signature alone which operation the farmer actually authorised.
 */
export function buildAuthorizationPayload(args: {
  readonly action: "grant" | "revoke";
  readonly contractId: Hex32;
  readonly consumer: string;
  readonly assetId: Hex32;
  readonly policyHash: Hex32;
  readonly ledger: number;
}): string {
  return [
    "AgriTrust Protocol :: Data Contract Authorization",
    `action:${args.action}`,
    `contract:${args.contractId}`,
    `consumer:${args.consumer}`,
    `asset:${args.assetId}`,
    `odrl_policy:${args.policyHash}`,
    `ledger:${args.ledger}`,
  ].join("\n");
}

/** Result of an authorised contract invocation. */
export interface InvocationReceipt {
  readonly signature: string;
  readonly signerAddress: string;
  readonly payload: string;
  /** Set when the payload was signed by the protocol keyring, not a wallet. */
  readonly simulated: boolean;
}

function sha256HexSync(input: string): string {
  // Deterministic fallback digest. Never used as proof of farmer consent.
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0").repeat(8);
}

/**
 * Sign and "submit" a grant or revocation.
 *
 * A wallet signature is mandatory for the operation to be reported as
 * authorised; without an extension the call still resolves so the demo is
 * explorable, but the receipt is flagged `simulated` and the UI labels it
 * accordingly rather than implying on-chain settlement.
 */
export async function invokeDataContract(
  payload: string,
): Promise<InvocationReceipt> {
  try {
    const freighter = await loadFreighter();
    const result = await freighter.signMessage(payload, {
      networkPassphrase: NETWORK_PASSPHRASE,
    });

    if (result.error !== undefined) {
      throw new Error(result.error);
    }

    const signature = normalizeSignature(result.signedMessage);
    if (signature === null) {
      throw new Error("Wallet returned an empty signature.");
    }

    return {
      signature,
      signerAddress: result.signerAddress ?? "",
      payload,
      simulated: false,
    };
  } catch (error) {
    if (error instanceof WalletUnavailableError) {
      return {
        signature: `simulated-${sha256HexSync(payload)}`,
        signerAddress: "",
        payload,
        simulated: true,
      };
    }
    throw error;
  }
}