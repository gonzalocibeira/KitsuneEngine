import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleProject } from "@kitsune/schema/sampleProject";
import { GameRuntime } from "./index";

describe("GameRuntime", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("grants diary knowledge through object events", () => {
    const runtime = new GameRuntime(sampleProject);

    runtime.interactAt({ x: 3, y: 2 });

    expect(runtime.snapshot().diary).toContain("attention");
  });

  it("blocks locked entities until their key is acquired", () => {
    const runtime = new GameRuntime(sampleProject);

    runtime.interactAt({ x: 12, y: 4 });
    expect(runtime.snapshot().mapId).toBe("library-yard");
    expect(runtime.snapshot().overlay).toEqual({
      type: "dialogue",
      messages: [{ text: "The annex door is locked. Find its key." }]
    });

    runtime.closeOverlay();
    runtime.interactAt({ x: 3, y: 2 });
    runtime.closeOverlay();
    runtime.interactAt({ x: 12, y: 4 });

    expect(runtime.snapshot().mapId).toBe("study-annex");
    expect(runtime.snapshot().player).toEqual({ x: 2, y: 4 });
    expect(runtime.snapshot().inventoryKeyIds).toEqual(["annex-key"]);
    expect(runtime.snapshot().inventoryKeys.map((key) => key.id)).toEqual(["annex-key"]);
  });

  it("keeps collision-layer tiles blocking movement", () => {
    const project = structuredClone(sampleProject);
    project.maps[0].layers.collision.tiles[7][3] = 1;
    const runtime = new GameRuntime(project);

    expect(runtime.move(1, 0)).toBe(false);
    expect(runtime.snapshot().player).toEqual({ x: 2, y: 7 });
  });

  it("blocks movement into entities by default", () => {
    const runtime = new GameRuntime(sampleProject);

    expect(runtime.move(1, 0)).toBe(true);
    expect(runtime.move(0, -1)).toBe(true);
    expect(runtime.move(0, -1)).toBe(true);
    expect(runtime.move(0, -1)).toBe(true);
    expect(runtime.move(0, -1)).toBe(true);
    expect(runtime.move(0, -1)).toBe(false);
    expect(runtime.snapshot().player).toEqual({ x: 3, y: 3 });
  });

  it("allows movement through entities with collision disabled", () => {
    const project = structuredClone(sampleProject);
    const entity = project.maps[0].entities.find((candidate) => candidate.id === "lantern");
    if (!entity) throw new Error("Missing lantern");
    entity.collidable = false;
    const runtime = new GameRuntime(project);

    expect(runtime.move(1, 0)).toBe(true);
    expect(runtime.move(0, -1)).toBe(true);
    expect(runtime.move(0, -1)).toBe(true);
    expect(runtime.move(0, -1)).toBe(true);
    expect(runtime.move(0, -1)).toBe(true);
    expect(runtime.move(0, -1)).toBe(true);
    expect(runtime.snapshot().player).toEqual({ x: 3, y: 2 });
  });

  it("blocks movement into battle entities and asks for confirmation", () => {
    const runtime = new GameRuntime(sampleProject);

    for (let index = 0; index < 7; index += 1) {
      expect(runtime.move(1, 0)).toBe(true);
    }
    expect(runtime.move(1, 0)).toBe(false);

    runtime.interact();

    expect(runtime.snapshot().overlay).toEqual({
      type: "battleConfirmation",
      battleId: "memory-trial",
      message: "Challenge the Restless Page?"
    });
  });

  it("can cancel or confirm a battle before it starts", () => {
    const runtime = new GameRuntime(sampleProject);

    runtime.interactAt({ x: 10, y: 7 });
    runtime.closeOverlay();
    expect(runtime.snapshot().overlay).toEqual({ type: "none" });

    runtime.interactAt({ x: 10, y: 7 });
    runtime.confirmBattle();
    expect(runtime.snapshot().overlay.type).toBe("battle");
  });

  it("starts with full player life and consumes every shuffled question", () => {
    const project = structuredClone(sampleProject);
    project.player.maxHp = 5;
    vi.spyOn(Math, "random").mockReturnValue(0);
    const runtime = new GameRuntime(project);
    startSampleBattle(runtime);

    const askedKnowledgeIds = new Set<string>();
    let expectedRemaining = project.battles[0].requiredKnowledgeIds.length;
    const firstSnapshot = runtime.snapshot();
    expect(firstSnapshot.overlay.type).toBe("battle");
    if (firstSnapshot.overlay.type === "battle") {
      expect(firstSnapshot.overlay.battle.knowledgeId).not.toBe(project.battles[0].requiredKnowledgeIds[0]);
    }

    while (true) {
      const snapshot = runtime.snapshot();
      if (snapshot.overlay.type !== "battle") break;
      expect(snapshot.overlay.battle.playerHp).toBe(5);
      expect(snapshot.overlay.battle.questionsRemaining).toBe(expectedRemaining);
      askedKnowledgeIds.add(snapshot.overlay.battle.knowledgeId);
      runtime.answerBattle(snapshot.overlay.battle.answer);
      expectedRemaining -= 1;
    }

    expect(askedKnowledgeIds).toEqual(new Set(project.battles[0].requiredKnowledgeIds));
    expect(runtime.snapshot().flags.trial_complete).toBe(true);
  });

  it("counts incorrect attempted questions toward victory while life remains", () => {
    const project = structuredClone(sampleProject);
    project.player.maxHp = 3;
    project.battles[0].requiredKnowledgeIds = ["observe", "attention"];
    const runtime = new GameRuntime(project);
    startSampleBattle(runtime);

    runtime.answerBattle("wrong");
    runtime.answerBattle("wrong");

    expect(runtime.snapshot().flags.trial_complete).toBe(true);
  });

  it("consumes incorrect answers and defeats at zero life before victory", () => {
    const project = structuredClone(sampleProject);
    project.player.maxHp = 2;
    project.battles[0].requiredKnowledgeIds = ["observe", "attention"];
    const runtime = new GameRuntime(project);
    startSampleBattle(runtime);

    runtime.answerBattle("wrong");
    let snapshot = runtime.snapshot();
    expect(snapshot.overlay.type).toBe("battle");
    if (snapshot.overlay.type === "battle") {
      expect(snapshot.overlay.battle.playerHp).toBe(1);
      expect(snapshot.overlay.battle.questionsRemaining).toBe(1);
    }

    runtime.answerBattle("wrong");
    snapshot = runtime.snapshot();
    expect(snapshot.overlay.type).toBe("dialogue");
    expect(snapshot.flags.trial_complete).not.toBe(true);
  });

  it("resets player life when a new battle starts", () => {
    const project = structuredClone(sampleProject);
    project.player.maxHp = 1;
    const runtime = new GameRuntime(project);

    startSampleBattle(runtime);
    runtime.answerBattle("wrong");
    runtime.closeOverlay();
    startSampleBattle(runtime);

    const snapshot = runtime.snapshot();
    expect(snapshot.overlay.type).toBe("battle");
    if (snapshot.overlay.type === "battle") {
      expect(snapshot.overlay.battle.playerHp).toBe(1);
      expect(snapshot.overlay.battle.questionsRemaining).toBe(project.battles[0].requiredKnowledgeIds.length);
    }
  });

  it("restores an active dialogue exactly", () => {
    const runtime = new GameRuntime(sampleProject);
    runtime.interactAt({ x: 3, y: 2 });

    const restored = new GameRuntime(sampleProject, runtime.saveState());

    expect(restored.snapshot().overlay).toEqual(runtime.snapshot().overlay);
    expect(restored.snapshot().diary).toContain("attention");
  });

  it("restores an active battle and its remaining shuffled questions", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const runtime = new GameRuntime(sampleProject);
    startSampleBattle(runtime);
    const first = runtime.snapshot();
    expect(first.overlay.type).toBe("battle");
    if (first.overlay.type !== "battle") return;

    runtime.answerBattle(first.overlay.battle.answer);
    const saved = runtime.saveState();
    const restored = new GameRuntime(sampleProject, saved);

    expect(restored.snapshot().overlay).toEqual(runtime.snapshot().overlay);
    expect(restored.saveState().battleQuestionQueue).toEqual(saved.battleQuestionQueue);
  });

  it("loads legacy exploration saves without an overlay", () => {
    const runtime = new GameRuntime(sampleProject);
    runtime.move(1, 0);
    const { saveVersion: _saveVersion, overlay: _overlay, battleQuestionQueue: _battleQuestionQueue, ...legacy } = runtime.saveState();

    const restored = new GameRuntime(sampleProject, legacy);

    expect(restored.snapshot().player).toEqual(runtime.snapshot().player);
    expect(restored.snapshot().overlay).toEqual({ type: "none" });
    expect(restored.snapshot().inventoryKeyIds).toEqual([]);
  });

  it("grants multiple entity keys idempotently", () => {
    const project = structuredClone(sampleProject);
    project.keys.push({ id: "second-key", name: "Second Key" });
    const lantern = project.maps[0].entities.find((entity) => entity.id === "lantern");
    if (!lantern) throw new Error("Missing lantern");
    lantern.rewardKeyIds = ["annex-key", "second-key"];
    const runtime = new GameRuntime(project);

    runtime.interactAt(lantern.position);

    expect(runtime.snapshot().inventoryKeyIds).toEqual(["annex-key", "second-key"]);
    expect(runtime.snapshot().overlay).toEqual({
      type: "dialogue",
      messages: [{ speaker: undefined, text: "The lantern marks attention: notice first, name second." }],
      nextOverlay: {
        type: "keyAcquisition",
        keyIds: ["annex-key", "second-key"],
        nextOverlay: { type: "none" }
      }
    });

    runtime.closeOverlay();
    expect(runtime.snapshot().overlay).toEqual({
      type: "keyAcquisition",
      keyIds: ["annex-key", "second-key"],
      nextOverlay: { type: "none" }
    });
    runtime.closeOverlay();
    runtime.interactAt(lantern.position);
    expect(runtime.snapshot().overlay).toEqual({
      type: "dialogue",
      messages: [{ speaker: undefined, text: "The lantern marks attention: notice first, name second." }]
    });
  });

  it("does not grant entity rewards when a locked battle command is blocked", () => {
    const project = structuredClone(sampleProject);
    const battleEntity = project.maps.flatMap((map) => map.entities).find((entity) => entity.id === "trial-stone");
    if (!battleEntity) throw new Error("Missing battle entity");
    battleEntity.rewardKeyIds = ["annex-key"];
    project.battles[0].lock = { keyId: "annex-key", missingKeyMessage: "Battle locked." };
    const runtime = new GameRuntime(project);

    runtime.interactAt(battleEntity.position);

    expect(runtime.snapshot().overlay).toEqual({ type: "dialogue", messages: [{ text: "Battle locked." }] });
    expect(runtime.snapshot().inventoryKeyIds).toEqual([]);
  });

  it("grants battle rewards only on victory", () => {
    const project = structuredClone(sampleProject);
    project.player.maxHp = 1;
    project.battles[0].requiredKnowledgeIds = ["observe"];
    project.battles[0].rewardKeyIds = ["annex-key"];
    const defeated = new GameRuntime(project);
    startSampleBattle(defeated);
    defeated.answerBattle("wrong");
    expect(defeated.snapshot().inventoryKeyIds).toEqual([]);

    const victorious = new GameRuntime(project);
    startSampleBattle(victorious);
    const snapshot = victorious.snapshot();
    if (snapshot.overlay.type !== "battle") throw new Error("Battle did not start");
    victorious.answerBattle(snapshot.overlay.battle.answer);
    expect(victorious.snapshot().inventoryKeyIds).toEqual(["annex-key"]);
    expect(victorious.snapshot().overlay).toEqual({
      type: "dialogue",
      messages: [{ text: "Victory over Restless Page." }],
      nextOverlay: {
        type: "keyAcquisition",
        keyIds: ["annex-key"],
        nextOverlay: { type: "none" }
      }
    });
  });

  it("restores inventory and migrates version 1 saves with an empty inventory", () => {
    const runtime = new GameRuntime(sampleProject);
    runtime.interactAt({ x: 3, y: 2 });
    const saved = runtime.saveState();
    const restored = new GameRuntime(sampleProject, saved);
    expect(restored.snapshot().inventoryKeyIds).toEqual(["annex-key"]);

    const { inventoryKeyIds: _inventoryKeyIds, saveVersion: _saveVersion, ...version1Fields } = saved;
    const version1 = { ...version1Fields, saveVersion: 1 as const };
    const migrated = new GameRuntime(sampleProject, version1);
    expect(migrated.saveState().saveVersion).toBe(2);
    expect(migrated.snapshot().inventoryKeyIds).toEqual([]);
  });
});

function startSampleBattle(runtime: GameRuntime) {
  runtime.interactAt({ x: 10, y: 7 });
  runtime.confirmBattle();
}
