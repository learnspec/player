// Pure QuizMD (.quiz.md) parser — no DOM access, safe to unit test directly.
//
// Supported subset (LearnSpec QuizMD, level 0-1):
//   - optional YAML-ish frontmatter (title, description, ...)
//   - `# Title` heading
//   - one `## ...` section per question
//   - choices as `- [ ]` / `- [x]` list items (single vs. multiple choice)
//   - open questions via a bare `= answer | alternative` line
//   - `> ...` blockquote directly after the question body as an explanation
//   - an optional fenced ```quiz block per question carrying `points`/`hint`
//
// Anything else (a question with neither checkboxes nor an `=` line) is
// reported as `type: "unsupported"` so the UI can render a clear warning
// instead of silently guessing.

import { parseFrontmatter } from "./frontmatter";

export type QuestionType = "single" | "multiple" | "open" | "unsupported";

export interface QuizChoice {
  text: string;
  correct: boolean;
}

export interface QuizQuestion {
  /** Heading text after `## ` (empty for inline quiz blocks with no heading). */
  title: string;
  /** Markdown body of the question, choices/answer/explanation stripped out. */
  prompt: string;
  type: QuestionType;
  choices?: QuizChoice[];
  /** Accepted answers for `type: "open"` (already includes `|` alternatives). */
  answers?: string[];
  /** Markdown explanation shown after the learner answers. */
  explanation?: string;
  points?: number;
  hint?: string;
}

export interface QuizDocument {
  title: string;
  description?: string;
  frontmatter: Record<string, string | number | boolean>;
  questions: QuizQuestion[];
}

const H1_RE = /^#\s+(.*)$/;
const HEADING_RE = /^##\s+(.*)$/;
const CHOICE_RE = /^[-*]\s*\[([ xX])\]\s*(.*)$/;
const OPEN_ANSWER_RE = /^=\s*(.+)$/;
const BLOCKQUOTE_RE = /^>\s?(.*)$/;
const FENCE_START_RE = /^```quiz\s*$/;
const FENCE_END_RE = /^```\s*$/;

/** Parses a full `.quiz.md` document. */
export function parseQuizMD(source: string): QuizDocument {
  const { data: frontmatter, body } = parseFrontmatter(source);
  const lines = body.split(/\r\n|\n/);

  let title = typeof frontmatter.title === "string" ? frontmatter.title : "";
  let description =
    typeof frontmatter.description === "string" ? frontmatter.description : undefined;

  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(H1_RE);
    if (m) {
      if (!title) title = m[1].trim();
      bodyStart = i + 1;
      break;
    }
  }

  let firstQIdx = lines.length;
  for (let i = bodyStart; i < lines.length; i++) {
    if (HEADING_RE.test(lines[i])) {
      firstQIdx = i;
      break;
    }
  }

  if (!description) {
    const between = lines.slice(bodyStart, firstQIdx).join("\n").trim();
    if (between) description = between;
  }

  const questions: QuizQuestion[] = [];
  let i = firstQIdx;
  while (i < lines.length) {
    const headingMatch = lines[i].match(HEADING_RE);
    if (!headingMatch) {
      i++;
      continue;
    }
    const qTitle = headingMatch[1].trim();
    i++;
    const blockLines: string[] = [];
    while (i < lines.length && !HEADING_RE.test(lines[i])) {
      blockLines.push(lines[i]);
      i++;
    }
    questions.push(parseQuestionBlock(qTitle, blockLines));
  }

  return {
    title: title || "Untitled quiz",
    description,
    frontmatter,
    questions,
  };
}

/**
 * Parses the body of a single question (everything after the `## ` line, or
 * the raw content of an inline ```quiz block in a LearnMD document).
 * Exported so the LearnMD parser can reuse it for inline quiz blocks.
 */
export function parseQuestionBlock(title: string, rawLines: string[]): QuizQuestion {
  const { points, hint, remaining } = extractQuizConfigFence(rawLines);

  const choiceIndices: number[] = [];
  const choices: QuizChoice[] = [];
  remaining.forEach((line, idx) => {
    const m = line.match(CHOICE_RE);
    if (m) {
      choiceIndices.push(idx);
      choices.push({ text: m[2].trim(), correct: m[1].toLowerCase() === "x" });
    }
  });

  let answers: string[] | undefined;
  let answerIdx = -1;
  if (choices.length === 0) {
    for (let idx = 0; idx < remaining.length; idx++) {
      const m = remaining[idx].match(OPEN_ANSWER_RE);
      if (m) {
        answerIdx = idx;
        answers = m[1]
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      }
    }
  }

  const { start: explanationStart, end: explanationEnd, text: explanation } =
    extractTrailingBlockquote(remaining);

  const excluded = new Set<number>(choiceIndices);
  if (answerIdx !== -1) excluded.add(answerIdx);
  if (explanationStart !== -1) {
    for (let idx = explanationStart; idx <= explanationEnd; idx++) excluded.add(idx);
  }

  const prompt = remaining
    .filter((_, idx) => !excluded.has(idx))
    .join("\n")
    .trim();

  let type: QuestionType;
  if (choices.length > 0) {
    const correctCount = choices.filter((c) => c.correct).length;
    type = correctCount > 1 ? "multiple" : "single";
  } else if (answers && answers.length > 0) {
    type = "open";
  } else {
    type = "unsupported";
  }

  return {
    title,
    prompt,
    type,
    choices: choices.length ? choices : undefined,
    answers,
    explanation,
    points,
    hint,
  };
}

function extractQuizConfigFence(lines: string[]): {
  points?: number;
  hint?: string;
  remaining: string[];
} {
  let points: number | undefined;
  let hint: string | undefined;
  const remaining: string[] = [];

  let i = 0;
  while (i < lines.length) {
    if (FENCE_START_RE.test(lines[i])) {
      i++;
      const fenceLines: string[] = [];
      while (i < lines.length && !FENCE_END_RE.test(lines[i])) {
        fenceLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence line
      for (const fl of fenceLines) {
        const m = fl.match(/^\s*(\w+):\s*(.*)$/);
        if (!m) continue;
        const key = m[1].trim();
        let value = m[2].trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (key === "points") {
          const n = Number(value);
          if (!Number.isNaN(n)) points = n;
        } else if (key === "hint") {
          hint = value;
        }
      }
    } else {
      remaining.push(lines[i]);
      i++;
    }
  }

  return { points, hint, remaining };
}

function extractTrailingBlockquote(lines: string[]): {
  start: number;
  end: number;
  text?: string;
} {
  let runStart = -1;
  let lastStart = -1;
  let lastEnd = -1;

  for (let idx = 0; idx < lines.length; idx++) {
    if (BLOCKQUOTE_RE.test(lines[idx])) {
      if (runStart === -1) runStart = idx;
      lastStart = runStart;
      lastEnd = idx;
    } else {
      runStart = -1;
    }
  }

  if (lastStart === -1) return { start: -1, end: -1 };

  const text = lines
    .slice(lastStart, lastEnd + 1)
    .map((l) => l.replace(BLOCKQUOTE_RE, "$1"))
    .join("\n")
    .trim();

  return { start: lastStart, end: lastEnd, text };
}

/** Strips diacritics/case/whitespace for lenient open-answer matching. */
export function normalizeAnswer(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** True if `userAnswer` matches one of the accepted alternatives. */
export function isOpenAnswerCorrect(userAnswer: string, accepted: string[]): boolean {
  const normalizedUser = normalizeAnswer(userAnswer);
  if (!normalizedUser) return false;
  return accepted.some((a) => normalizeAnswer(a) === normalizedUser);
}
