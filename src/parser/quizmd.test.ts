import { describe, expect, it } from "vitest";
import { isOpenAnswerCorrect, normalizeAnswer, parseQuizMD } from "./quizmd";

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

  it("parses a single-choice (mcq) question", () => {
    const doc = parseQuizMD(`# Quiz

## What is 2 + 2?

- [ ] 3
- [x] 4
- [ ] 5
`);
    const q = doc.questions[0];
    expect(q.type).toBe("single");
    expect(q.choices).toEqual([
      { text: "3", correct: false },
      { text: "4", correct: true },
      { text: "5", correct: false },
    ]);
  });

  it("parses a multiple-choice question when more than one box is checked", () => {
    const doc = parseQuizMD(`# Quiz

## Pick the primes

- [x] 2
- [ ] 4
- [x] 7
`);
    const q = doc.questions[0];
    expect(q.type).toBe("multiple");
    expect(q.choices?.filter((c) => c.correct)).toHaveLength(2);
  });

  it("parses an open-answer question with alternatives", () => {
    const doc = parseQuizMD(`# Quiz

## What is the capital of France?

= Paris | paris, france
`);
    const q = doc.questions[0];
    expect(q.type).toBe("open");
    expect(q.answers).toEqual(["Paris", "paris, france"]);
  });

  it("marks a question with neither checkboxes nor an = line as unsupported", () => {
    const doc = parseQuizMD(`# Quiz

## Describe the diagram

Free text, no way to grade this automatically.
`);
    const q = doc.questions[0];
    expect(q.type).toBe("unsupported");
    expect(q.choices).toBeUndefined();
    expect(q.answers).toBeUndefined();
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
    expect(isOpenAnswerCorrect("PARIS", ["Paris"])).toBe(true);
  });

  it("ignores diacritics", () => {
    expect(normalizeAnswer("école")).toBe("ecole");
    expect(isOpenAnswerCorrect("ecole", ["école"])).toBe(true);
  });

  it("matches any accepted alternative", () => {
    expect(isOpenAnswerCorrect("one third", ["1/3", "one third", "0.333"])).toBe(true);
    expect(isOpenAnswerCorrect("one half", ["1/3", "one third", "0.333"])).toBe(false);
  });

  it("rejects an empty answer", () => {
    expect(isOpenAnswerCorrect("   ", ["Paris"])).toBe(false);
  });
});
