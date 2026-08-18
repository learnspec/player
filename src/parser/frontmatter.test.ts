import { describe, expect, it } from "vitest";
import { extractTitle, parseFrontmatter } from "./frontmatter";

describe("extractTitle", () => {
  it("prefers the frontmatter title", () => {
    expect(extractTitle('---\ntitle: "Chapitre 5 — Proportionnalité"\nlang: fr\n---\n\n# Autre\n'))
      .toBe("Chapitre 5 — Proportionnalité");
  });

  it("falls back to the first H1 when there is no frontmatter title", () => {
    expect(extractTitle("---\nlang: fr\n---\n\n# Statistiques et probabilités\n\nProse.\n"))
      .toBe("Statistiques et probabilités");
  });

  it("works on a file with no frontmatter at all", () => {
    expect(extractTitle("# Just a heading\n")).toBe("Just a heading");
  });

  it("ignores a heading inside a fenced block", () => {
    expect(extractTitle("```markdown\n# Not the title\n```\n\n# The title\n")).toBe("The title");
  });

  it("returns null when the file names itself neither way", () => {
    expect(extractTitle("Some prose with no heading.\n")).toBeNull();
    expect(extractTitle('---\ntitle: "  "\n---\n\nProse.\n')).toBeNull();
  });

  it("strips trailing closing hashes from an ATX heading", () => {
    expect(extractTitle("# Titre #\n")).toBe("Titre");
  });

  it("does not mistake an H2 for the title", () => {
    expect(extractTitle("## Section\n\n# Real title\n")).toBe("Real title");
  });
});

describe("parseFrontmatter", () => {
  it("still returns the body unchanged when there is no frontmatter", () => {
    expect(parseFrontmatter("# Hi\n").body).toBe("# Hi\n");
  });
});
