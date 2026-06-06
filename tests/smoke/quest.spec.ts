import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";

async function move(page: import("@playwright/test").Page, key: string, times = 1) {
  for (let index = 0; index < times; index += 1) {
    await page.keyboard.down(key);
    await page.waitForTimeout(170);
    await page.keyboard.up(key);
    await page.waitForTimeout(30);
  }
}

test("Tamamo export loads and plays in Kuzunoha", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173");
  await expect(page.getByText("Project is export-ready.")).toBeVisible();
  const editorTabs = page.getByLabel("Editor sections");
  await expect(editorTabs.getByRole("button", { name: "Entity" })).toBeVisible();
  await expect(editorTabs.getByRole("button", { name: "Notes" })).toBeVisible();
  await expect(editorTabs.getByRole("button", { name: "Battle" })).toBeVisible();
  await expect(editorTabs.getByRole("button", { name: "Player" })).toBeVisible();
  await expect(page.locator(".left-panel").getByRole("button", { name: "Entity" })).toHaveCount(0);

  await editorTabs.getByRole("button", { name: "Entity" }).click();
  await page.getByRole("button", { name: "Place on Map" }).click();
  await page.locator('button.cell[title="2, 1"]').click();
  await expect(page.getByRole("button", { name: "Place on Map" })).toBeVisible();

  await editorTabs.getByRole("button", { name: "Notes" }).click();
  await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles({
    name: "knowledge-dot.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64")
  });
  await expect(page.locator(".knowledge-image-preview img").first()).toBeVisible();

  await editorTabs.getByRole("button", { name: "Battle" }).click();
  await page.getByRole("button", { name: "Add Battle" }).click();
  await expect(page.getByLabel("Battle")).toHaveValue("battle-2");
  await expect(page.getByLabel("Player HP")).toHaveCount(0);
  await expect(page.getByLabel("Enemy HP")).toHaveCount(0);
  await page.getByRole("button", { name: "Add Question" }).click();

  await editorTabs.getByRole("button", { name: "Notes" }).click();
  await page.getByLabel("Note").selectOption("attention");
  const newBattleMembership = page.locator(".membership-row").filter({ hasText: "New Battle" });
  await expect(newBattleMembership).toBeVisible();
  await newBattleMembership.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("button", { name: "Add to Battle" }).click();
  await expect(newBattleMembership).toBeVisible();

  await editorTabs.getByRole("button", { name: "Battle" }).click();
  await page.getByLabel("Battle").selectOption("battle-2");
  await expect(page.locator(".membership-row").filter({ hasText: "Attention" })).toBeVisible();

  await editorTabs.getByRole("button", { name: "Notes" }).click();
  await page.getByLabel("Note").selectOption("attention");
  await page.getByRole("button", { name: "Delete Note" }).click();
  await page.getByLabel("Note").selectOption("observe");
  await expect(page.getByRole("button", { name: "Delete Note" })).toBeDisabled();
  await expect(page.getByText('"New Battle" must keep at least one note.')).toBeVisible();

  await page.getByRole("button", { name: "Spawn" }).click();
  await page.getByRole("button", { name: "Add Spawn" }).click();
  await page.locator('button.cell[title="1, 1"]').click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const exportedPath = await download.path();
  expect(exportedPath).toBeTruthy();
  const exported = JSON.parse(await readFile(exportedPath!, "utf8"));
  expect(exported.player.name).toBe("Hero");
  expect(exported.knowledge[0].imageUrl).toContain("data:image/png;base64,");
  expect(exported.knowledge.some((entry: { id: string }) => entry.id === "attention")).toBe(false);
  expect(exported.battles.some((battle: { name: string }) => battle.name === "New Battle")).toBe(true);
  expect(exported.battles.every((battle: { requiredKnowledgeIds: string[] }) => !battle.requiredKnowledgeIds.includes("attention"))).toBe(true);
  expect(JSON.stringify(exported.maps)).not.toContain('"knowledgeId":"attention"');
  expect(exported.battles.every((battle: object) => !("playerHp" in battle) && !("enemyHp" in battle))).toBe(true);
  expect(exported.maps[0].entities).toContainEqual(expect.objectContaining({ kind: "object", position: { x: 2, y: 1 } }));
  expect(Object.values(exported.maps[0].spawns)).toContainEqual({ x: 1, y: 1 });

  await page.goto("http://127.0.0.1:5174");
  await page.evaluate(() => localStorage.clear());
  await page.locator('input[type="file"]').setInputFiles(exportedPath!);
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator(".touch-controls")).toBeHidden();

  await page.locator(".touch-controls button").filter({ hasText: "Up" }).evaluate((button: HTMLButtonElement) => button.click());
  await page.locator(".touch-controls button").filter({ hasText: "Right" }).evaluate((button: HTMLButtonElement) => button.click());
  await page.locator(".touch-controls button").filter({ hasText: "Right" }).evaluate((button: HTMLButtonElement) => button.click());
  await page.locator(".touch-controls button").filter({ hasText: "Act" }).evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByText("Gather three ideas")).toBeVisible();
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  await expect(page.getByText("Gather three ideas")).toBeHidden();
  await expect(page.getByText("Press Space to inspect Archivist")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Pause menu" })).toBeVisible();
  await page.locator("summary").filter({ hasText: "Diary" }).click();
  await expect(page.getByText("Observe")).toBeVisible();
});

test("Kuzunoha saves, continues, pauses, and preserves text input", async ({ page }) => {
  await page.goto("http://127.0.0.1:5174");
  await page.evaluate(() => localStorage.clear());
  await page.getByRole("button", { name: "Play Sample Quest" }).click();
  await expect(page.locator("canvas")).toBeVisible();

  await move(page, "ArrowRight", 8);
  const answer = page.getByPlaceholder("Type the answer");
  await expect(answer).toBeFocused();
  await page.keyboard.type("wasd");
  await expect(answer).toHaveValue("wasd");
  await expect(page.getByRole("dialog", { name: "Pause menu" })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("button", { name: /Continue The Archivist's Trial/ })).toBeVisible();
  await page.getByRole("button", { name: /Continue The Archivist's Trial/ }).click();
  await expect(page.getByPlaceholder("Type the answer")).toBeVisible();
  for (let index = 0; index < 3; index += 1) {
    await page.getByPlaceholder("Type the answer").fill("wrong");
    await page.getByRole("button", { name: "Answer" }).click();
  }

  await page.getByRole("button", { name: "Continue" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Pause menu" })).toBeVisible();
  await page.getByRole("button", { name: "Save Game" }).click();
  await expect(page.getByRole("status")).toContainText("Saved");
  await page.getByRole("button", { name: "Return to Title" }).click();
  await expect(page.getByText("Unsaved progress will be lost.")).toBeVisible();
  await page.getByRole("button", { name: "Return to Title" }).click();
  await expect(page.getByRole("button", { name: /Continue The Archivist's Trial/ })).toBeVisible();
});
