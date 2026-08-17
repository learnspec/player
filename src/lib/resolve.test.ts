import { describe, expect, it } from "vitest";
import {
  detectFormatFromContent,
  detectFormatFromUrl,
  extractGistContent,
  resolveContentUrl,
} from "./resolve";

describe("resolveContentUrl", () => {
  it("rewrites a github.com blob URL to raw.githubusercontent.com, with a jsDelivr fallback", () => {
    const resolved = resolveContentUrl(
      "https://github.com/learnspec/examples/blob/main/lesson.learn.md",
    );
    expect(resolved.primary).toBe(
      "https://raw.githubusercontent.com/learnspec/examples/main/lesson.learn.md",
    );
    expect(resolved.fallback).toBe(
      "https://cdn.jsdelivr.net/gh/learnspec/examples@main/lesson.learn.md",
    );
  });

  it("attaches a jsDelivr fallback to an already-raw GitHub URL", () => {
    const resolved = resolveContentUrl(
      "https://raw.githubusercontent.com/learnspec/examples/main/quiz.quiz.md",
    );
    expect(resolved.primary).toBe(
      "https://raw.githubusercontent.com/learnspec/examples/main/quiz.quiz.md",
    );
    expect(resolved.fallback).toBe(
      "https://cdn.jsdelivr.net/gh/learnspec/examples@main/quiz.quiz.md",
    );
  });

  it("rewrites a gist page URL to the GitHub Gist API", () => {
    const resolved = resolveContentUrl("https://gist.github.com/someone/abc123def456");
    expect(resolved.primary).toBe("https://api.github.com/gists/abc123def456");
    expect(resolved.fallback).toBeUndefined();
  });

  it("passes through an arbitrary URL unchanged", () => {
    const resolved = resolveContentUrl("https://example.com/lesson.learn.md");
    expect(resolved.primary).toBe("https://example.com/lesson.learn.md");
    expect(resolved.fallback).toBeUndefined();
  });

  it("trims surrounding whitespace", () => {
    const resolved = resolveContentUrl("  https://example.com/lesson.learn.md  ");
    expect(resolved.primary).toBe("https://example.com/lesson.learn.md");
  });
});

describe("extractGistContent", () => {
  it("prefers a .quiz.md or .learn.md file when the gist has multiple files", () => {
    const content = extractGistContent({
      files: {
        "notes.txt": { filename: "notes.txt", content: "irrelevant" },
        "lesson.learn.md": { filename: "lesson.learn.md", content: "# Lesson" },
      },
    });
    expect(content).toBe("# Lesson");
  });

  it("falls back to the first file when none match the LearnSpec extensions", () => {
    const content = extractGistContent({
      files: { "readme.md": { filename: "readme.md", content: "hello" } },
    });
    expect(content).toBe("hello");
  });

  it("returns null for a malformed response", () => {
    expect(extractGistContent(null)).toBeNull();
    expect(extractGistContent({})).toBeNull();
    expect(extractGistContent({ files: {} })).toBeNull();
  });
});

describe("detectFormatFromUrl", () => {
  it("detects .quiz.md and .learn.md, defaulting to learn otherwise", () => {
    expect(detectFormatFromUrl("https://example.com/a.quiz.md")).toBe("quiz");
    expect(detectFormatFromUrl("https://example.com/a.learn.md")).toBe("learn");
    expect(detectFormatFromUrl("https://example.com/a.md")).toBe("learn");
    expect(detectFormatFromUrl("https://example.com/a.quiz.md?raw=1")).toBe("quiz");
  });
});

describe("detectFormatFromContent", () => {
  it("detects QuizMD by a checkbox choice inside a question section", () => {
    const content = "# Quiz\n\n## Q1\n\n- [x] A\n- [ ] B\n";
    expect(detectFormatFromContent(content)).toBe("quiz");
  });

  it("defaults to learn when there is no checkbox choice", () => {
    const content = "# Lesson\n\nJust prose, no questions.\n";
    expect(detectFormatFromContent(content)).toBe("learn");
  });
});
