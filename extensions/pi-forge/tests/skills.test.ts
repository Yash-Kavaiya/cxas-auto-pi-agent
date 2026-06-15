import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { lintSkill } from "../src/skilllint.js";

const here = dirname(fileURLToPath(import.meta.url));
const skillsDir = resolve(here, "..", "..", "..", "skills");

const skillNames = readdirSync(skillsDir).filter((d) =>
  existsSync(join(skillsDir, d, "SKILL.md")),
);

describe("skill conformance", () => {
  it("includes all expected skills", () => {
    expect(skillNames.sort()).toEqual([
      "cxas-wrapper",
      "evaluator",
      "improver",
      "project-orchestrator",
      "project-planner",
      "requirements-clarifier",
      "tdd-builder",
      "tester",
    ]);
  });

  for (const name of skillNames) {
    it(`${name}/SKILL.md passes lint`, () => {
      const content = readFileSync(join(skillsDir, name, "SKILL.md"), "utf8");
      expect(lintSkill(name, content)).toEqual([]);
    });
  }
});
