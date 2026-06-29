import { z } from "@/src/lib/zod";
import type { PluginManifest } from "@/src/types/plugins";

const manifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  entry: z.string().url(),
  integrity: z.string().regex(/^sha(256|384|512)-[A-Za-z0-9+/=]+$/),
  permissions: z.array(z.enum(["read:inspection", "write:inspection", "emit:events"] as const)).default([]),
});

export function parsePluginManifest(input: unknown): PluginManifest {
  return manifestSchema.parse(input);
}

export async function fetchPluginManifest(url: string): Promise<PluginManifest> {
  const response = await fetch(url, { credentials: "omit", mode: "cors" });
  if (!response.ok) throw new Error(`Unable to load plugin manifest: ${response.status}`);
  return parsePluginManifest(await response.json());
}

export async function verifyManifestEntryHash(manifest: PluginManifest): Promise<boolean> {
  const response = await fetch(manifest.entry, { credentials: "omit", mode: "cors" });
  if (!response.ok) return false;
  const [algorithm, expectedBase64] = manifest.integrity.split("-");
  const digest = await crypto.subtle.digest(algorithm.toUpperCase().replace("SHA", "SHA-"), await response.arrayBuffer());
  const actualBase64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return actualBase64 === expectedBase64;
}
