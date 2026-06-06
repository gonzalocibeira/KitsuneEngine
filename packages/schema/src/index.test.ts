import { describe, expect, it } from "vitest";
import { sampleProject } from "./sampleProject";
import { validateProject } from "./index";

describe("KitsuneProject schema", () => {
  it("accepts the bundled sample project", () => {
    const result = validateProject(sampleProject);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.player).toEqual({ name: "Hero", spriteKey: "hero", maxHp: 3 });
    }
  });

  it("defaults player config for older projects", () => {
    const legacy = structuredClone(sampleProject);
    delete (legacy as Partial<typeof sampleProject>).player;

    const result = validateProject(legacy);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.player).toEqual({ name: "Hero", maxHp: 3 });
    }
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
    broken.player.spriteKey = "missing-player-sprite";
    broken.maps[0].layers.ground.tiles[1][1] = { tilesetKey: "missing-cell-tileset", tile: 1 };

    const result = validateProject(broken);

    expect(result.ok).toBe(false);
    expect(result.issues.join("\n")).toContain("missing-tileset");
    expect(result.issues.join("\n")).toContain("missing-sprite");
    expect(result.issues.join("\n")).toContain("missing-player-sprite");
    expect(result.issues.join("\n")).toContain("missing-cell-tileset");
  });

  it("accepts knowledge images from urls or embedded data", () => {
    const withImages = structuredClone(sampleProject);
    withImages.knowledge[0].imageUrl = "https://example.com/observe.png";
    withImages.knowledge[0].imageAlt = "Observation diagram";
    withImages.knowledge[1].imageUrl = "data:image/png;base64,iVBORw0KGgo=";

    expect(validateProject(withImages).ok).toBe(true);
  });

  it("accepts mixed tileset cell references", () => {
    const mixed = structuredClone(sampleProject);
    mixed.maps[0].layers.ground.tiles[1][1] = { tilesetKey: "kenney-tiny-dungeon", tile: 12 };

    expect(validateProject(mixed).ok).toBe(true);
  });
});
