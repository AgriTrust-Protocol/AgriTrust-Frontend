"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Ban,
  CheckCircle2,
  Fingerprint,
  HandCoins,
  KeyRound,
  Loader2,
  Lock,
  ScrollText,
  ShieldCheck,
  ShieldX,
  Wallet,
} from "lucide-react";

import type { DataContract, OdrlPolicy } from "@/lib/types";
import {
  ALL_REQUESTS,
  ASSET_TWIN,
  CURRENT_LEDGER,
  PENDING_REQUESTS,
  resolvePolicy,
} from "@/lib/protocolState";
import { formatLedgerWindow, formatNumber, formatUnixSeconds, shortHash } from "@/lib/format";
import type { WalletSession } from "@/lib/wallet";
import { buildAuthorizationPayload, invokeDataContract } from "@/lib/wallet";

type GrantState = "granted" | "pending" | "revoked" | "expired";

/** Requests that have not been licensed yet, keyed for O(1) lookup on mount. */
const PENDING_CONTRACT_IDS = new Set(PENDING_REQUESTS.map((contract) => contract.contractId));

interface TrackedContract {
  readonly contract: DataContract;
  readonly state: GrantState;
}

type Receipt = {
  readonly signature: string;
  readonly simulated: boolean;
  readonly action: "grant" | "revoke";
};

interface DataContractManagerProps {
  readonly session: WalletSession | null;
}

/**
 * Farmer sovereignty console.
 *
 * Lists every corporate access request against the sovereign originator's asset
 * twin, exposes the ODRL rules attached to each one, and exposes the two
 * on-ledger transitions the farmer controls:
 *
 *   grant  -> `create_data_contract`  (licenses records under anchored terms)
 *   revoke -> `revoke_data_access`    (terminal, unilateral, no counter-consent)
 *
 * Both transitions require the originator's ledger signature, so the buttons are
 * gated on the connected wallet actually being the sovereign originator — the
 * contract rejects anyone else with `ContractError::Unauthorized`.
 */
export default function DataContractManager({ session }: DataContractManagerProps) {
  const [tracked, setTracked] = useState<TrackedContract[]>(() =>
    ALL_REQUESTS.map((contract) => ({
      contract,
      state: contract.isRevoked
        ? "revoked"
        : contract.validUntilLedger < CURRENT_LEDGER
          ? "expired"
          : PENDING_CONTRACT_IDS.has(contract.contractId)
            ? "pending"
            : "granted",
    })),
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Readonly<Record<string, Receipt>>>({});
  const [error, setError] = useState<string | null>(null);

  const isOriginator = session?.address === ASSET_TWIN.originator;
  const canAct = session !== null && isOriginator;

  const summary = useMemo(() => {
    const counts = { granted: 0, pending: 0, revoked: 0, expired: 0 };
    for (const item of tracked) counts[item.state] += 1;
    return counts;
  }, [tracked]);

  const activeEscrow = useMemo(
    () =>
      tracked
        .filter((item) => item.state === "granted")
        .reduce((total, item) => total + item.contract.accessFee, 0),
    [tracked],
  );

  const transition = useCallback(
    async (contract: DataContract, action: "grant" | "revoke") => {
      if (!canAct) {
        setError(
          "Connect the sovereign originator wallet before signing a data contract change.",
        );
        return;
      }

      setBusyId(contract.contractId);
      setError(null);

      const payload = buildAuthorizationPayload({
        action,
        contractId: contract.contractId,
        consumer: contract.dataConsumer,
        assetId: contract.assetId,
        policyHash: contract.odrlPolicyHash,
        ledger: CURRENT_LEDGER,
      });

      try {
        const receipt = await invokeDataContract(payload);

        setTracked((current) =>
          current.map((item) =>
            item.contract.contractId === contract.contractId
              ? {
                  contract: item.contract,
                  state:
                    action === "grant"
                      ? "granted"
                      : // `revoke_data_access` is terminal: there is no path back.
                        "revoked",
                }
              : item,
          ),
        );

        setReceipts((current) => ({
          ...current,
          [contract.contractId]: {
            signature: receipt.signature,
            simulated: receipt.simulated,
            action,
          },
        }));
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "The invocation could not be signed.",
        );
      } finally {
        setBusyId(null);
      }
    },
    [canAct],
  );

  return (
    <section className="panel" aria-label="Farmer data sovereignty console">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-leaf" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-ink">Farmer Sovereignty Console</h2>
        </div>
        <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] text-ink-muted">
          {summary.granted} active · {summary.pending} pending · {summary.revoked} revoked
        </span>
      </div>

      {/* Sovereignty summary */}
      <div className="grid gap-3 border-b border-line bg-surface-2/50 p-4 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface-2 p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            <Fingerprint className="size-3" aria-hidden="true" />
            Sovereign originator
          </p>
          <p className="mt-1 break-all font-mono text-[10px] text-ink">
            {shortHash(ASSET_TWIN.originator, 10, 8)}
          </p>
        </div>

        <div className="rounded-lg border border-line bg-surface-2 p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            <HandCoins className="size-3" aria-hidden="true" />
            Escrow committed
          </p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {formatNumber(activeEscrow / 10_000_000)} XLM
          </p>
          <p className="text-[10px] text-ink-faint">across active grants</p>
        </div>

        <div className="rounded-lg border border-line bg-surface-2 p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            <Lock className="size-3" aria-hidden="true" />
            Twin anchored
          </p>
          <p className="mt-1 font-mono text-[10px] text-ink">
            {shortHash(ASSET_TWIN.provenanceMerkleRoot, 10, 8)}
          </p>
          <p className="text-[10px] text-ink-faint">
            since {formatUnixSeconds(ASSET_TWIN.registeredAt)}
          </p>
        </div>
      </div>

      {!canAct && (
        <p className="flex items-start gap-2 border-b border-clay/25 bg-clay/8 px-4 py-2.5 text-[11px] text-clay">
          <Wallet className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {session === null
            ? "Connect the Freighter wallet to sign grant and revoke operations."
            : "The connected address is not the sovereign originator of this batch; the contract would reject the operation as unauthorized."}
        </p>
      )}

      {error !== null && (
        <p role="alert" className="border-b border-rose/25 bg-rose/8 px-4 py-2.5 text-[11px] text-rose">
          {error}
        </p>
      )}

      {/* Request list */}
      <ul className="thin-scroll max-h-[720px] divide-y divide-line overflow-y-auto">
        {tracked.map(({ contract, state }) => (
          <ContractRow
            key={contract.contractId}
            contract={contract}
            policy={resolvePolicy(contract)}
            state={state}
            busy={busyId === contract.contractId}
            canAct={canAct}
            receipt={receipts[contract.contractId]}
            onGrant={() => void transition(contract, "grant")}
            onRevoke={() => void transition(contract, "revoke")}
          />
        ))}
      </ul>
    </section>
  );
}

interface ContractRowProps {
  readonly contract: DataContract;
  readonly policy: OdrlPolicy;
  readonly state: GrantState;
  readonly busy: boolean;
  readonly canAct: boolean;
  readonly receipt: Receipt | undefined;
  readonly onGrant: () => void;
  readonly onRevoke: () => void;
}

const STATE_META: Record<
  GrantState,
  { label: string; className: string; Icon: typeof ShieldCheck }
> = {
  granted: {
    label: "Granted",
    className: "border-leaf/40 bg-leaf/12 text-leaf",
    Icon: ShieldCheck,
  },
  pending: {
    label: "Awaiting decision",
    className: "border-clay/40 bg-clay/12 text-clay",
    Icon: ScrollText,
  },
  revoked: {
    label: "Revoked · terminal",
    className: "border-rose/40 bg-rose/12 text-rose",
    Icon: ShieldX,
  },
  expired: {
    label: "Expired",
    className: "border-line-strong bg-surface-3 text-ink-faint",
    Icon: Ban,
  },
};

function ContractRow({
  contract,
  policy,
  state,
  busy,
  canAct,
  receipt,
  onGrant,
  onRevoke,
}: ContractRowProps) {
  const meta = STATE_META[state];
  const StateIcon = meta.Icon;
  const isPending = state === "pending";

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold text-ink">{contract.consumerLabel}</p>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.className}`}
            >
              <StateIcon className="size-3" aria-hidden="true" />
              {meta.label}
            </span>
          </div>

          <p className="mt-1 font-mono text-[10px] text-ink-faint">
            {shortHash(contract.dataConsumer, 10, 8)} · contract{" "}
            {shortHash(contract.contractId, 10, 8)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-xs font-semibold text-ink">
              {formatNumber(contract.accessFee / 10_000_000)} XLM
            </p>
            <p className="text-[10px] text-ink-faint">
              {formatLedgerWindow(contract.validUntilLedger, CURRENT_LEDGER)}
            </p>
          </div>

          {isPending ? (
            <button
              type="button"
              onClick={onGrant}
              disabled={busy || !canAct}
              className="inline-flex items-center gap-2 rounded-lg border border-leaf/45 bg-leaf/12 px-3 py-2 text-xs font-semibold text-leaf transition-colors hover:bg-leaf/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
              )}
              Grant Access
            </button>
          ) : (
            <button
              type="button"
              onClick={onRevoke}
              // A revoked grant is terminal on-ledger, so the action is removed
              // rather than left in a state that would always revert.
              disabled={busy || !canAct || state === "revoked"}
              title={
                state === "revoked"
                  ? "Revocation is terminal and cannot be undone"
                  : "Revoke this consumer's access"
              }
              className="inline-flex items-center gap-2 rounded-lg border border-rose/45 bg-rose/10 px-3 py-2 text-xs font-semibold text-rose transition-colors hover:bg-rose/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Ban className="size-3.5" aria-hidden="true" />
              )}
              Revoke Access
            </button>
          )}
        </div>
      </div>

      {/* ODRL policy rules */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <PolicyList
          tone="permitted"
          title="Permitted"
          items={policy.permissions}
          Icon={ShieldCheck}
        />
        <PolicyList
          tone="prohibited"
          title="Prohibited"
          items={policy.prohibitions}
          Icon={Ban}
        />
      </div>

      <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-faint">
        <span>
          ODRL digest{" "}
          <span className="font-mono text-ink-muted">
            {shortHash(policy.policyHash, 10, 8)}
          </span>
        </span>
        <span className="truncate">· {policy.policyUri}</span>
        <span>· retention {policy.retentionLimitDays}d</span>
      </p>

      {receipt !== undefined && (
        <p className="mt-2.5 rounded-lg border border-line bg-surface-2 p-2 font-mono text-[10px] text-ink-faint">
          {receipt.action === "grant" ? "create_data_contract" : "revoke_data_access"} ·{" "}
          {receipt.simulated ? (
            <span className="text-clay">
              simulated, no wallet signature — not settled on-ledger
            </span>
          ) : (
            <span className="text-leaf">signed · {shortHash(receipt.signature, 16, 8)}</span>
          )}
        </p>
      )}
    </li>
  );
}

function PolicyList({
  title,
  items,
  tone,
  Icon,
}: {
  readonly title: string;
  readonly items: readonly string[];
  readonly tone: "permitted" | "prohibited";
  readonly Icon: typeof ShieldCheck;
}) {
  const permitted = tone === "permitted";

  return (
    <div
      className={`rounded-lg border p-2.5 ${
        permitted ? "border-leaf/25 bg-leaf/6" : "border-rose/25 bg-rose/6"
      }`}
    >
      <p
        className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider ${
          permitted ? "text-leaf" : "text-rose"
        }`}
      >
        <Icon className="size-3" aria-hidden="true" />
        {title}
      </p>
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => (
          <li key={item} className="flex gap-1.5 text-[11px] leading-snug text-ink-muted">
            <span className={permitted ? "text-leaf" : "text-rose"} aria-hidden="true">
              {permitted ? "✓" : "✕"}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}