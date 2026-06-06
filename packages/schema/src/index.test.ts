import { describe, expect, it } from "vitest";
import { sampleProject } from "./sampleProject";
import { validateProject } from "./index";

describe("KitsuneProject schema", () => {
  it("accepts the bundled sample project", () => {
    const result = validateProject(sampleProject);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.player).toEqual(sampleProject.player);
    }
  });

  it("accepts an empty authoring project", () => {
    const empty = structuredClone(sampleProject);
    empty.start = { mapId: "", spawnId: "" };
    empty.maps = [];
    empty.knowledge = [];
    empty.battles = [];
    empty.keys = [];

    expect(validateProject(empty).ok).toBe(true);
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

  it("defaults entities to collidable and preserves disabled collision", () => {
    const legacy = structuredClone(sampleProject);
    delete (legacy.maps[0].entities[0] as Partial<(typeof legacy.maps)[number]["entities"][number]>).collidable;
    legacy.maps[0].entities[1].collidable = false;

    const result = validateProject(legacy);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.maps[0].entities[0].collidable).toBe(true);
      expect(result.project.maps[0].entities[1].collidable).toBe(false);
    }
  });

  it("defaults battle confirmation messages for older projects", () => {
    const legacy = structuredClone(sampleProject);
    delete (legacy.battles[0] as Partial<(typeof legacy.battles)[number]>).confirmationMessage;

    const result = validateProject(legacy);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.battles[0].confirmationMessage).toBe("Start this battle?");
    }
  });

  it("accepts and strips legacy battle hp fields", () => {
    const legacy = structuredClone(sampleProject) as unknown as Record<string, unknown>;
    const battles = legacy.battles as Array<Record<string, unknown>>;
    battles[0].playerHp = 9;
    battles[0].enemyHp = 12;

    const result = validateProject(legacy);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.battles[0]).not.toHaveProperty("playerHp");
      expect(result.project.battles[0]).not.toHaveProperty("enemyHp");
    }
  });

  it("reports missing references", () => {
    const broken = structuredClone(sampleProject);
    broken.maps[0].entities[0].event.push({ type: "grantKnowledge", knowledgeId: "missing" });

    const result = validateProject(broken);

    expect(result.ok).toBe(false);
    expect(result.issues.join("\n")).toContain("missing");
  });

  it("reports duplicate map ids and names", () => {
    const broken = structuredClone(sampleProject);
    broken.maps.push({ ...structuredClone(broken.maps[0]), name: broken.maps[0].name.toUpperCase() });

    const result = validateProject(broken);

    expect(result.ok).toBe(false);
    expect(result.issues.join("\n")).toContain("duplicate ids");
    expect(result.issues.join("\n")).toContain("duplicate names");
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

  it("defaults key collections for older projects", () => {
    const legacy = structuredClone(sampleProject);
    delete (legacy as Partial<typeof legacy>).keys;
    for (const map of legacy.maps) {
      for (const entity of map.entities) {
        delete (entity as Partial<typeof entity>).rewardKeyIds;
        delete entity.lock;
      }
    }
    for (const battle of legacy.battles) {
      delete (battle as Partial<typeof battle>).rewardKeyIds;
      delete battle.lock;
    }

    const result = validateProject(legacy);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.keys).toEqual([]);
      expect(result.project.maps[0].entities.every((entity) => entity.rewardKeyIds.length === 0)).toBe(true);
      expect(result.project.battles.every((battle) => battle.rewardKeyIds.length === 0)).toBe(true);
    }
  });

  it("reports duplicate and missing key references", () => {
    const broken = structuredClone(sampleProject);
    broken.keys.push({ ...broken.keys[0] });
    broken.keys[0].spriteKey = "missing-key-sprite";
    broken.maps[0].entities[0].rewardKeyIds = ["missing-reward"];
    broken.battles[0].lock = { keyId: "missing-lock", missingKeyMessage: "Locked." };

    const result = validateProject(broken);

    expect(result.ok).toBe(false);
    expect(result.issues.join("\n")).toContain("duplicate ids");
    expect(result.issues.join("\n")).toContain("missing-key-sprite");
    expect(result.issues.join("\n")).toContain("missing-reward");
    expect(result.issues.join("\n")).toContain("missing-lock");
  });
});
