"use client";

import { PluginHost } from "@/src/components/plugins/PluginHost";
import type { PluginManifest } from "@/src/types/plugins";

const DEMO_INSPECTOR_PLUGINS: PluginManifest[] = [
  {
    name: "Residue Risk Inspector",
    version: "1.0.0",
    entry: "https://plugins.agritrust.example/residue-risk/index.js",
    integrity: "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    permissions: ["read:inspection", "emit:events"],
  },
];

interface InspectionDetailProps { inspectionId: string; plugins?: PluginManifest[]; }

export function InspectionDetail({ inspectionId, plugins = DEMO_INSPECTOR_PLUGINS }: InspectionDetailProps) {
  return (
    <main className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold">Inspection {inspectionId}</h1>
        <p className="text-sm text-zinc-500">Third-party inspection tools run inside closed Shadow DOM plugin hosts.</p>
      </section>
      <section className="space-y-4" aria-label="Third-party inspection plugins">
        {plugins.map((manifest) => (
          <PluginHost key={`${manifest.name}@${manifest.version}`} manifest={manifest} inspectionId={inspectionId} />
        ))}
      </section>
    </main>
  );
}
