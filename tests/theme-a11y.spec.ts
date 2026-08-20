import { test, expect } from "@playwright/test";

const pages = [
  "/dashboard",
  "/dashboard/analytics",
  "/dashboard/maps",
  "/settings",
  "/dashboard/operations",
];

test.describe("high-contrast accessibility theme", () => {
  for (const path of pages) {
    test(`keeps layout stable on ${path} in default and high contrast modes`, async ({ page }) => {
      const defaultShot = await page.screenshot({ path: `test-results/${path.replace(/\//g, "-")}-default.png` });
      const defaultBoundingBox = await page.locator("body").boundingBox();

      await page.evaluate(() => {
        localStorage.setItem("a11y-theme", "highContrastLight");
        document.documentElement.dataset.theme = "highContrastLight";
      });
      await page.reload();

      const highContrastShot = await page.screenshot({ path: `test-results/${path.replace(/\//g, "-")}-contrast.png` });
      const contrastBoundingBox = await page.locator("body").boundingBox();

      expect(defaultShot).not.toEqual(highContrastShot);
      expect(Math.abs((defaultBoundingBox?.width ?? 0) - (contrastBoundingBox?.width ?? 0))).toBeLessThan(4);
      expect(Math.abs((defaultBoundingBox?.height ?? 0) - (contrastBoundingBox?.height ?? 0))).toBeLessThan(4);
    });
  }
});
