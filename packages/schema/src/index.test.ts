import { describe, expect, it } from "vitest";
import { sampleProject } from "./sampleProject";
import { validateProject } from "./index";

describe("KitsuneProject schema", () => {
  it("accepts the bundled sample project", () => {
    expect(validateProject(sampleProject).ok).toBe(true);
  });

  it("reports missing references", () => {
    const broken = structuredClone(sampleProject);
    broken.maps[0].entities[0].event.push({ type: "grantKnowledge", knowledgeId: "missing" });

    const result = validateProject(broken);

    expect(result.ok).toBe(false);
    expect(result.issues.join("\n")).toContain("missing");
  });

  it("reports missing asset references", () => {
    const broken = structuredClone(sampleProject);
    broken.maps[0].tilesetKey = "missing-tileset";
    broken.maps[0].entities[0].spriteKey = "missing-sprite";
    broken.maps[0].layers.ground.tiles[1][1] = { tilesetKey: "missing-cell-tileset", tile: 1 };

    const result = validateProject(broken);

    expect(result.ok).toBe(false);
    expect(result.issues.join("\n")).toContain("missing-tileset");
    expect(result.issues.join("\n")).toContain("missing-sprite");
    expect(result.issues.join("\n")).toContain("missing-cell-tileset");
  });

  it("accepts mixed tileset cell references", () => {
    const mixed = structuredClone(sampleProject);
    mixed.maps[0].layers.ground.tiles[1][1] = { tilesetKey: "kenney-tiny-dungeon", tile: 12 };

    expect(validateProject(mixed).ok).toBe(true);
  });
});
