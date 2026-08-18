import { describe, expect, it } from "vitest";
import { parseNuggetMD } from "./nuggetmd";

describe("parseNuggetMD", () => {
  it("parses the spec's minimal example: two nuggets, positional sections", () => {
    const doc = parseNuggetMD(`# Python Best Practices

## Prefer enumerate() over range(len())

### Concept

When iterating over a list and needing both the index and the value,
\`enumerate()\` is the idiomatic Python choice.

### Why it matters

Next time you write \`for i in range(len(...))\`, stop and ask.

---

## Use zip() to iterate over multiple lists simultaneously

### Concept

\`zip()\` takes two or more iterables and returns an iterator of tuples.

### Why it matters

Instead of managing indices manually, \`zip()\` makes the intent clear.
`);
    expect(doc.title).toBe("Python Best Practices");
    expect(doc.nuggets).toHaveLength(2);
    expect(doc.nuggets[0].title).toBe("Prefer enumerate() over range(len())");
    expect(doc.nuggets[0].concept).toContain("enumerate()");
    expect(doc.nuggets[0].whyItMatters).toContain("stop and ask");
    expect(doc.nuggets[0].check).toBeUndefined();
    // No `​```nugget` fence in this example — id falls back to the heading slug.
    expect(doc.nuggets[0].id).toBe("prefer-enumerate-over-range-len");
  });

  it("parses section roles positionally, unaffected by the heading language (spec's French example)", () => {
    const doc = parseNuggetMD(`# Python Best Practices

## Préférer enumerate() à range(len())

### Le concept

Quand on parcourt une liste en ayant besoin de l'indice *et* de la valeur,
\`enumerate()\` est la façon idiomatique de le faire en Python.

### Pourquoi c'est important

La prochaine fois que vous écrivez \`for i in range(len(...))\`, demandez-vous
si vous avez besoin des deux.

### Question de rappel

? Quelle fonction native donne à la fois l'indice et la valeur ?

- [x] enumerate()
- [ ] range(len())
`);
    const n = doc.nuggets[0];
    expect(n.concept).toContain("façon idiomatique");
    expect(n.whyItMatters).toContain("demandez-vous");
    expect(n.check?.title).toBe("Quelle fonction native donne à la fois l'indice et la valeur ?");
    expect(n.check?.choices).toEqual([
      { text: "enumerate()", correct: true },
      { text: "range(len())", correct: false },
    ]);
  });

  it("reads id/tags/level/related from the attribute fence when present", () => {
    const doc = parseNuggetMD(`# T

## Prefer enumerate() over range(len())

\`\`\`nugget id:enumerate tags:[iteration] level:beginner related:[zip-function,unpacking]
\`\`\`

### Concept

Body.

### Why it matters

Body.
`);
    const n = doc.nuggets[0];
    expect(n.id).toBe("enumerate");
    expect(n.tags).toEqual(["iteration"]);
    expect(n.level).toBe("beginner");
    expect(n.related).toEqual(["zip-function", "unpacking"]);
  });

  it("falls back to a heading-derived slug when the attribute fence's body deviates from spec", () => {
    // Real-world generated content sometimes writes attributes as YAML-ish
    // lines inside the fence body instead of on the opening line. Per spec
    // the block "contains no body" — such content is skipped, not parsed,
    // and the nugget still gets a usable id from its heading.
    const doc = parseNuggetMD(`# T

## Simplifier une fraction

\`\`\`nugget
id: simplifier-fraction
tags: [fractions, pgcd]
level: beginner
\`\`\`

### Concept

Body.

### Why it matters

Body.
`);
    const n = doc.nuggets[0];
    expect(n.id).toBe("simplifier-une-fraction"); // heading-derived, not the intended "simplifier-fraction"
    expect(n.tags).toBeUndefined();
    expect(n.level).toBeUndefined();
  });

  it("parses a Check question without the spec's leading '?' marker (lenient, like inline QuizMD)", () => {
    const doc = parseNuggetMD(`# T

## N

### Concept

C.

### Why it matters

W.

### Check

Quelle est la forme irréductible de 20/28 ?
- [ ] 10/14
- [x] 5/7
- [ ] 4/7
`);
    const n = doc.nuggets[0];
    expect(n.check?.title).toBe("Quelle est la forme irréductible de 20/28 ?");
    expect(n.check?.choices).toHaveLength(3);
    expect(n.checkRaw).toContain("5/7");
  });

  it("keeps checkRaw even when no choices are found, so the section still renders", () => {
    const doc = parseNuggetMD(`# T

## N

### Concept

C.

### Why it matters

W.

### Check

Just a reflection prompt, no choices.
`);
    const n = doc.nuggets[0];
    expect(n.check).toBeUndefined();
    expect(n.checkRaw).toBe("Just a reflection prompt, no choices.");
  });

  it("concatenates a 4th+ section into extra rather than dropping it", () => {
    const doc = parseNuggetMD(`# T

## N

### Concept

C.

### Why it matters

W.

### Check

? Q?

- [x] A

### Bonus

Extra material.
`);
    expect(doc.nuggets[0].extra).toBe("Extra material.");
  });

  it("resolves lesson: as file-level default plus per-nugget override", () => {
    const doc = parseNuggetMD(`---
title: "Iteration in Python"
lang: en
lesson: ./03-iteration.learn.md
---

# Iteration in Python

## Prefer enumerate() over range(len())

\`\`\`nugget id:enumerate lesson:#the-enumerate-builtin
\`\`\`

### Concept

C.

### Why it matters

W.
`);
    expect(doc.lesson).toBe("./03-iteration.learn.md");
    expect(doc.nuggets[0].lesson).toBe("#the-enumerate-builtin");
  });

  it("reads spaced_repetition, defaulting to false", () => {
    expect(parseNuggetMD("# T\n\n## N\n\n### C\n\nc\n\n### W\n\nw\n").spacedRepetition).toBe(false);
    expect(
      parseNuggetMD("---\nspaced_repetition: fsrs\n---\n\n# T\n\n## N\n\n### C\n\nc\n\n### W\n\nw\n")
        .spacedRepetition,
    ).toBe("fsrs");
  });

  it("parses the spec's three-nugget complete example end to end", () => {
    const doc = parseNuggetMD(`---
title: "Python Best Practices"
lang: en
tags: [python, best-practices]
spaced_repetition: fsrs
---

# Python Best Practices

## Prefer enumerate() over range(len())

\`\`\`nugget id:enumerate tags:[iteration] level:beginner related:[zip-function]
\`\`\`

### Concept

When iterating over a list and needing both the index and the value,
\`enumerate()\` is the idiomatic Python choice.

### Why it matters

Next time you write \`for i in range(len(...))\`, stop and ask.

### Check

? Which function gives you both the index and the value when iterating?

- [x] enumerate()
- [ ] range(len())
- [ ] zip()
- [ ] index()

---

## Use zip() to iterate over multiple lists simultaneously

\`\`\`nugget id:zip-function tags:[iteration] level:beginner related:[enumerate,unpacking]
\`\`\`

### Concept

\`zip()\` takes two or more iterables and returns an iterator of tuples.

### Why it matters

Instead of managing a shared index, \`zip()\` makes the pairing explicit.

### Check

? What does zip() do when the two iterables have different lengths?

- [x] It stops at the shortest one
- [ ] It raises a ValueError
- [ ] It pads the shorter one with None

---

## Unpack tuples directly in loops

\`\`\`nugget id:unpacking tags:[iteration,tuples] level:intermediate
\`\`\`

### Concept

Python lets you unpack each tuple directly in the \`for\` statement.

### Why it matters

Tuple unpacking pairs naturally with \`enumerate()\` and \`zip()\`.

### Check

? Which syntax correctly unpacks a tuple in a for loop?

- [x] for x, y in pairs:
- [ ] for (x, y) = pairs:
`);
    expect(doc.spacedRepetition).toBe("fsrs");
    expect(doc.nuggets).toHaveLength(3);
    expect(doc.nuggets.map((n) => n.id)).toEqual(["enumerate", "zip-function", "unpacking"]);
    expect(doc.nuggets.every((n) => n.check)).toBe(true);
    expect(doc.nuggets[2].related).toBeUndefined();
  });
});
