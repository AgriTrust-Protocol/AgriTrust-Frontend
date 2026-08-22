import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { draftManager, _resetDraftManagerForTests } from "@/src/components/wizard/DraftManager";
import { FARM_STEPS } from "@/src/components/wizard/FarmStepConfig";
import { EMPTY_FARM_FORM } from "@/src/types/farmWizard";

afterEach(async () => {
  await draftManager.clear("farm-test");
  _resetDraftManagerForTests();
});

describe("farm wizard draft manager", () => {
  it("persists fields and attachment blobs across a load", async () => {
    const file = new File(["map-data"], "map.txt", { type: "text/plain", lastModified: 12 });
    await draftManager.saveStep("farm-test", "documents", { farmName: "Green Acres" }, [file], "documents");

    const saved = await draftManager.load("farm-test");

    expect(saved?.draft.fields.farmName).toBe("Green Acres");
    expect(saved?.draft.currentStep).toBe("documents");
    expect(saved?.files[0].name).toBe("map.txt");
  });

  it("skips branch steps and exposes defaults for skipped field data", () => {
    const data = { ...EMPTY_FARM_FORM, cropType: "livestock", region: "remote" };
    const visible = FARM_STEPS.filter((step) => step.dependsOn?.(data) ?? true);
    const fieldsStep = FARM_STEPS.find((step) => step.id === "fields");

    expect(visible.map((step) => step.id)).not.toContain("fields");
    expect(visible.map((step) => step.id)).not.toContain("insurance");
    expect(fieldsStep?.defaults).toEqual({ fieldType: "pasture", fieldCount: 1 });
  });
});
