import { describe, it, expect } from "vitest";
import { lintSkill } from "../src/skilllint.js";

const good = `---
name: demo-skill
description: A valid demo skill that references forge_advance and writes artifacts/brief.md.
---

# Demo

Use forge_status then forge_advance. Write artifacts/brief.md.
`;

describe("lintSkill", () => {
  it("passes a well-formed skill", () => {
    expect(lintSkill("demo-skill", good)).toEqual([]);
  });
  it("flags missing frontmatter", () => {
    expect(lintSkill("x", "# no frontmatter")).toContain("missing YAML frontmatter");
  });
  it("flags a name mismatch", () => {
    const out = lintSkill("other-name", good);
    expect(out.some((p) => /name/.test(p))).toBe(true);
  });
  it("flags an empty description", () => {
    const c = `---\nname: demo-skill\ndescription:\n---\n\nbody`;
    expect(lintSkill("demo-skill", c).some((p) => /description/.test(p))).toBe(true);
  });
  it("flags an over-long description", () => {
    const long = "d".repeat(1025);
    const c = `---\nname: demo-skill\ndescription: ${long}\n---\n\nbody forge_advance`;
    expect(lintSkill("demo-skill", c).some((p) => /1024/.test(p))).toBe(true);
  });
  it("flags an unknown forge_ tool reference", () => {
    const c = `---\nname: demo-skill\ndescription: ok\n---\n\nuse forge_teleport now`;
    expect(lintSkill("demo-skill", c).some((p) => /forge_teleport/.test(p))).toBe(true);
  });
  it("flags a traversal in an artifact path", () => {
    const c = `---\nname: demo-skill\ndescription: ok\n---\n\nwrite artifacts/../secret`;
    expect(lintSkill("demo-skill", c).some((p) => /artifact path/.test(p))).toBe(true);
  });
});
