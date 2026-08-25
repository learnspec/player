import { describe, expect, it } from "vitest";
import { parseDiagramStock } from "./diagrammd";

const STOCK = `---
title: "Examples"
spec_version: '0.2'
---

\`\`\`mermaid id:cycle caption:"A cycle"
flowchart TD
  A --> B
\`\`\`

\`\`\`anim for:cycle
---
bind:
  a: {node: A}
---

## S
show: a
\`\`\`

\`\`\`mermaid id:other
flowchart LR
  X --> Y
\`\`\`
`;

describe("parseDiagramStock", () => {
  it("maps entries by slug and attaches anim companions", () => {
    const stock = parseDiagramStock(STOCK);
    expect([...stock.keys()]).toEqual(["cycle", "other"]);
    const cycle = stock.get("cycle")!;
    expect(cycle.kind).toBe("mermaid");
    expect(cycle.caption).toBe("A cycle");
    expect(cycle.source).toContain("A --> B");
    expect(cycle.anim).toContain("show: a");
    expect(stock.get("other")!.anim).toBeUndefined();
  });

  it("binds an anim placed before its entry (order independence)", () => {
    const reordered =
      "```anim for:cycle\n---\nbind:\n  a: {node: A}\n---\n\n## S\nshow: a\n```\n\n" +
      "```mermaid id:cycle\nflowchart TD\n  A --> B\n```\n";
    const stock = parseDiagramStock(reordered);
    expect(stock.get("cycle")!.anim).toContain("show: a");
  });

  it("skips entries without an id and anims without for:", () => {
    const stock = parseDiagramStock(
      "```mermaid\nflowchart TD\n  A\n```\n\n```anim\n---\nbind:\n  a: {node: A}\n---\n\n## S\nshow: a\n```\n",
    );
    expect(stock.size).toBe(0);
  });

  it("tolerates empty input", () => {
    expect(parseDiagramStock("").size).toBe(0);
  });
});
