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

  it("transfers maps through door events", () => {
    const runtime = new GameRuntime(sampleProject);

    runtime.interactAt({ x: 12, y: 4 });

    expect(runtime.snapshot().mapId).toBe("study-annex");
    expect(runtime.snapshot().player).toEqual({ x: 2, y: 4 });
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
  });
});

function startSampleBattle(runtime: GameRuntime) {
  runtime.interactAt({ x: 10, y: 7 });
  runtime.confirmBattle();
}
