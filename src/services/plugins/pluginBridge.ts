import { z } from "@/src/lib/zod";
import type { BridgeEventName, BridgeEventPayload, BridgeEventPayloads, PluginBridge } from "@/src/types/plugins";

const bridgeSchemas = {
  "plugin:ready": z.object({ pluginName: z.string().min(1), version: z.string().min(1) }),
  "plugin:error": z.object({ pluginName: z.string().min(1), message: z.string().min(1), code: z.string().optional() }),
  "plugin:teardown": z.object({ pluginName: z.string().min(1), reason: z.enum(["unmount", "reload"]) }),
  "inspection:request": z.object({ inspectionId: z.string().min(1) }),
  "inspection:update": z.object({ inspectionId: z.string().min(1), status: z.string().min(1), notes: z.string().optional() }),
} satisfies Record<BridgeEventName, import("@/src/lib/zod").ZodType>;

export function validateBridgePayload<T extends BridgeEventName>(type: T, payload: unknown): BridgeEventPayload<T> {
  return bridgeSchemas[type].parse(payload) as BridgeEventPayload<T>;
}

export function createPluginBridge(target: EventTarget = new EventTarget()): PluginBridge {
  return {
    dispatch<T extends BridgeEventName>(type: T, payload: BridgeEventPayloads[T]) {
      const detail = validateBridgePayload(type, payload);
      target.dispatchEvent(new CustomEvent(type, { detail }));
    },
    subscribe<T extends BridgeEventName>(type: T, handler: (payload: BridgeEventPayload<T>) => void) {
      const listener = (event: Event) => {
        const detail = validateBridgePayload(type, (event as CustomEvent).detail);
        handler(detail);
      };
      target.addEventListener(type, listener);
      return () => target.removeEventListener(type, listener);
    },
  };
}
