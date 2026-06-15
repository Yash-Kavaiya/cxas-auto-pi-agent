const ALLOWED_FORGE_TOOLS = new Set([
  "forge_status",
  "forge_advance",
  "forge_gate",
  "forge_checkpoint",
  "forge_note",
  "forge_metric",
  "forge_route",
  "forge_artifact",
  "forge_cxas",
]);

/**
 * Structural lint for a SKILL.md. Returns a list of problems (empty = clean).
 * Validates frontmatter (name/description), name match + format, and that the
 * body references only real forge_* tools and well-formed artifact paths.
 */
export function lintSkill(expectedName: string, content: string): string[] {
  const problems: string[] = [];

  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) {
    problems.push("missing YAML frontmatter");
    return problems;
  }
  const block = fm[1] ?? "";
  const body = content.slice(fm[0].length);

  const nameMatch = block.match(/^name:[ \t]*(.*)$/m);
  const name = nameMatch?.[1]?.trim() ?? "";
  if (!name) {
    problems.push("frontmatter: missing name");
  } else {
    if (name !== expectedName) {
      problems.push(`frontmatter: name '${name}' != directory '${expectedName}'`);
    }
    if (!/^[a-z0-9-]{1,64}$/.test(name)) {
      problems.push(`frontmatter: name '${name}' must be lowercase/hyphen, <=64 chars`);
    }
  }

  const descMatch = block.match(/^description:[ \t]*(.*)$/m);
  const desc = descMatch?.[1]?.trim() ?? "";
  if (!desc) {
    problems.push("frontmatter: missing description");
  } else if (desc.length > 1024) {
    problems.push(`frontmatter: description exceeds 1024 chars (${desc.length})`);
  }

  for (const m of body.matchAll(/\bforge_[a-z_]+/g)) {
    const tool = m[0];
    if (!ALLOWED_FORGE_TOOLS.has(tool)) {
      problems.push(`body: references unknown tool '${tool}'`);
    }
  }

  for (const m of body.matchAll(/artifacts\/[^\s)`'"]*/g)) {
    const path = m[0];
    if (path.includes("..") || path.includes("//")) {
      problems.push(`body: malformed artifact path '${path}'`);
    }
  }

  return [...new Set(problems)];
}
