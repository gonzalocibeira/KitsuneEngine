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

async function touchActions(page: import("@playwright/test").Page, actions: Array<"Up" | "Right" | "Down" | "Left" | "Act">) {
  for (const action of actions) {
    await page.locator(".touch-controls button").filter({ hasText: action }).evaluate((button: HTMLButtonElement) => button.click());
  }
}

async function loginToTamamo(page: import("@playwright/test").Page) {
  await page.goto("/tamamo");
  await page.getByRole("button", { name: "Login" }).click();
}

test("launcher navigates between the shared applications", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kitsune" })).toBeVisible();
  await expect(page.locator("[data-branded-home]")).toBeVisible();

  await page.getByRole("link", { name: /Go to Tamamo/ }).click();
  await expect(page).toHaveURL(/\/tamamo$/);
  await expect(page.getByRole("heading", { name: "Tamamo" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tamamo" })).toBeVisible();
  await page.getByRole("link", { name: "Back to Kitsune" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole("link", { name: /Go to Kuzunoha/ }).click();
  await expect(page).toHaveURL(/\/kuzunoha$/);
  await expect(page.getByRole("heading", { name: "Kuzunoha" })).toBeVisible();
  await expect(page.locator("[data-branded-home]")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Kuzunoha" })).toBeVisible();
  await page.getByRole("link", { name: "Back to Kitsune" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("Tamamo requires placeholder login before opening the editor", async ({ page }) => {
  await page.goto("/tamamo");

  await expect(page.getByRole("heading", { name: "Tamamo" })).toBeVisible();
  await expect(page.locator("[data-branded-home]")).toBeVisible();
  await expect(page.getByLabel("Username")).toBeVisible();
  await expect(page.getByLabel("Password")).toHaveAttribute("type", "password");
  await expect(page.getByRole("button", { name: "Login" })).toBeVisible();
  await expect(page.getByLabel("New map name")).toHaveCount(0);

  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByLabel("New map name")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Kitsune" })).toBeVisible();
});

test("Tamamo paints a newly created map", async ({ page }) => {
  await loginToTamamo(page);
  await page.getByLabel("New map name").fill("Paint Test");
  await page.getByRole("button", { name: "Create Map", exact: true }).click();
  await page.getByLabel("Layer").selectOption("collision");
  await page.getByRole("button", { name: "Kenney Tiny Town 1", exact: true }).click();

  const singleClick = page.locator('button.cell[title="5, 0"]');
  await singleClick.click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const exportedPath = await download.path();
  expect(exportedPath).toBeTruthy();
  const exported = JSON.parse(await readFile(exportedPath!, "utf8"));
  expect(exported.maps[0].layers.collision.tiles[0].slice(0, 7)).toEqual([0, 0, 0, 0, 0, 1, 0]);
});

test("Tamamo starts empty and manages maps", async ({ page }) => {
  await loginToTamamo(page);

  await expect(page.getByRole("heading", { name: "No maps exist yet" })).toBeVisible();
  await expect(page.getByText("Create a map to begin building your game world.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Paint" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Spawn" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Place on Map" })).toBeDisabled();

  await page.getByLabel("New map name").fill("Village");
  await page.getByRole("button", { name: "Create Map", exact: true }).click();
  await expect(page.getByLabel("Map selection")).toHaveValue("map-1");
  await expect(page.locator(".tile-grid")).toBeVisible();

  await page.getByLabel("New map name").fill("Village");
  await page.getByRole("button", { name: "Create Map", exact: true }).click();
  await expect(page.getByText('A map named "Village" already exists.')).toBeVisible();
  await expect(page.getByLabel("Map selection").locator("option")).toHaveCount(1);

  await page.getByLabel("Rename Map").fill("Town Square");
  await page.getByRole("button", { name: "Rename Map" }).click();
  await expect(page.getByLabel("Map selection").locator("option")).toHaveText(["Town Square"]);

  await page.getByRole("button", { name: "Delete Map" }).click();
  const confirmation = page.getByRole("dialog", { name: "Delete map?" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Delete Map" }).click();
  await expect(page.getByRole("heading", { name: "No maps exist yet" })).toBeVisible();
});

test("Tamamo confirms before replacing the project with sample content", async ({ page }) => {
  await loginToTamamo(page);
  const title = page.locator(".title-input");
  await title.fill("Unsaved project");

  await page.getByRole("button", { name: "Sample", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Load sample content?" });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText("Any unsaved changes will be lost.");
  await expect(confirmation.getByRole("button", { name: "Cancel" })).toBeFocused();
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmation).toBeHidden();
  await expect(title).toHaveValue("Unsaved project");

  await page.getByRole("button", { name: "Sample", exact: true }).click();
  await confirmation.getByRole("button", { name: "Load Sample" }).click();
  await expect(confirmation).toBeHidden();
  await expect(title).not.toHaveValue("Unsaved project");
  await expect(page.getByText("Sample quest loaded.")).toBeVisible();
});

test("Tamamo edits recursive battle and key branches", async ({ page }) => {
  await loginToTamamo(page);
  await page.getByRole("button", { name: "Sample", exact: true }).click();
  await page.getByRole("dialog", { name: "Load sample content?" }).getByRole("button", { name: "Load Sample" }).click();

  await page.locator('select:has(option[value="trial-stone"])').selectOption("trial-stone");
  await expect(page.getByLabel("Branch condition").first()).toHaveValue("battlePassed");
  await expect(page.getByLabel("Branch battle").first()).toHaveValue("memory-trial");
  await expect(page.getByRole("heading", { name: "Condition met" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Condition not met" })).toBeVisible();

  await page.getByLabel("Branch condition").first().selectOption("hasKey");
  await expect(page.getByLabel("Branch key").first()).toHaveValue("annex-key");
  await page.locator(".branch-path").first().getByRole("button", { name: "Dialogue" }).click();
  await page.locator(".branch-path").first().locator("textarea").last().fill("The branch editor works.");
  await page.locator(".right-panel .stack > .event-editor > .button-row > button").filter({ hasText: "Branch" }).click();
  await expect(page.getByLabel("Branch condition")).toHaveCount(2);
  const levelOnePath = page.locator('.event-editor[data-branch-depth="1"]').first();
  await levelOnePath.locator(":scope > .button-row > button").filter({ hasText: "Branch" }).click();
  const levelTwoPath = page.locator('.event-editor[data-branch-depth="2"]').first();
  await levelTwoPath.locator(":scope > .button-row > button").filter({ hasText: "Branch" }).click();
  const levelThreeBranchButton = page.locator('.event-editor[data-branch-depth="3"]').first().locator(":scope > .button-row > button").filter({ hasText: "Branch" });
  await expect(levelThreeBranchButton).toBeDisabled();
  await expect(levelThreeBranchButton).toHaveAttribute("title", "Branches are limited to 3 nested levels.");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const exportedPath = await download.path();
  const exported = JSON.parse(await readFile(exportedPath!, "utf8"));
  const trialStone = exported.maps[0].entities.find((entity: { id: string }) => entity.id === "trial-stone");
  expect(trialStone.event[0].condition).toEqual({ type: "hasKey", keyId: "annex-key" });
  expect(trialStone.event[0].then).toContainEqual({ type: "dialogue", text: "The branch editor works." });
  expect(trialStone.event.at(-1).condition).toEqual({ type: "battlePassed", battleId: "memory-trial" });
});

test("Tamamo playtests unsaved changes without changing normal saves", async ({ page }) => {
  await loginToTamamo(page);
  await page.getByRole("button", { name: "Sample", exact: true }).click();
  await page.getByRole("dialog", { name: "Load sample content?" }).getByRole("button", { name: "Load Sample" }).click();
  await page.locator(".title-input").fill("Unsaved Playtest Project");
  await page.evaluate(() => {
    localStorage.setItem("kitsune-save:latest", "normal-latest-save");
    localStorage.setItem("kitsune-save:untouched", "normal-project-save");
  });
  const storageBefore = await page.evaluate(() => JSON.stringify(localStorage));

  await page.getByRole("button", { name: "Playtest" }).click();

  await expect(page).toHaveURL(/\/kuzunoha\/playtest$/);
  await expect(page.getByLabel("Playtest mode")).toBeVisible();
  await expect(page.getByLabel("World status")).toBeVisible();
  await touchActions(page, ["Right"]);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(storageBefore);

  await page.keyboard.press("Escape");
  const pauseMenu = page.getByRole("dialog", { name: "Pause menu" });
  await expect(pauseMenu).toContainText("Unsaved Playtest Project");
  await expect(pauseMenu.getByRole("button", { name: "Save Game" })).toHaveCount(0);
  await expect(pauseMenu.getByRole("button", { name: "Return to Title" })).toHaveCount(0);
  await pauseMenu.getByRole("link", { name: "Back to Editor" }).click();

  await expect(page).toHaveURL(/\/tamamo$/);
  await expect(page.locator(".title-input")).toHaveValue("Unsaved Playtest Project");
  await expect(page.getByLabel("New map name")).toBeVisible();
});

test("Kuzunoha playtest route requires a Tamamo handoff", async ({ page }) => {
  await page.goto("/kuzunoha/playtest");

  await expect(page.getByText("Playtest Unavailable")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Return to Tamamo to start a playtest" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Editor" })).toBeVisible();
});

test("Tamamo export loads and plays in Kuzunoha", async ({ page }) => {
  await loginToTamamo(page);
  await page.getByRole("button", { name: "Sample", exact: true }).click();
  await page.getByRole("dialog", { name: "Load sample content?" }).getByRole("button", { name: "Load Sample" }).click();
  await expect(page.getByText("Project is export-ready.")).toBeVisible();
  const editorTabs = page.getByLabel("Editor sections");
  await expect(editorTabs.getByRole("button", { name: "Entity" })).toBeVisible();
  await expect(editorTabs.getByRole("button", { name: "Notes" })).toBeVisible();
  await expect(editorTabs.getByRole("button", { name: "Battle" })).toBeVisible();
  await expect(editorTabs.getByRole("button", { name: "Keys" })).toBeVisible();
  await expect(editorTabs.getByRole("button", { name: "Player" })).toBeVisible();
  await expect(page.locator(".left-panel").getByRole("button", { name: "Entity" })).toHaveCount(0);

  await editorTabs.getByRole("button", { name: "Player" }).click();
  await page.getByRole("button", { name: "Choose Sprite" }).click();
  const spritePicker = page.getByRole("dialog", { name: "Choose player sprite" });
  await expect(spritePicker).toBeVisible();
  await spritePicker.getByRole("button", { name: "Close sprite picker" }).click();
  await expect(spritePicker).toBeHidden();

  await editorTabs.getByRole("button", { name: "Keys" }).click();
  await page.getByRole("button", { name: "Add Key" }).click();
  await page.getByLabel("Key ID").fill("temporary-key");
  await page.getByLabel("Name", { exact: true }).fill("Temporary Key");
  await page.getByRole("button", { name: "Choose Sprite" }).click();
  const keySpritePicker = page.getByRole("dialog", { name: "Choose key sprite" });
  await keySpritePicker.getByRole("button").nth(1).click();

  await editorTabs.getByRole("button", { name: "Entity" }).click();
  await page.getByLabel("Required Key").selectOption("temporary-key");
  await page.locator(".key-progression .add-question-row select").selectOption("temporary-key");
  await page.getByRole("button", { name: "Add Reward" }).click();
  await page.getByRole("button", { name: "Place on Map" }).click();
  await page.locator('button.cell[title="2, 1"]').click();
  await expect(page.getByRole("button", { name: "Place on Map" })).toBeVisible();
  const collisionToggle = page.getByRole("checkbox", { name: "Blocks player movement" });
  await expect(collisionToggle).toBeChecked();
  await collisionToggle.uncheck();

  await editorTabs.getByRole("button", { name: "Notes" }).click();
  await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles({
    name: "knowledge-dot.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64")
  });
  await expect(page.locator(".knowledge-image-preview img").first()).toBeVisible();

  await editorTabs.getByRole("button", { name: "Battle" }).click();
  await page.getByRole("button", { name: "Add Battle" }).click();
  const battleSelect = page.locator(".content-panel").getByRole("combobox").first();
  await expect(battleSelect).toHaveValue("battle-2");
  await page.getByLabel("Confirmation Message").fill("Begin the new battle?");
  await expect(page.getByLabel("Player HP")).toHaveCount(0);
  await expect(page.getByLabel("Enemy HP")).toHaveCount(0);
  await page.getByRole("button", { name: "Add Question" }).click();
  await page.getByLabel("Required Key").selectOption("temporary-key");
  await page.locator(".key-progression .add-question-row select").selectOption("temporary-key");
  await page.getByRole("button", { name: "Add Reward" }).click();

  await editorTabs.getByRole("button", { name: "Keys" }).click();
  await page.locator(".right-panel .content-panel").getByRole("combobox").first().selectOption("temporary-key");
  await page.getByRole("button", { name: "Delete Key" }).click();

  await editorTabs.getByRole("button", { name: "Notes" }).click();
  await page.getByLabel("Note").selectOption("attention");
  const newBattleMembership = page.locator(".membership-row").filter({ hasText: "New Battle" });
  await expect(newBattleMembership).toBeVisible();
  await newBattleMembership.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("button", { name: "Add to Battle" }).click();
  await expect(newBattleMembership).toBeVisible();

  await editorTabs.getByRole("button", { name: "Battle" }).click();
  await battleSelect.selectOption("battle-2");
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
  const bundledSample = JSON.parse(await readFile(new URL("../../packages/schema/src/sample-learning-quest.kitsune.json", import.meta.url), "utf8"));
  expect(exported.player.name).toBe(bundledSample.player.name);
  expect(exported.knowledge[0].imageUrl).toContain("data:image/png;base64,");
  expect(exported.knowledge.some((entry: { id: string }) => entry.id === "attention")).toBe(false);
  expect(exported.battles.some((battle: { name: string }) => battle.name === "New Battle")).toBe(true);
  expect(exported.battles.some((battle: { confirmationMessage: string }) => battle.confirmationMessage === "Begin the new battle?")).toBe(true);
  expect(exported.battles.every((battle: { requiredKnowledgeIds: string[] }) => !battle.requiredKnowledgeIds.includes("attention"))).toBe(true);
  expect(JSON.stringify(exported.maps)).not.toContain('"knowledgeId":"attention"');
  expect(exported.battles.every((battle: object) => !("playerHp" in battle) && !("enemyHp" in battle))).toBe(true);
  expect(JSON.stringify(exported)).not.toContain("temporary-key");
  expect(exported.maps[0].entities).toContainEqual(expect.objectContaining({ kind: "object", position: { x: 2, y: 1 }, collidable: false }));
  expect(Object.values(exported.maps[0].spawns)).toContainEqual({ x: 1, y: 1 });

  await page.goto("/kuzunoha");
  await page.evaluate(() => localStorage.clear());
  await page.locator('input[type="file"]').setInputFiles(exportedPath!);
  await expect(page.getByLabel("World status")).toBeVisible();
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

test("Kuzunoha unlocks content with persistent inventory keys", async ({ page }) => {
  await page.goto("/kuzunoha");
  await page.evaluate(() => localStorage.clear());
  await page.getByRole("button", { name: "Play Sample Quest" }).click();
  const worldHud = page.getByLabel("World status");
  await expect(worldHud).toContainText("Library Yard");
  await expect(worldHud).toContainText("Diary0");
  await expect(worldHud).toContainText("Inventory0");

  await touchActions(page, ["Up", "Up", "Right", "Right", "Right", "Right", "Right", "Up", "Right", "Right", "Right", "Right", "Act"]);
  await expect(page.getByText("The annex door is locked. Find its key.")).toBeVisible();
  await expect(worldHud).toBeHidden();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(worldHud).toBeVisible();

  await touchActions(page, ["Up", "Up", "Left", "Left", "Left", "Left", "Left", "Left", "Left", "Act"]);
  await expect(page.getByText("The lantern marks attention")).toBeVisible();
  await expect(worldHud).toBeHidden();
  await page.getByRole("button", { name: "Continue" }).click();
  const keyAcquired = page.getByRole("dialog", { name: "Key acquired" });
  await expect(keyAcquired).toBeVisible();
  await expect(keyAcquired.getByText("Annex Key")).toBeVisible();
  await expect(worldHud).toBeHidden();
  await keyAcquired.getByRole("button", { name: "Continue" }).click();
  await expect(worldHud).toContainText("Diary1");
  await expect(worldHud).toContainText("Inventory1");

  await page.keyboard.press("Escape");
  await expect(worldHud).toBeHidden();
  await expect(page.getByRole("link", { name: "Back to Kitsune" })).toBeVisible();
  await page.locator("summary").filter({ hasText: "Inventory" }).click();
  await expect(page.getByText("Annex Key")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(worldHud).toBeVisible();

  await touchActions(page, ["Right", "Right", "Right", "Right", "Right", "Right", "Right", "Right", "Down", "Act"]);
  await expect(page.getByText("The annex door opens into a quieter study room.")).toBeVisible();
  await expect(worldHud).toBeHidden();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(worldHud).toContainText("Study Annex");
  await page.keyboard.press("Escape");
  await expect(page.getByText("Study Annex")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: /Continue The Archivist's Trial/ }).click();
  await page.keyboard.press("Escape");
  await page.locator("summary").filter({ hasText: "Inventory" }).click();
  await expect(page.getByText("Annex Key")).toBeVisible();
});

test("Kuzunoha saves, continues, pauses, and preserves text input", async ({ page }) => {
  await page.goto("/kuzunoha");
  await page.evaluate(() => localStorage.clear());
  await page.getByRole("button", { name: "Play Sample Quest" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  const worldHud = page.getByLabel("World status");
  await expect(worldHud).toBeVisible();

  await move(page, "ArrowRight", 8);
  await expect(worldHud).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Confirm battle" })).toHaveCount(0);
  await page.keyboard.press("Space");
  await expect(page.getByRole("dialog", { name: "Confirm battle" })).toContainText("Challenge the Restless Page?");
  await expect(worldHud).toBeHidden();
  await page.getByRole("button", { name: "Start Battle" }).click();
  await expect(worldHud).toBeHidden();
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
