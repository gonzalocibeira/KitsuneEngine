import { expect, test } from "@playwright/test";

test("Tamamo export loads and plays in Kuzunoha", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173");
  await expect(page.getByText("Project is export-ready.")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const exportedPath = await download.path();
  expect(exportedPath).toBeTruthy();

  await page.goto("http://127.0.0.1:5174");
  await page.evaluate(() => localStorage.clear());
  await page.locator('input[type="file"]').setInputFiles(exportedPath!);
  await expect(page.getByText("The Archivist's Trial")).toBeVisible();

  await page.getByRole("button", { name: "Up" }).click();
  await page.getByRole("button", { name: "Right" }).click();
  await page.getByRole("button", { name: "Right" }).click();
  await page.getByRole("button", { name: "Act" }).click();
  await expect(page.getByText("Gather three ideas")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator("summary").filter({ hasText: "Diary" }).click();
  await expect(page.getByText("Observe")).toBeVisible();
});
