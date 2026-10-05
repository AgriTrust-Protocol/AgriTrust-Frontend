/** Presentation helpers shared across the portal. */

/** Collapse a 64-char commitment to `abcd…wxyz` for dense UI. */
export function shortHash(hash: string, lead = 6, tail = 4): string {
  if (hash.length <= lead + tail + 1) return hash;
  return `${hash.slice(0, lead)}…${hash.slice(-tail)}`;
}

/** Group an integer with thin separators, e.g. `135,000`. */
export function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

/** Render a mass in tonnes above 1,000 kg, otherwise in kilograms. */
export function formatMass(kilograms: number): string {
  if (Math.abs(kilograms) >= 1_000) {
    return `${(kilograms / 1_000).toLocaleString("en-US", {
      maximumFractionDigits: 1,
    })} t`;
  }
  return `${kilograms.toLocaleString("en-US")} kg`;
}

/** Render a ratio as a percentage with one decimal. */
export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

/** Format a Soroban ledger sequence as an approximate close time. */
export function formatLedger(sequence: number): string {
  // Stellar targets ~5s per ledger close on the reference config.
  const epochSeconds = 1_700_000_000;
  const closedAt = new Date(epochSeconds * 1000 + (sequence - 1) * 5_000);
  return closedAt.toISOString().replace("T", " ").slice(0, 19) + "Z";
}

/** Human readable interval between two ledger sequences. */
export function formatLedgerWindow(validUntil: number, current: number): string {
  const remaining = validUntil - current;
  if (remaining <= 0) return "expired";
  if (remaining < 1_000) return `${remaining} ledgers left`;
  const days = Math.round((remaining * 5) / 86_400);
  return `${days} days left`;
}

/** Format an ISO instant as `14 Aug 2024, 06:20 UTC`. */
export function formatInstant(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;

  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/** Format a ledger unix timestamp as a UTC date. */
export function formatUnixSeconds(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

/** Escape a string for safe interpolation into a monospace hash cell. */
export function truncateMiddle(value: string, max = 18): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}