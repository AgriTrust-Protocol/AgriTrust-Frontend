import { describe, expect, it } from "vitest";
import { createPluginBridge } from "@/src/services/plugins/pluginBridge";

describe("pluginBridge", () => {
  it("dispatches typed CustomEvents after payload validation", () => {
    const target = new EventTarget();
    const bridge = createPluginBridge(target);
    const received: unknown[] = [];
    const unsubscribe = bridge.subscribe("inspection:update", (payload) => received.push(payload));

    bridge.dispatch("inspection:update", { inspectionId: "inspection-1", status: "approved" });

    expect(received).toEqual([{ inspectionId: "inspection-1", status: "approved", notes: undefined }]);
    unsubscribe();
  });

  it("rejects invalid payloads before dispatch", () => {
    const bridge = createPluginBridge();
    expect(() =>
      bridge.dispatch("plugin:ready", { pluginName: "", version: "1.0.0" })
    ).toThrow(/at least 1 character/);
  });
});
