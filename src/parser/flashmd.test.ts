import { describe, expect, it } from "vitest";
import { parseFlashMD } from "./flashmd";

describe("parseFlashMD", () => {
  it("parses frontmatter, title and description-free deck", () => {
    const doc = parseFlashMD(`---
title: "Cell Biology — Flashcards"
lang: en
new_per_day: 15
---

# Cell Biology — Flashcards

\`\`\`flash id:photosynthesis
What is photosynthesis?
---
The process by which plants convert sunlight into chemical energy, using $CO_2$ and $H_2O$.
\`\`\`
`);
    expect(doc.title).toBe("Cell Biology — Flashcards");
    expect(doc.cards).toHaveLength(1);
    expect(doc.cards[0]).toMatchObject({
      id: "photosynthesis",
      frontVariants: ["What is photosynthesis?"],
      back: "The process by which plants convert sunlight into chemical energy, using $CO_2$ and $H_2O$.",
    });
  });

  it("falls back to the H1 heading when there is no frontmatter title", () => {
    const doc = parseFlashMD(`# My Deck\n\n\`\`\`flash id:a\nFront\n---\nBack\n\`\`\`\n`);
    expect(doc.title).toBe("My Deck");
  });

  it("parses the spec's complete example: three cards, one with variants and tags", () => {
    const doc = parseFlashMD(`---
title: "Cell Biology — Flashcards"
lang: en
tags: [biology, cell, high-school]
new_per_day: 15
---

# Cell Biology — Flashcards

\`\`\`flash id:photosynthesis
What is photosynthesis?
---
The process by which plants convert sunlight into chemical energy, using $CO_2$ and $H_2O$.

$$6CO_2 + 6H_2O + \\text{light} \\rightarrow C_6H_{12}O_6 + 6O_2$$
\`\`\`

\`\`\`flash id:mitosis-phases tags:[cell-division]
What are the 4 phases of mitosis?
===
List the phases of mitosis, in order.
===
Mitosis proceeds through four stages — which ones?
---
**Prophase** → **Metaphase** → **Anaphase** → **Telophase**
\`\`\`

\`\`\`flash id:chloroplast tags:[organelle] hint:"Think about the green colour"
Which organelle is responsible for photosynthesis?
---
The **chloroplast**.
\`\`\`
`);
    expect(doc.cards).toHaveLength(3);

    const mitosis = doc.cards[1];
    expect(mitosis.frontVariants).toEqual([
      "What are the 4 phases of mitosis?",
      "List the phases of mitosis, in order.",
      "Mitosis proceeds through four stages — which ones?",
    ]);
    expect(mitosis.back).toBe("**Prophase** → **Metaphase** → **Anaphase** → **Telophase**");
    expect(mitosis.tags).toEqual(["cell-division"]);

    const chloroplast = doc.cards[2];
    expect(chloroplast.hint).toBe("Think about the green colour");
  });

  it("resolves lesson: as deck-level default plus per-card override", () => {
    const doc = parseFlashMD(`---
title: "Git — Fondations · Flashcards"
lang: fr
lesson: ./01-fondations.learn.md
---

# Git — Fondations

\`\`\`flash id:index-role lesson:#role-de-lindex
Question A
---
Answer A
\`\`\`

\`\`\`flash id:commit-def
Question B
---
Answer B
\`\`\`
`);
    expect(doc.lesson).toBe("./01-fondations.learn.md");
    expect(doc.cards[0].lesson).toBe("#role-de-lindex");
    expect(doc.cards[1].lesson).toBeUndefined();
  });

  it("drops a card missing the '---' separator rather than misrendering it", () => {
    const doc = parseFlashMD(`# D\n\n\`\`\`flash id:broken\nJust a front, no separator\n\`\`\`\n`);
    expect(doc.cards).toHaveLength(0);
  });

  it("drops a card with no id", () => {
    const doc = parseFlashMD(`# D\n\n\`\`\`flash\nFront\n---\nBack\n\`\`\`\n`);
    expect(doc.cards).toHaveLength(0);
  });

  it("preserves card order across multiple cards", () => {
    const doc = parseFlashMD(`# D

\`\`\`flash id:one
A
---
1
\`\`\`

\`\`\`flash id:two
B
---
2
\`\`\`
`);
    expect(doc.cards.map((c) => c.id)).toEqual(["one", "two"]);
  });
});
