"use client";

import { useCallback, useState } from "react";
import {
  BadgeCheck,
  Fingerprint,
  Layers,
  Leaf,
  ScrollText,
  ShieldCheck,
} from "lucide-react";

import Navbar from "@/components/Navbar";
import ProvenanceGraphViewer from "@/components/ProvenanceGraphViewer";
import EudrComplianceBadge from "@/components/EudrComplianceBadge";
import DataContractManager from "@/components/DataContractManager";
import MassBalanceChart from "@/components/MassBalanceChart";

import {
  ACTIVE_IDENTITY,
  ASSET_TWIN,
  EUDR_ASSESSMENT,
  MASS_BALANCE,
  ODRL_POLICIES,
} from "@/lib/protocolState";
import { SNAPSHOT_ASSET_ID, getSnapshotGraph } from "@/lib/snapshot";
import { formatUnixSeconds, shortHash } from "@/lib/format";
import type { WalletSession } from "@/lib/wallet";

type Perspective = "sovereignty" | "auditor";

const PERSPECTIVES: readonly {
  id: Perspective;
  label: string;
  blurb: string;
  Icon: typeof Leaf;
}[] = [
  {
    id: "sovereignty",
    label: "Farmer Sovereignty Console",
    blurb: "Access rules, ODRL terms and credential management",
    Icon: ScrollText,
  },
  {
    id: "auditor",
    label: "Supply Chain Auditor View",
    blurb: "Interactive lineage graph and regulatory compliance reports",
    Icon: Layers,
  },
];

export default function DashboardPage() {
  const [session, setSession] = useState<WalletSession | null>(null);
  const [perspective, setPerspective] = useState<Perspective>("sovereignty");

  // The snapshot renders immediately; the viewer swaps in the triplestore's
  // copy once the SPARQL endpoint responds.
  const snapshot = getSnapshotGraph(SNAPSHOT_ASSET_ID);

  const handleSessionChange = useCallback((next: WalletSession | null) => {
    setSession(next);
  }, []);

  return (
    <>
      <Navbar session={session} onSessionChange={handleSessionChange} />

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 sm:px-6">
        {/* Batched asset header */}
        <header className="panel mb-5">
          <div className="flex flex-wrap items-start justify-between gap-4 p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-leaf/40 bg-leaf/12 px-2.5 py-1 text-[11px] font-semibold text-leaf">
                  <Leaf className="size-3" aria-hidden="true" />
                  {ASSET_TWIN.commodityType}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] text-ink-muted">
                  Lot COF-LOT-2024-0892
                </span>
              </div>

              <h1 className="mt-2 text-lg font-semibold tracking-tight text-ink">
                Kamau Cooperative · Arabica Lot 2024/0892
              </h1>
              <p className="mt-0.5 text-xs text-ink-muted">
                Harvest 14 Aug 2024 → cooperative → wet mill → dry mill → Port of Mombasa
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[11px] sm:grid-cols-4">
              <HeaderStat
                label="Asset commitment"
                value={shortHash(ASSET_TWIN.assetId, 10, 8)}
                mono
              />
              <HeaderStat
                label="Merkle root"
                value={shortHash(ASSET_TWIN.provenanceMerkleRoot, 10, 8)}
                mono
              />
              <HeaderStat label="Originator DID" value={ACTIVE_IDENTITY.did} mono />
              <HeaderStat
                label="Anchored"
                value={formatUnixSeconds(ASSET_TWIN.registeredAt)}
              />
            </dl>
          </div>
        </header>

        {/* Perspective switch */}
        <div
          role="tablist"
          aria-label="Portal perspective"
          className="mb-5 flex flex-col gap-2 sm:flex-row"
        >
          {PERSPECTIVES.map(({ id, label, blurb, Icon }) => {
            const active = perspective === id;

            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`tab-${id}`}
                aria-selected={active}
                aria-controls={`panel-${id}`}
                onClick={() => setPerspective(id)}
                className={`flex flex-1 items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                  active
                    ? "border-leaf/45 bg-leaf/8"
                    : "border-line bg-surface-1 hover:bg-surface-2"
                }`}
              >
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-lg ${
                    active ? "bg-leaf/15 text-leaf" : "bg-surface-3 text-ink-faint"
                  }`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span
                    className={`block truncate text-sm font-semibold ${
                      active ? "text-ink" : "text-ink-muted"
                    }`}
                  >
                    {label}
                  </span>
                  <span className="block truncate text-[11px] text-ink-faint">{blurb}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Panels are mounted on demand: the lineage canvas and chart libraries
            are only paid for once the auditor view is actually opened. */}
        {perspective === "sovereignty" && (
          <div
            role="tabpanel"
            id="panel-sovereignty"
            aria-labelledby="tab-sovereignty"
            className="grid gap-5"
          >
            <DataContractManager session={session} />
            <CredentialsPanel />
          </div>
        )}

        {perspective === "auditor" && (
          <div
            role="tabpanel"
            id="panel-auditor"
            aria-labelledby="tab-auditor"
            className="grid gap-5"
          >
            <ProvenanceGraphViewer initialGraph={snapshot} />
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <EudrComplianceBadge assessment={EUDR_ASSESSMENT} />
              <MassBalanceChart summary={MASS_BALANCE} />
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-line px-4 py-5 text-center text-[11px] text-ink-faint sm:px-6">
        AgriTrust Protocol · semantic governance for verifiable agri-food provenance ·
        Soroban testnet
      </footer>
    </>
  );
}

function HeaderStat({
  label,
  value,
  mono = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-ink-faint">{label}</dt>
      <dd className={`mt-0.5 text-ink ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

/** Identity and anchored-credential overview for the sovereign originator. */
function CredentialsPanel() {
  return (
    <section className="panel" aria-label="Credentials and anchored policies">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <Fingerprint className="size-4 text-violet" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-ink">
            Credentials &amp; Anchored Policies
          </h2>
        </div>
        <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] text-ink-muted">
          {ODRL_POLICIES.length} policies on-ledger
        </span>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
        <article className="rounded-lg border border-line bg-surface-2 p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            <Fingerprint className="size-3" aria-hidden="true" />
            Subject DID
          </p>
          <p className="mt-1 break-all font-mono text-[10px] text-ink">
            {ACTIVE_IDENTITY.did}
          </p>
          <p className="mt-1.5 text-[11px] text-ink-faint">{ACTIVE_IDENTITY.role}</p>
        </article>

        {ODRL_POLICIES.map((policy) => (
          <article
            key={policy.policyHash}
            className="rounded-lg border border-line bg-surface-2 p-3"
          >
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              <ScrollText className="size-3" aria-hidden="true" />
              ODRL digest
            </p>
            <p className="mt-1 break-all font-mono text-[10px] text-ink">
              {shortHash(policy.policyHash, 16, 10)}
            </p>
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-leaf">
              <ShieldCheck className="size-3 shrink-0" aria-hidden="true" />
              {policy.permissions.length} permitted · {policy.prohibitions.length}{" "}
              prohibited
            </p>
            <p className="mt-1 truncate text-[10px] text-ink-faint" title={policy.policyUri}>
              {policy.policyUri}
            </p>
          </article>
        ))}
      </div>

      <p className="flex items-start gap-2 border-t border-line bg-surface-2/50 px-4 py-2.5 text-[11px] text-ink-muted">
        <BadgeCheck className="mt-px size-3.5 shrink-0 text-leaf" aria-hidden="true" />
        Only policy digests anchored through <code className="font-mono">register_odrl_policy</code>{" "}
        can back a data contract; any other digest is rejected with{" "}
        <code className="font-mono">PolicyViolation</code>.
      </p>
    </section>
  );
}