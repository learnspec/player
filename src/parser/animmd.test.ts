// Core AnimMD grammar cases — a subset of the reference implementation's
// mirrored suites, enough to pin this player's parser to the same language.
import { describe, expect, it } from "vitest";
import { isPlayable, parseAnimScript } from "./animmd";

const SCRIPT = `---
pace: learner
bind:
  oceans: {node: O}
  evaporation: {edge: [O, V]}
  legend: {label: "vapour"}
---

## Where it starts
show: oceans
focus: oceans

Most of Earth's water sits in the oceans.

## Evaporation
draw: evaporation
pulse: evaporation

Solar energy lifts the water.
`;

describe("parseAnimScript", () => {
  it("parses bind intents, steps, directives and captions", () => {
    const r = parseAnimScript(SCRIPT);
    expect(r.errors).toEqual([]);
    expect(isPlayable(r)).toBe(true);
    const s = r.script!;
    expect(s.bind.get("oceans")).toEqual({ kind: "node", value: "O" });
    expect(s.bind.get("evaporation")).toEqual({ kind: "edge", value: ["O", "V"] });
    expect(s.bind.get("legend")).toEqual({ kind: "label", value: "vapour" });
    expect(s.steps).toHaveLength(2);
    expect(s.steps[0].title).toBe("Where it starts");
    expect(s.steps[0].directives.map((d) => d.verb)).toEqual(["show", "focus"]);
    expect(s.steps[0].caption).toContain("oceans");
    expect(s.captions).toBe("overlay"); // default
  });

  it("treats a malformed or unknown-verb line as caption prose", () => {
    const r = parseAnimScript(
      "---\nbind:\n  a: {node: A}\n---\n\n## S\nshow: a\nreveal: a\n\nProse.\n",
    );
    expect(r.errors).toEqual([]);
    expect(r.script!.steps[0].directives.map((d) => d.verb)).toEqual(["show"]);
    expect(r.script!.steps[0].caption.startsWith("reveal: a")).toBe(true);
  });

  it("rejects bind shapes outside the grammar", () => {
    for (const line of ["a: {node: [A, B]}", "a: A", "a: {rotate: A}", 'a: {label: ""}']) {
      expect(parseAnimScript(`---\nbind:\n  ${line}\n---\n\n## S\nshow: a\n`).errors.length).toBeGreaterThan(0);
    }
  });

  it("errors on missing frontmatter, missing bind, zero steps", () => {
    expect(isPlayable(parseAnimScript("## S\nshow: a\n"))).toBe(false);
    expect(isPlayable(parseAnimScript("---\npace: learner\n---\n\n## S\n"))).toBe(false);
    expect(isPlayable(parseAnimScript("---\nbind:\n  a: {node: A}\n---\n"))).toBe(false);
  });

  it("reads captions: below and warns on unknown values", () => {
    const base = "bind:\n  a: {node: A}\n---\n\n## S\nshow: a\n";
    expect(parseAnimScript("---\ncaptions: below\n" + base).script!.captions).toBe("below");
    const r = parseAnimScript("---\ncaptions: floating\n" + base);
    expect(r.script!.captions).toBe("overlay");
    expect(r.warnings.some((w) => w.includes("captions"))).toBe(true);
  });
});
