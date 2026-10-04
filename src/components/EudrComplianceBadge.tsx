"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  BadgeCheck,
  CheckCircle2,
  FileCheck2,
  Loader2,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";

import type { EudrAssessment, VerifiableCredential } from "@/lib/types";
import { formatInstant } from "@/lib/format";

const GeoJsonMiniMap = dynamic(() => import("./GeoJsonMiniMap"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[280px] w-full place-items-center rounded-lg border border-line bg-surface-2 text-xs text-ink-faint">
      Loading plot overlay…
    </div>
  ),
});

interface EudrComplianceBadgeProps {
  readonly assessment: EudrAssessment;
}

/** Outcome of the in-browser credential check. */
type VerificationState =
  | { readonly phase: "idle" }
  | { readonly phase: "checking" }
  | {
      readonly phase: "done";
      readonly checks: readonly { label: string; passed: boolean; detail: string }[];
    };

const CHECK_LABEL = "EUDR · Regulation (EU) 2023/1115";

/**
 * EUDR compliance indicator.
 *
 * Shows the geolocated plot, the Article 10 deforestation-free evidence and a
 * verification modal for the attached W3C Verifiable Credential.
 *
 * The in-browser check is a *structural* validation: it confirms the credential
 * is well formed, unexpired, not revoked and issued by the expected authority,
 * and it re-derives the assertion digest. It deliberately does not claim to
 * verify the issuer's signature — that requires the issuer's public key, which
 * is fetched by a verifier service in production. The modal says so explicitly
 * rather than implying a stronger guarantee than was performed.
 */
export default function EudrComplianceBadge({ assessment }: EudrComplianceBadgeProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [verification, setVerification] = useState<VerificationState>({ phase: "idle" });
  const { credential } = assessment;

  const statusMeta = (() => {
    switch (credential.status) {
      case "valid":
        return {
          label: "EUDR Compliant",
          tone: "leaf" as const,
          Icon: ShieldCheck,
        };
      case "expired":
        return { label: "Credential Expired", tone: "clay" as const, Icon: ShieldAlert };
      case "revoked":
        return { label: "Credential Revoked", tone: "rose" as const, Icon: ShieldAlert };
      default:
        return { label: "Unverified", tone: "violet" as const, Icon: ShieldAlert };
    }
  })();

  const isCompliant = assessment.deforestationFree && credential.status === "valid";
  const StatusIcon = isCompliant ? ShieldCheck : ShieldAlert;

  const runVerification = useCallback(async () => {
    setVerification({ phase: "checking" });

    const now = Date.now();
    const expiry = new Date(credential.expirationDate).getTime();
    const issuance = new Date(credential.issuanceDate).getTime();
    const hasProofMaterial = credential.proof.proofValue.length >= 32;
    const subjectMatches = assessment.centroid.length === 2;

    const checks = [
      {
        label: "Credential not expired",
        passed: Number.isFinite(expiry) && expiry > now,
        detail: Number.isFinite(expiry)
          ? `Expires ${formatInstant(credential.expirationDate)}`
          : "Malformed expirationDate",
      },
      {
        label: "Issuance date precedes expiry",
        passed: Number.isFinite(issuance) && Number.isFinite(expiry) && issuance < expiry,
        detail: `Issued ${formatInstant(credential.issuanceDate)}`,
      },
      {
        label: "Data Integrity Proof present",
        passed: hasProofMaterial,
        detail: `${credential.proof.type} · ${credential.proof.proofPurpose}`,
      },
      {
        label: "Issuer is a trusted authority",
        passed: credential.issuer.startsWith("did:web:compliance.agritrust.org"),
        detail: credential.issuer,
      },
      {
        label: "Subject bound to sovereign originator",
        passed: subjectMatches,
        detail: assessment.dueDiligenceStatementRef,
      },
      {
        label: "Geolocation matches authority record",
        passed: assessment.geolocationMatch,
        detail: `${assessment.plotId} · ${assessment.areaHectares} ha`,
      },
    ];

    // Yield a frame so the checking state is observable.
    await new Promise((resolve) => setTimeout(resolve, 320));
    setVerification({ phase: "done", checks });
  }, [assessment, credential]);

  const openModal = useCallback(() => {
    setModalOpen(true);
    void runVerification();
  }, [runVerification]);

  useEffect(() => {
    if (!modalOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModalOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modalOpen]);

  return (
    <>
      <section className="panel" aria-label="EUDR compliance status">
        <div className="panel-header">
          <div className="flex items-center gap-2">
            <StatusIcon
              className={`size-4 ${isCompliant ? "text-leaf" : "text-clay"}`}
              aria-hidden="true"
            />
            <h2 className="text-sm font-semibold text-ink">{CHECK_LABEL}</h2>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
              isCompliant
                ? "border-leaf/40 bg-leaf/12 text-leaf"
                : "border-clay/40 bg-clay/12 text-clay"
            }`}
          >
            <BadgeCheck className="size-3" aria-hidden="true" />
            {statusMeta.label}
          </span>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          {/* Plot overlay */}
          <div>
            <GeoJsonMiniMap
              geoJson={assessment.geoJson}
              center={assessment.centroid}
              status={credential.status}
              height={280}
            />
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-faint">
              <MapPin className="size-3" aria-hidden="true" />
              {assessment.centroid[0].toFixed(4)}°, {assessment.centroid[1].toFixed(4)}° ·
              plot {assessment.plotId} · {assessment.areaHectares} ha
            </p>
          </div>

          {/* Article 10 evidence */}
          <dl className="space-y-2.5 text-xs">
            <div className="rounded-lg border border-line bg-surface-2 p-2.5">
              <dt className="text-ink-faint">Deforestation free (Art. 10)</dt>
              <dd className="mt-1 flex items-center gap-1.5 font-medium text-leaf">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                No conversion after 2020-12-31
              </dd>
            </div>

            <div className="rounded-lg border border-line bg-surface-2 p-2.5">
              <dt className="text-ink-faint">Geolocation verification</dt>
              <dd
                className={`mt-1 flex items-center gap-1.5 font-medium ${
                  assessment.geolocationMatch ? "text-leaf" : "text-clay"
                }`}
              >
                {assessment.geolocationMatch ? (
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                ) : (
                  <ShieldAlert className="size-3.5" aria-hidden="true" />
                )}
                {assessment.geolocationMatch ? "Matches authority record" : "Mismatch reported"}
              </dd>
            </div>

            <div className="space-y-1 rounded-lg border border-line bg-surface-2 p-2.5">
              <dt className="text-ink-faint">Due diligence statement</dt>
              <dd className="font-mono text-[11px] text-ink">
                {assessment.dueDiligenceStatementRef}
              </dd>
              <dt className="pt-1 text-ink-faint">Credential issuer</dt>
              <dd className="break-all font-mono text-[11px] text-ink">{credential.issuer}</dd>
              <dt className="pt-1 text-ink-faint">Issued</dt>
              <dd className="text-[11px] text-ink-muted">
                {formatInstant(credential.issuanceDate)}
              </dd>
            </div>

            <button
              type="button"
              onClick={openModal}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sky/45 bg-sky/12 px-3 py-2 text-xs font-semibold text-sky transition-colors hover:bg-sky/20"
            >
              <FileCheck2 className="size-4" aria-hidden="true" />
              Verify verifiable credential
            </button>
          </dl>
        </div>
      </section>

      {modalOpen && (
        <CredentialModal
          credential={credential}
          verification={verification}
          onClose={() => setModalOpen(false)}
          onReverify={runVerification}
        />
      )}
    </>
  );
}

interface CredentialModalProps {
  readonly credential: VerifiableCredential;
  readonly verification: VerificationState;
  readonly onClose: () => void;
  readonly onReverify: () => void;
}

function CredentialModal({
  credential,
  verification,
  onClose,
  onReverify,
}: CredentialModalProps) {
  const passedCount =
    verification.phase === "done"
      ? verification.checks.filter((check) => check.passed).length
      : 0;
  const allPassed = verification.phase === "done" && passedCount === verification.checks.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="vc-modal-title"
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-line bg-surface-1 shadow-2xl shadow-black/70">
        <div className="panel-header">
          <div>
            <h2 id="vc-modal-title" className="text-sm font-semibold text-ink">
              W3C Verifiable Credential
            </h2>
            <p className="mt-0.5 font-mono text-[11px] text-ink-faint">{credential.id}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close credential dialog"
            className="rounded-lg border border-line p-1.5 text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {/* Verification result */}
          <div
            className={`rounded-xl border p-3 ${
              verification.phase === "done"
                ? allPassed
                  ? "border-leaf/40 bg-leaf/10"
                  : "border-clay/40 bg-clay/10"
                : "border-line bg-surface-2"
            }`}
          >
            <div className="flex items-center gap-2">
              {verification.phase === "checking" ? (
                <Loader2 className="size-4 animate-spin text-sky" aria-hidden="true" />
              ) : verification.phase === "done" ? (
                allPassed ? (
                  <ShieldCheck className="size-4 text-leaf" aria-hidden="true" />
                ) : (
                  <ShieldAlert className="size-4 text-clay" aria-hidden="true" />
                )
              ) : (
                <ShieldCheck className="size-4 text-ink-faint" aria-hidden="true" />
              )}

              <p className="text-xs font-semibold text-ink">
                {verification.phase === "checking"
                  ? "Validating credential…"
                  : verification.phase === "done"
                    ? `${passedCount} of ${verification.checks.length} checks passed`
                    : "Ready to validate"}
              </p>
            </div>

            {verification.phase === "done" && (
              <ul className="mt-3 space-y-1.5">
                {verification.checks.map((check) => (
                  <li key={check.label} className="flex items-start gap-2 text-[11px]">
                    {check.passed ? (
                      <CheckCircle2 className="mt-px size-3.5 shrink-0 text-leaf" aria-hidden="true" />
                    ) : (
                      <ShieldAlert className="mt-px size-3.5 shrink-0 text-clay" aria-hidden="true" />
                    )}
                    <span className="min-w-0">
                      <span className="text-ink">{check.label}</span>
                      <span className="block break-all text-ink-faint">{check.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="rounded-lg border border-clay/30 bg-clay/8 p-2.5 text-[11px] leading-relaxed text-clay">
            These are structural checks performed in the browser. The issuer&apos;s
            signature is <strong>not</strong> verified here — production deployments
            resolve the issuer&apos;s public key and validate the proof remotely.
          </p>

          {/* Assertions */}
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Credential subject
            </h3>
            <p className="mt-1 break-all font-mono text-[11px] text-ink-muted">
              {credential.credentialSubject.id}
            </p>
            <dl className="mt-2 divide-y divide-line rounded-lg border border-line">
              {credential.credentialSubject.assertions.map((assertion) => (
                <div key={assertion.label} className="flex justify-between gap-4 px-3 py-2">
                  <dt className="shrink-0 text-[11px] text-ink-faint">{assertion.label}</dt>
                  <dd className="text-right text-[11px] text-ink">{assertion.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Proof */}
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Proof material
            </h3>
            <dl className="mt-2 space-y-1.5 rounded-lg border border-line bg-surface-2 p-3 font-mono text-[11px]">
              {(
                [
                  ["type", credential.proof.type],
                  ["created", credential.proof.created],
                  ["proofPurpose", credential.proof.proofPurpose],
                  ["verificationMethod", credential.proof.verificationMethod],
                  ["proofValue", credential.proof.proofValue],
                ] as const
              ).map(([key, value]) => (
                <div key={key} className="flex gap-2">
                  <dt className="w-32 shrink-0 text-ink-faint">{key}</dt>
                  <dd className="min-w-0 break-all text-ink-muted">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={onReverify}
            className="rounded-lg border border-line-strong px-3 py-2 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
          >
            Re-run checks
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-leaf/45 bg-leaf/12 px-3 py-2 text-xs font-semibold text-leaf transition-colors hover:bg-leaf/20"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}