"use client";

import { useEffect, useRef, useState } from "react";
import { createPluginBridge } from "@/src/services/plugins/pluginBridge";
import { loadPluginBundle, samplePluginMemory } from "@/src/services/plugins/pluginLoader";
import type { InspectorPluginModule, PluginLifecycleState, PluginManifest, PluginRuntimeContext } from "@/src/types/plugins";

interface PluginHostProps { manifest: PluginManifest; inspectionId: string; }

export function PluginHost({ manifest, inspectionId }: PluginHostProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const contextRef = useRef<PluginRuntimeContext | null>(null);
  const pluginRef = useRef<InspectorPluginModule | null>(null);
  const [state, setState] = useState<PluginLifecycleState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let shadowRoot: ShadowRoot | null = host.attachShadow({ mode: "closed" });
    const container = document.createElement("section");
    container.setAttribute("part", "plugin-container");
    shadowRoot.append(container);
    const bridge = createPluginBridge(container);

    async function mount() {
      try {
        setState("mounting");
        const plugin = await loadPluginBundle(manifest);
        if (cancelled || !shadowRoot) return;
        const context = { container, bridge, manifest, inspectionId };
        contextRef.current = context;
        pluginRef.current = plugin;
        await plugin.render(context);
        bridge.dispatch("plugin:ready", { pluginName: manifest.name, version: manifest.version });
        const memory = await samplePluginMemory();
        if (memory?.overLimit) throw new Error(`${manifest.name} exceeded the 10MB plugin memory budget`);
        setState("rendering");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown plugin failure";
        bridge.dispatch("plugin:error", { pluginName: manifest.name, message });
        setError(message);
        setState("error");
      }
    }

    void mount();
    return () => {
      cancelled = true;
      setState("unmounting");
      const context = contextRef.current;
      if (context) {
        context.bridge.dispatch("plugin:teardown", { pluginName: manifest.name, reason: "unmount" });
        void pluginRef.current?.unmount?.(context);
      }
      container.replaceChildren();
      host.replaceChildren();
      contextRef.current = null;
      pluginRef.current = null;
      shadowRoot = null;
      setState("unmounted");
    };
  }, [inspectionId, manifest]);

  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-3 flex items-center justify-between text-sm">
        <strong>{manifest.name}</strong>
        <span>{state}</span>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div ref={hostRef} data-plugin-host={manifest.name} />
    </div>
  );
}
