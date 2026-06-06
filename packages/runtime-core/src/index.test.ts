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

  it("starts with full player life and consumes every shuffled question", () => {
    const project = structuredClone(sampleProject);
    project.player.maxHp = 5;
    vi.spyOn(Math, "random").mockReturnValue(0);
    const runtime = new GameRuntime(project);
    runtime.interactAt({ x: 10, y: 7 });

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
    runtime.interactAt({ x: 10, y: 7 });

    runtime.answerBattle("wrong");
    runtime.answerBattle("wrong");

    expect(runtime.snapshot().flags.trial_complete).toBe(true);
  });

  it("consumes incorrect answers and defeats at zero life before victory", () => {
    const project = structuredClone(sampleProject);
    project.player.maxHp = 2;
    project.battles[0].requiredKnowledgeIds = ["observe", "attention"];
    const runtime = new GameRuntime(project);
    runtime.interactAt({ x: 10, y: 7 });

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

    runtime.interactAt({ x: 10, y: 7 });
    runtime.answerBattle("wrong");
    runtime.closeOverlay();
    runtime.interactAt({ x: 10, y: 7 });

    const snapshot = runtime.snapshot();
    expect(snapshot.overlay.type).toBe("battle");
    if (snapshot.overlay.type === "battle") {
      expect(snapshot.overlay.battle.playerHp).toBe(1);
      expect(snapshot.overlay.battle.questionsRemaining).toBe(project.battles[0].requiredKnowledgeIds.length);
    }
  });
});
