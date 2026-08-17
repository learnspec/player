// Pure QuizMD (.quiz.md) parser — no DOM access, safe to unit test directly.
//
// Implements LearnSpec QuizMD v0.3 (level 0-2):
//   - optional YAML-ish frontmatter (title, description, partial_scoring, ...)
//   - `# Title` heading
//   - one `## ...` section per question
//   - choices as `- [ ]` / `- [x]` list items (mcq / multi / tf)
//   - open (fill-in-the-blank) questions: `___` marker(s) in the question
//     text + a `**Answer:** value [| value2 ...]` line (one value per blank)
//   - `match` questions: a 2-column Markdown table (`type: match`)
//   - `order` questions: a numbered list whose write order is correct (`type: order`)
//   - per-choice feedback (` > text` indented under a choice)
//   - global feedback: `> [!correct] ...`, `> [!incorrect] ...`, plain `> ...`
//   - an optional fenced ```quiz block per question carrying `id`/`type`/`points`/`hint`
//
// A question with none of the above (no checkboxes, no `___`, no table, no
// numbered list) is reported as `type: "unsupported"` so the UI can render a
// clear warning instead of silently guessing.

import { parseFrontmatter } from "./frontmatter";

export type QuestionType = "mcq" | "multi" | "open" | "tf" | "match" | "order" | "unsupported";

export interface QuizChoice {
  text: string;
  correct: boolean;
  /** Per-choice feedback (` > text` indented directly under this choice). */
  feedback?: string;
}

export interface MatchPair {
  left: string;
  right: string;
}

export interface QuizQuestion {
  /** Heading text after `## ` (empty for inline quiz blocks with no heading). */
  title: string;
  /** Markdown body of the question, choices/answer/table/list/explanation stripped out. */
  prompt: string;
  type: QuestionType;

  /** `mcq` / `multi` / `tf` choices. */
  choices?: QuizChoice[];
  /** `open`: one accepted answer per `___` blank, in order. */
  blanks?: string[];
  /** `match`: the two column headers, e.g. `["Composer", "Nationality"]`. */
  matchColumns?: [string, string];
  /** `match`: the correct pairs, in table order. */
  matchPairs?: MatchPair[];
  /** `order`: the items, in the correct order. */
  orderItems?: string[];

  /** Markdown explanation shown after the learner answers (plain `> text`). */
  explanation?: string;
  /** Global feedback shown only when the answer is correct (`> [!correct] ...`). */
  correctFeedback?: string;
  /** Global feedback shown only when the answer is incorrect (`> [!incorrect] ...`). */
  incorrectFeedback?: string;

  id?: string;
  points?: number;
  hint?: string;
}

export interface QuizDocument {
  title: string;
  description?: string;
  frontmatter: Record<string, string | number | boolean>;
  /** `partial_scoring` frontmatter flag — defaults to `true` per spec. */
  partialScoring: boolean;
  questions: QuizQuestion[];
}

const H1_RE = /^#\s+(.*)$/;
const HEADING_RE = /^##\s+(.*)$/;
const CHOICE_RE = /^[-*]\s*\[([ xX])\]\s*(.*)$/;
const INDENTED_QUOTE_RE = /^\s+>\s?(.*)$/;
const BLOCKQUOTE_RE = /^>\s?(.*)$/;
const FENCE_START_RE = /^```quiz\s*$/;
const FENCE_END_RE = /^```\s*$/;
const ANSWER_RE = /^\*\*Answer:\*\*\s*(.*)$/i;

// The spec's own convention labels headings `## Q3 · Fill in the blank: ...`.
// The player numbers questions itself, so keeping the label would render
// "Q3. Q3 · Fill in the blank: ...". Strip it only when text follows, so a
// bare `## Q3` heading still keeps its label as the visible title.
const QUESTION_LABEL_RE = /^Q\d+\s*(?:[·.:–—-]\s*)(.+)$/;

function stripQuestionLabel(heading: string): string {
  const m = heading.match(QUESTION_LABEL_RE);
  return m ? m[1].trim() : heading;
}
const TABLE_ROW_RE = /^\s*\|(.+)\|\s*$/;
const TABLE_SEPARATOR_RE = /^\s*\|?[\s:|-]+\|?\s*$/;
const ORDER_ITEM_RE = /^\s*\d+[.)]\s+(.*)$/;
const BLANK_RE = /___/g;
const EXPLICIT_TYPES: ReadonlySet<string> = new Set([
  "mcq",
  "multi",
  "open",
  "tf",
  "match",
  "order",
]);

/** Parses a full `.quiz.md` document. */
export function parseQuizMD(source: string): QuizDocument {
  const { data: frontmatter, body } = parseFrontmatter(source);
  const lines = body.split(/\r\n|\n/);

  let title = typeof frontmatter.title === "string" ? frontmatter.title : "";
  let description =
    typeof frontmatter.description === "string" ? frontmatter.description : undefined;
  const partialScoring = frontmatter.partial_scoring !== false;

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
    const qTitle = stripQuestionLabel(headingMatch[1].trim());
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
    partialScoring,
    questions,
  };
}

/**
 * Parses the body of a single question (everything after the `## ` line, or
 * the raw content of an inline ```quiz block in a LearnMD document).
 * Exported so the LearnMD parser can reuse it for inline quiz blocks.
 */
export function parseQuestionBlock(title: string, rawLines: string[]): QuizQuestion {
  const { id, points, hint, explicitType, remaining } = extractQuizConfigFence(rawLines);

  if (explicitType === "match") {
    return parseMatchQuestion(title, remaining, { id, points, hint });
  }
  if (explicitType === "order") {
    return parseOrderQuestion(title, remaining, { id, points, hint });
  }

  return parseChoiceOrOpenQuestion(title, remaining, { id, points, hint, explicitType });
}

interface CommonFields {
  id?: string;
  points?: number;
  hint?: string;
}

function parseChoiceOrOpenQuestion(
  title: string,
  remaining: string[],
  common: CommonFields & { explicitType?: string },
): QuizQuestion {
  const { choices, excludedChoiceLines } = extractChoices(remaining);
  const excluded = new Set<number>(excludedChoiceLines);

  const { start: explanationStart, end: explanationEnd, rawLines: feedbackRawLines } =
    extractTrailingBlockquote(remaining, excluded);
  const { explanation, correctFeedback, incorrectFeedback } = classifyFeedback(feedbackRawLines);
  if (explanationStart !== -1) {
    for (let idx = explanationStart; idx <= explanationEnd; idx++) excluded.add(idx);
  }

  let answerIdx = -1;
  let rawAnswers: string[] = [];
  if (choices.length === 0) {
    for (let idx = 0; idx < remaining.length; idx++) {
      const m = remaining[idx].match(ANSWER_RE);
      if (m) {
        answerIdx = idx;
        rawAnswers = m[1]
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      }
    }
  }
  if (answerIdx !== -1) excluded.add(answerIdx);

  const bodyLines = remaining.filter((_, idx) => !excluded.has(idx));
  const blankCount = countBlanks(title) + countBlanks(bodyLines.join("\n"));
  const hasBlanks = blankCount > 0;

  const prompt = displayText(bodyLines.join("\n").trim());
  const displayTitle = displayText(title);

  let type: QuestionType;
  let blanks: string[] | undefined;

  if (common.explicitType === "open" || (!common.explicitType && hasBlanks)) {
    type = "open";
    blanks = Array.from({ length: Math.max(blankCount, rawAnswers.length, 1) }, (_, idx) => rawAnswers[idx] ?? "");
  } else if (choices.length > 0) {
    const correctCount = choices.filter((c) => c.correct).length;
    const isTrueFalse =
      choices.length === 2 &&
      choices.some((c) => c.text.trim().toLowerCase() === "true") &&
      choices.some((c) => c.text.trim().toLowerCase() === "false");

    if (common.explicitType === "tf" || (!common.explicitType && isTrueFalse)) {
      type = "tf";
    } else if (common.explicitType === "multi" || (!common.explicitType && correctCount > 1)) {
      type = "multi";
    } else if (common.explicitType === "mcq" || (!common.explicitType && correctCount === 1)) {
      type = "mcq";
    } else {
      type = "unsupported";
    }
  } else {
    type = "unsupported";
  }

  return {
    title: displayTitle,
    prompt,
    type,
    choices: choices.length ? choices : undefined,
    blanks,
    explanation,
    correctFeedback,
    incorrectFeedback,
    id: common.id,
    points: common.points,
    hint: common.hint,
  };
}

function parseMatchQuestion(title: string, remaining: string[], common: CommonFields): QuizQuestion {
  const { header, rows, startIdx, endIdx } = extractTable(remaining);

  const excluded = new Set<number>();
  if (startIdx !== -1) {
    for (let idx = startIdx; idx <= endIdx; idx++) excluded.add(idx);
  }
  const { start: explanationStart, end: explanationEnd, rawLines: feedbackRawLines } =
    extractTrailingBlockquote(remaining, excluded);
  if (explanationStart !== -1) {
    for (let idx = explanationStart; idx <= explanationEnd; idx++) excluded.add(idx);
  }
  const { explanation, correctFeedback, incorrectFeedback } = classifyFeedback(feedbackRawLines);

  const bodyLines = remaining.filter((_, idx) => !excluded.has(idx));
  const prompt = displayText(bodyLines.join("\n").trim());

  const matchColumns: [string, string] | undefined =
    header.length >= 2 ? [header[0], header[1]] : undefined;
  const matchPairs: MatchPair[] = rows
    .filter((r) => r.length >= 2)
    .map((r) => ({ left: r[0], right: r[1] }));

  return {
    title: displayText(title),
    prompt,
    type: matchPairs.length > 0 ? "match" : "unsupported",
    matchColumns,
    matchPairs: matchPairs.length ? matchPairs : undefined,
    explanation,
    correctFeedback,
    incorrectFeedback,
    id: common.id,
    points: common.points,
    hint: common.hint,
  };
}

function parseOrderQuestion(title: string, remaining: string[], common: CommonFields): QuizQuestion {
  const items: string[] = [];
  const listIndices: number[] = [];
  remaining.forEach((line, idx) => {
    const m = line.match(ORDER_ITEM_RE);
    if (m) {
      items.push(m[1].trim());
      listIndices.push(idx);
    }
  });

  const excluded = new Set<number>(listIndices);
  const { start: explanationStart, end: explanationEnd, rawLines: feedbackRawLines } =
    extractTrailingBlockquote(remaining, excluded);
  if (explanationStart !== -1) {
    for (let idx = explanationStart; idx <= explanationEnd; idx++) excluded.add(idx);
  }
  const { explanation, correctFeedback, incorrectFeedback } = classifyFeedback(feedbackRawLines);

  const bodyLines = remaining.filter((_, idx) => !excluded.has(idx));
  const prompt = displayText(bodyLines.join("\n").trim());

  return {
    title: displayText(title),
    prompt,
    type: items.length > 0 ? "order" : "unsupported",
    orderItems: items.length ? items : undefined,
    explanation,
    correctFeedback,
    incorrectFeedback,
    id: common.id,
    points: common.points,
    hint: common.hint,
  };
}

/** Counts `___` blank markers in raw (pre-display-transform) text. */
function countBlanks(text: string): number {
  const m = text.match(BLANK_RE);
  return m ? m.length : 0;
}

/** Replaces `___` blank markers with a visually distinct inline-code placeholder. */
function displayText(text: string): string {
  return text.replace(BLANK_RE, "`____`");
}

function extractChoices(remaining: string[]): {
  choices: QuizChoice[];
  excludedChoiceLines: number[];
} {
  const choices: QuizChoice[] = [];
  const excludedChoiceLines: number[] = [];

  let idx = 0;
  while (idx < remaining.length) {
    const m = remaining[idx].match(CHOICE_RE);
    if (!m) {
      idx++;
      continue;
    }
    excludedChoiceLines.push(idx);
    const feedbackLines: string[] = [];
    let j = idx + 1;
    while (j < remaining.length) {
      const fm = remaining[j].match(INDENTED_QUOTE_RE);
      if (!fm) break;
      feedbackLines.push(fm[1]);
      excludedChoiceLines.push(j);
      j++;
    }
    choices.push({
      text: m[2].trim(),
      correct: m[1].toLowerCase() === "x",
      feedback: feedbackLines.length ? feedbackLines.join("\n").trim() : undefined,
    });
    idx = j;
  }

  return { choices, excludedChoiceLines };
}

function extractTable(remaining: string[]): {
  header: string[];
  rows: string[][];
  startIdx: number;
  endIdx: number;
} {
  let headerIdx = -1;
  for (let idx = 0; idx < remaining.length - 1; idx++) {
    if (TABLE_ROW_RE.test(remaining[idx]) && TABLE_SEPARATOR_RE.test(remaining[idx + 1])) {
      headerIdx = idx;
      break;
    }
  }
  if (headerIdx === -1) return { header: [], rows: [], startIdx: -1, endIdx: -1 };

  const header = splitTableRow(remaining[headerIdx]);
  const rows: string[][] = [];
  let idx = headerIdx + 2;
  while (idx < remaining.length && TABLE_ROW_RE.test(remaining[idx])) {
    rows.push(splitTableRow(remaining[idx]));
    idx++;
  }

  return { header, rows, startIdx: headerIdx, endIdx: idx - 1 };
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function extractQuizConfigFence(lines: string[]): {
  id?: string;
  points?: number;
  hint?: string;
  explicitType?: string;
  remaining: string[];
} {
  let id: string | undefined;
  let points: number | undefined;
  let hint: string | undefined;
  let explicitType: string | undefined;
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
        } else if (key === "id") {
          id = value;
        } else if (key === "type") {
          const normalized = value.trim().toLowerCase();
          if (EXPLICIT_TYPES.has(normalized)) explicitType = normalized;
        }
      }
    } else {
      remaining.push(lines[i]);
      i++;
    }
  }

  return { id, points, hint, explicitType, remaining };
}

/**
 * Finds the trailing run of top-level (non-indented) blockquote lines, i.e.
 * the global feedback block, skipping over any lines already claimed by
 * choices/tables/lists (`excluded`).
 */
function extractTrailingBlockquote(
  lines: string[],
  excluded: Set<number>,
): {
  start: number;
  end: number;
  rawLines: string[];
} {
  let runStart = -1;
  let lastStart = -1;
  let lastEnd = -1;

  for (let idx = 0; idx < lines.length; idx++) {
    if (excluded.has(idx)) {
      // Blank/already-claimed lines don't break a run of feedback lines that
      // immediately follow (e.g. choices right before the global feedback).
      continue;
    }
    if (BLOCKQUOTE_RE.test(lines[idx])) {
      if (runStart === -1) runStart = idx;
      lastStart = runStart;
      lastEnd = idx;
    } else if (lines[idx].trim() === "") {
      // allow blank lines inside/around the run without resetting it
    } else {
      runStart = -1;
    }
  }

  if (lastStart === -1) return { start: -1, end: -1, rawLines: [] };

  const rawLines = lines
    .slice(lastStart, lastEnd + 1)
    .filter((l) => BLOCKQUOTE_RE.test(l))
    .map((l) => l.replace(BLOCKQUOTE_RE, "$1"));

  return { start: lastStart, end: lastEnd, rawLines };
}

const FEEDBACK_MARKER_RE = /^\s*\[!(correct|incorrect)\]\s*(.*)$/i;

/** Splits raw global-feedback lines into general / correct-only / incorrect-only buckets. */
function classifyFeedback(rawLines: string[]): {
  explanation?: string;
  correctFeedback?: string;
  incorrectFeedback?: string;
} {
  const buckets: { general: string[]; correct: string[]; incorrect: string[] } = {
    general: [],
    correct: [],
    incorrect: [],
  };
  let current: "general" | "correct" | "incorrect" = "general";

  for (const line of rawLines) {
    const m = line.match(FEEDBACK_MARKER_RE);
    if (m) {
      current = m[1].toLowerCase() as "correct" | "incorrect";
      buckets[current].push(m[2]);
    } else {
      buckets[current].push(line);
    }
  }

  const join = (arr: string[]) => {
    const text = arr.join("\n").trim();
    return text || undefined;
  };

  return {
    explanation: join(buckets.general),
    correctFeedback: join(buckets.correct),
    incorrectFeedback: join(buckets.incorrect),
  };
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

/** True if `userAnswer` matches the accepted answer for one blank. */
export function isOpenAnswerCorrect(userAnswer: string, accepted: string): boolean {
  const normalizedUser = normalizeAnswer(userAnswer);
  if (!normalizedUser) return false;
  return normalizeAnswer(accepted) === normalizedUser;
}

/** Kendall's tau: fraction of concordant pairs in `order` (a permutation of item indices). */
export function kendallTau(order: number[]): number {
  const n = order.length;
  if (n < 2) return 1;
  const pos = new Array<number>(n);
  order.forEach((itemIdx, i) => {
    pos[itemIdx] = i;
  });
  let concordant = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      total++;
      if (pos[i] < pos[j]) concordant++;
    }
  }
  return total === 0 ? 1 : concordant / total;
}
