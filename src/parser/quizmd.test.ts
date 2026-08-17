import { describe, expect, it } from "vitest";
import { isOpenAnswerCorrect, kendallTau, normalizeAnswer, parseQuizMD } from "./quizmd";

describe("parseQuizMD", () => {
  it("parses frontmatter, title and description", () => {
    const doc = parseQuizMD(`---
title: Custom title
description: Custom description
shuffle: true
---

# Ignored heading (frontmatter title wins)

## Q1

- [x] A
- [ ] B
`);
    expect(doc.title).toBe("Custom title");
    expect(doc.description).toBe("Custom description");
    expect(doc.frontmatter.shuffle).toBe(true);
  });

  it("falls back to the H1 heading and body text when frontmatter is absent", () => {
    const doc = parseQuizMD(`# My quiz

Some intro text.

## Q1

- [x] A
- [ ] B
`);
    expect(doc.title).toBe("My quiz");
    expect(doc.description).toBe("Some intro text.");
  });

  it("defaults partial_scoring to true", () => {
    const doc = parseQuizMD(`# Quiz\n\n## Q1\n\n- [x] A\n`);
    expect(doc.partialScoring).toBe(true);
  });

  it("honors partial_scoring: false in frontmatter", () => {
    const doc = parseQuizMD(`---\npartial_scoring: false\n---\n\n# Quiz\n\n## Q1\n\n- [x] A\n`);
    expect(doc.partialScoring).toBe(false);
  });

  it("parses an mcq question", () => {
    const doc = parseQuizMD(`# Quiz

## What is 2 + 2?

- [ ] 3
- [x] 4
- [ ] 5
`);
    const q = doc.questions[0];
    expect(q.type).toBe("mcq");
    expect(q.choices).toEqual([
      { text: "3", correct: false },
      { text: "4", correct: true },
      { text: "5", correct: false },
    ]);
  });

  it("strips the spec's Qn label from a heading so numbering isn't doubled", () => {
    const doc = parseQuizMD(`# Quiz

## Q1 · How many planets are in our solar system?

- [x] 8
- [ ] 9

## Q2. What is 2 + 2?

- [x] 4
- [ ] 5

## Q3

- [x] Yes
- [ ] No
`);
    expect(doc.questions[0].title).toBe("How many planets are in our solar system?");
    expect(doc.questions[1].title).toBe("What is 2 + 2?");
    // A bare label is the only visible title there is — keep it.
    expect(doc.questions[2].title).toBe("Q3");
  });

  it("parses a multi-select question when more than one box is checked", () => {
    const doc = parseQuizMD(`# Quiz

## Pick the primes

- [x] 2
- [ ] 4
- [x] 7
`);
    const q = doc.questions[0];
    expect(q.type).toBe("multi");
    expect(q.choices?.filter((c) => c.correct)).toHaveLength(2);
  });

  it("infers tf for a question with exactly two True/False choices", () => {
    const doc = parseQuizMD(`# Quiz

## True or false: the sky is blue.

- [x] True
- [ ] False
`);
    const q = doc.questions[0];
    expect(q.type).toBe("tf");
    expect(q.choices).toHaveLength(2);
  });

  it("marks a question with no correct choice and no explicit type as unsupported", () => {
    const doc = parseQuizMD(`# Quiz

## Describe the diagram

- [ ] A
- [ ] B
`);
    expect(doc.questions[0].type).toBe("unsupported");
  });

  it("extracts a trailing blockquote as the explanation", () => {
    const doc = parseQuizMD(`# Quiz

## Q1

- [x] A
- [ ] B

> This explains why A is correct.
`);
    expect(doc.questions[0].explanation).toBe("This explains why A is correct.");
    // The blockquote text must not leak into the prompt.
    expect(doc.questions[0].prompt).toBe("");
  });

  it("splits [!correct] / [!incorrect] global feedback from the plain explanation", () => {
    const doc = parseQuizMD(`# Quiz

## Q1

\`\`\`quiz
type: multi
\`\`\`

- [x] A
- [x] B
- [ ] C

> [!correct] Nice work.
> [!incorrect] Review the material.
`);
    const q = doc.questions[0];
    expect(q.correctFeedback).toBe("Nice work.");
    expect(q.incorrectFeedback).toBe("Review the material.");
  });

  it("parses per-choice feedback (indented blockquote under a choice)", () => {
    const doc = parseQuizMD(`# Quiz

## Q1

- [x] age = 25
  > Correct — Python uses \`=\` for assignment.
- [ ] int age = 25
  > That's Java or C syntax, not Python.
`);
    const q = doc.questions[0];
    expect(q.choices?.[0].feedback).toBe("Correct — Python uses `=` for assignment.");
    expect(q.choices?.[1].feedback).toBe("That's Java or C syntax, not Python.");
    // Feedback lines must not leak into the prompt.
    expect(q.prompt).toBe("");
  });

  it("parses an open-answer question with a single blank in the heading", () => {
    const doc = parseQuizMD(`# Quiz

## Fill in the blank: The sun is a ___.

**Answer:** star
`);
    const q = doc.questions[0];
    expect(q.type).toBe("open");
    expect(q.blanks).toEqual(["star"]);
    expect(q.title).toContain("____");
  });

  it("parses an open-answer question with multiple blanks", () => {
    const doc = parseQuizMD(`# Quiz

## Complete: ___ was born in ___, Germany.

**Answer:** Handel | Halle
`);
    const q = doc.questions[0];
    expect(q.type).toBe("open");
    expect(q.blanks).toEqual(["Handel", "Halle"]);
  });

  it("parses a match question from a 2-column table", () => {
    const doc = parseQuizMD(`# Quiz

## Match each composer with their nationality.

\`\`\`quiz
type: match
points: 4
\`\`\`

| Composer | Nationality |
|---|---|
| Bach | German |
| Vivaldi | Italian |
`);
    const q = doc.questions[0];
    expect(q.type).toBe("match");
    expect(q.points).toBe(4);
    expect(q.matchColumns).toEqual(["Composer", "Nationality"]);
    expect(q.matchPairs).toEqual([
      { left: "Bach", right: "German" },
      { left: "Vivaldi", right: "Italian" },
    ]);
  });

  it("parses an order question from a numbered list, in write order", () => {
    const doc = parseQuizMD(`# Quiz

## Place these composers in chronological order of birth.

\`\`\`quiz
type: order
\`\`\`

1. Monteverdi
2. Schütz
3. Lully
`);
    const q = doc.questions[0];
    expect(q.type).toBe("order");
    expect(q.orderItems).toEqual(["Monteverdi", "Schütz", "Lully"]);
  });

  it("an explicit type overrides inference", () => {
    const doc = parseQuizMD(`# Quiz

## Q1

\`\`\`quiz
type: multi
\`\`\`

- [x] A
- [ ] B
`);
    expect(doc.questions[0].type).toBe("multi");
  });

  it("parses points and hint from a fenced ```quiz config block", () => {
    const doc = parseQuizMD(`# Quiz

## Q1

- [x] A
- [ ] B

\`\`\`quiz
points: 3
hint: "Think about it."
\`\`\`
`);
    expect(doc.questions[0].points).toBe(3);
    expect(doc.questions[0].hint).toBe("Think about it.");
  });

  it("keeps the question prompt markdown separate from choices/answer/explanation", () => {
    const doc = parseQuizMD(`# Quiz

## Q1

Here is some **prompt** text.

- [x] A
- [ ] B

> Explanation.
`);
    expect(doc.questions[0].prompt).toBe("Here is some **prompt** text.");
  });
});

describe("normalizeAnswer / isOpenAnswerCorrect", () => {
  it("is case-insensitive and trims whitespace", () => {
    expect(normalizeAnswer("  Paris  ")).toBe("paris");
    expect(isOpenAnswerCorrect("PARIS", "Paris")).toBe(true);
  });

  it("ignores diacritics", () => {
    expect(normalizeAnswer("école")).toBe("ecole");
    expect(isOpenAnswerCorrect("ecole", "école")).toBe(true);
  });

  it("rejects a mismatched answer", () => {
    expect(isOpenAnswerCorrect("one half", "one third")).toBe(false);
  });

  it("rejects an empty answer", () => {
    expect(isOpenAnswerCorrect("   ", "Paris")).toBe(false);
  });
});

describe("kendallTau", () => {
  it("returns 1 for an exactly correct order", () => {
    expect(kendallTau([0, 1, 2, 3])).toBe(1);
  });

  it("returns 0 for a fully reversed order", () => {
    expect(kendallTau([3, 2, 1, 0])).toBe(0);
  });

  it("returns a fraction for a partially correct order", () => {
    // Correct order is [0,1,2,3]; user placed items as [0, 2, 1, 3]:
    // 5 of 6 pairs are still concordant (only (1,2) is swapped).
    expect(kendallTau([0, 2, 1, 3])).toBeCloseTo(5 / 6);
  });

  it("returns 1 for a single item or empty list", () => {
    expect(kendallTau([0])).toBe(1);
    expect(kendallTau([])).toBe(1);
  });
});
