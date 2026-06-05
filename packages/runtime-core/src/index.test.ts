import { describe, expect, it } from "vitest";
import { sampleProject } from "@kitsune/schema/sampleProject";
import { GameRuntime } from "./index";

describe("GameRuntime", () => {
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

  it("sets the victory flag after correct quiz answers", () => {
    const runtime = new GameRuntime(sampleProject);
    runtime.interactAt({ x: 4, y: 6 });
    runtime.interactAt({ x: 3, y: 2 });
    runtime.interactAt({ x: 6, y: 4 });
    runtime.interactAt({ x: 10, y: 7 });

    let snapshot = runtime.snapshot();
    expect(snapshot.overlay.type).toBe("battle");

    for (let i = 0; i < 3; i += 1) {
      snapshot = runtime.snapshot();
      if (snapshot.overlay.type !== "battle") break;
      runtime.answerBattle(snapshot.overlay.battle.answer);
    }

    expect(runtime.snapshot().flags.trial_complete).toBe(true);
  });
});
