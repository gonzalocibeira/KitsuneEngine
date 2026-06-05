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
});
