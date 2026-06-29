import type { InspectorPluginModule, PluginManifest, PluginMemorySample } from "@/src/types/plugins";
import { verifyManifestEntryHash } from "@/src/services/plugins/pluginManifest";

export const PLUGIN_MEMORY_LIMIT_BYTES = 10 * 1024 * 1024;

type MemoryCapablePerformance = Performance & {
  measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
};

export async function loadPluginBundle(manifest: PluginManifest): Promise<InspectorPluginModule> {
  const validHash = await verifyManifestEntryHash(manifest);
  if (!validHash) throw new Error(`Integrity verification failed for ${manifest.name}`);
  const pluginModule = (await import(/* webpackIgnore: true */ manifest.entry)) as Partial<InspectorPluginModule>;
  if (typeof pluginModule.render !== "function") throw new Error(`Plugin ${manifest.name} does not export render()`);
  return pluginModule as InspectorPluginModule;
}

export async function samplePluginMemory(): Promise<PluginMemorySample | null> {
  const memory = (performance as MemoryCapablePerformance).measureUserAgentSpecificMemory;
  if (!memory) return null;
  const { bytes } = await memory.call(performance);
  return { bytes, overLimit: bytes > PLUGIN_MEMORY_LIMIT_BYTES, sampledAt: Date.now() };
}
