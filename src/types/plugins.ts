export type PluginPermission = "read:inspection" | "write:inspection" | "emit:events";

export type PluginLifecycleState =
  | "idle"
  | "mounting"
  | "rendering"
  | "unmounting"
  | "unmounted"
  | "error";

export interface PluginManifest {
  name: string;
  version: string;
  entry: string;
  integrity: string;
  permissions: PluginPermission[];
}

export interface BridgeEventPayloads {
  "plugin:ready": { pluginName: string; version: string };
  "plugin:error": { pluginName: string; message: string; code?: string };
  "plugin:teardown": { pluginName: string; reason: "unmount" | "reload" };
  "inspection:request": { inspectionId: string };
  "inspection:update": { inspectionId: string; status: string; notes?: string };
}

export type BridgeEventName = keyof BridgeEventPayloads;
export type BridgeEventPayload<T extends BridgeEventName = BridgeEventName> =
  BridgeEventPayloads[T];

export interface PluginBridge {
  dispatch<T extends BridgeEventName>(type: T, payload: BridgeEventPayload<T>): void;
  subscribe<T extends BridgeEventName>(
    type: T,
    handler: (payload: BridgeEventPayload<T>) => void
  ): () => void;
}

export interface PluginRuntimeContext {
  container: HTMLElement;
  bridge: PluginBridge;
  manifest: PluginManifest;
  inspectionId: string;
}

export interface InspectorPluginModule {
  render(context: PluginRuntimeContext): void | Promise<void>;
  unmount?(context: PluginRuntimeContext): void | Promise<void>;
}

export interface PluginMemorySample {
  bytes: number;
  overLimit: boolean;
  sampledAt: number;
}
