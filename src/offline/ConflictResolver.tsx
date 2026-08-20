"use client";

import type { AuditRecord } from "@/src/services/indexedDbStore";

export interface ConflictResolverProps {
  local: Partial<AuditRecord>;
  server: AuditRecord;
  onResolve: (resolution: "local" | "server") => void;
}

export function ConflictResolver({ local, server, onResolve }: ConflictResolverProps) {
  const fields = Array.from(new Set([...Object.keys(server), ...Object.keys(local)]));
  return (
    <section aria-label="Conflict review">
      <h2>Conflict review</h2>
      <p>The server and offline versions differ. Choose which version to keep.</p>
      <table>
        <thead><tr><th>Field</th><th>Offline</th><th>Server</th></tr></thead>
        <tbody>{fields.map((field) => <tr key={field}>
          <th scope="row">{field}</th>
          <td>{JSON.stringify(local[field as keyof AuditRecord] ?? "")}</td>
          <td>{JSON.stringify(server[field as keyof AuditRecord] ?? "")}</td>
        </tr>)}</tbody>
      </table>
      <button type="button" onClick={() => onResolve("local")}>Keep offline version</button>
      <button type="button" onClick={() => onResolve("server")}>Keep server version</button>
    </section>
  );
}

export default ConflictResolver;