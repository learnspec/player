import { describe, expect, it } from "vitest";
import { labelFromPath, looksLikeTrack, parseTrackMD, stepKindFromPath } from "./trackmd";

describe("parseTrackMD", () => {
  it("parses a Level 0 track into sections and ordered steps", () => {
    const doc = parseTrackMD(`# Learning Python

## The Basics

!import ./01-variables.learn.md
!import ./quiz-variables.quiz.md

## Control Flow

!import ./02-conditions.learn.md
`);
    expect(doc.title).toBe("Learning Python");
    expect(doc.sections.map((s) => s.title)).toEqual(["The Basics", "Control Flow"]);
    expect(doc.steps).toHaveLength(3);
    expect(doc.steps.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(doc.steps.map((s) => s.kind)).toEqual(["learn", "quiz", "learn"]);
  });

  it("prefers the frontmatter title over the H1", () => {
    const doc = parseTrackMD(`---
title: Frontmatter wins
lang: en
description: A short summary.
---

# H1 title

!import ./a.learn.md
`);
    expect(doc.title).toBe("Frontmatter wins");
    expect(doc.description).toBe("A short summary.");
  });

  it("keeps prose before the first section as the intro", () => {
    const doc = parseTrackMD(`# Track

> [!objectives]
> You will learn things.

## Section

!import ./a.learn.md
`);
    expect(doc.intro).toContain("[!objectives]");
    expect(doc.intro).not.toContain("!import");
  });

  it("parses Level 2 attributes on !import", () => {
    const doc = parseTrackMD(`# T

!import ./advanced.quiz.md passing_score:0.75 optional:true
!import ./plain.learn.md
`);
    expect(doc.steps[0].optional).toBe(true);
    expect(doc.steps[0].passingScore).toBe(0.75);
    expect(doc.steps[1].optional).toBe(false);
    expect(doc.steps[1].passingScore).toBeUndefined();
  });

  it("parses checkpoints, including a quoted label, in document order", () => {
    const doc = parseTrackMD(`# T

## S

!import ./a.learn.md
!checkpoint id:section-1-done label:"Section 1 — First Steps complete"
`);
    const entries = doc.sections[0].entries;
    expect(entries[0].type).toBe("step");
    expect(entries[1]).toEqual({
      type: "checkpoint",
      id: "section-1-done",
      label: "Section 1 — First Steps complete",
    });
  });

  it("drops a checkpoint with no id (id is required by the spec)", () => {
    const doc = parseTrackMD(`# T\n\n!checkpoint label:"Nameless"\n`);
    expect(doc.sections.flatMap((s) => s.entries)).toHaveLength(0);
  });

  it("collects !ref context declarations separately from steps", () => {
    const doc = parseTrackMD(`# T

!ref ./glossary-python.glossary.md

## S

!import ./a.learn.md
`);
    expect(doc.refs).toEqual([{ path: "./glossary-python.glossary.md", kind: "glossary" }]);
    expect(doc.steps).toHaveLength(1);
  });

  it("groups entries appearing before any ## into an untitled section", () => {
    const doc = parseTrackMD(`# T\n\n!import ./a.learn.md\n`);
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0].title).toBeNull();
  });

  it("ignores directives inside fenced code blocks", () => {
    const doc = parseTrackMD(`# T

Here is how you write a track:

\`\`\`markdown
!import ./not-a-real-step.learn.md
\`\`\`

## Real

!import ./real.learn.md
`);
    expect(doc.steps.map((s) => s.path)).toEqual(["./real.learn.md"]);
  });

  it("keeps a .nugget.md import as its own kind rather than a lesson", () => {
    // NuggetMD post-dates TrackMD v0.1, but real tracks import it.
    const doc = parseTrackMD(`# T\n\n!import ./fractions.nugget.md\n`);
    expect(doc.steps[0].kind).toBe("nugget");
  });

  it("falls back to an `other` step for an unknown extension", () => {
    const doc = parseTrackMD(`# T\n\n!import ./mystery.thing.md\n`);
    expect(doc.steps[0].kind).toBe("other");
  });

  it("returns an empty step list for a track with no imports", () => {
    const doc = parseTrackMD(`# Empty track\n\nJust prose.\n`);
    expect(doc.steps).toEqual([]);
    expect(doc.title).toBe("Empty track");
  });
});

describe("stepKindFromPath / labelFromPath", () => {
  it("derives the kind from the double extension", () => {
    expect(stepKindFromPath("./a.learn.md")).toBe("learn");
    expect(stepKindFromPath("sub/dir/b.quiz.md")).toBe("quiz");
    expect(stepKindFromPath("./c.flash.md")).toBe("flash");
    expect(stepKindFromPath("./d.md")).toBe("other");
  });

  it("prettifies the filename stem and strips ordering prefixes", () => {
    expect(labelFromPath("./01-variables.learn.md")).toBe("Variables");
    expect(labelFromPath("./nombres-relatifs.quiz.md")).toBe("Nombres relatifs");
    expect(labelFromPath("./evaluation_finale.quiz.md")).toBe("Evaluation finale");
  });
});

describe("looksLikeTrack", () => {
  it("detects a track by its !import directives", () => {
    expect(looksLikeTrack("# T\n\n!import ./a.learn.md\n")).toBe(true);
    expect(looksLikeTrack("# Lesson\n\nSome prose.\n")).toBe(false);
  });
});
