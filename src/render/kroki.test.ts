import { describe, expect, it } from "vitest";
import { buildKrokiUrl, isKrokiRenderable, wrapTikzDocument } from "./kroki";

describe("wrapTikzDocument", () => {
  it("wraps a bare tikzpicture in a standalone document", () => {
    // kroki.io's TikZ backend compiles a whole document; a bare snippet 400s.
    const wrapped = wrapTikzDocument("\\begin{tikzpicture}\\draw (0,0) -- (2,1);\\end{tikzpicture}");
    expect(wrapped).toContain("\\documentclass[tikz,border=6pt]{standalone}");
    expect(wrapped).toContain("\\begin{document}");
    expect(wrapped).toContain("\\end{document}");
    expect(wrapped).toContain("\\begin{tikzpicture}");
  });

  it("leaves a source that already declares a documentclass untouched", () => {
    const source = "\\documentclass{article}\n\\begin{document}\nhi\n\\end{document}";
    expect(wrapTikzDocument(source)).toBe(source);
  });

  it("does not double-wrap a standalone tikz document", () => {
    const source = "\\documentclass[tikz]{standalone}\n\\begin{document}\nx\n\\end{document}";
    expect(wrapTikzDocument(source).match(/documentclass/g)).toHaveLength(1);
  });
});

describe("isKrokiRenderable", () => {
  it("covers the kinds kroki.io can render, excluding mermaid (rendered in-page)", () => {
    expect(isKrokiRenderable("graphviz")).toBe(true);
    expect(isKrokiRenderable("plantuml")).toBe(true);
    expect(isKrokiRenderable("d2")).toBe(true);
    expect(isKrokiRenderable("tikz")).toBe(true);
    expect(isKrokiRenderable("mermaid")).toBe(false);
    // kroki.io has no generic LaTeX diagram type.
    expect(isKrokiRenderable("latex")).toBe(false);
  });
});

describe("buildKrokiUrl", () => {
  it("builds a tikz URL from the wrapped document, not the raw snippet", () => {
    const bare = buildKrokiUrl("tikz", "\\begin{tikzpicture}\\draw (0,0);\\end{tikzpicture}");
    const wrapped = buildKrokiUrl(
      "tikz",
      wrapTikzDocument("\\begin{tikzpicture}\\draw (0,0);\\end{tikzpicture}"),
    );
    expect(bare).toBe(wrapped);
    expect(bare).toMatch(/^https:\/\/kroki\.io\/tikz\/svg\/[\w-]+$/);
  });

  it("returns null for a kind kroki.io can't render", () => {
    expect(buildKrokiUrl("latex", "x^2")).toBeNull();
  });

  it("honours a custom instance base URL, without a trailing slash", () => {
    const url = buildKrokiUrl("graphviz", "digraph G { a -> b }", "https://kroki.example.com/");
    expect(url?.startsWith("https://kroki.example.com/graphviz/svg/")).toBe(true);
  });
});
