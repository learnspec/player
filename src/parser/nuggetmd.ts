// Pure NuggetMD (.nugget.md) parser — no DOM access, safe to unit test.
//
// Implements LearnSpec NuggetMD v0.3, levels 0-2:
//   - `## heading` opens a nugget; its `### ` sub-sections are POSITIONAL
//     (1st = Concept, 2nd = Why it matters, 3rd = Check) — labels are never
//     matched on text, per spec (a nugget authored in French parses
//     identically to one authored in English).
//   - an optional empty `​```nugget id:x tags:[...] ...` attribute fence
//     immediately after the heading
//   - the Check section's recall question is QuizMD Level 0 syntax, reusing
//     `parseQuestionBlock` from quizmd.ts rather than re-implementing choice
//     parsing. The spec's `?` question marker is stripped when present but
//     not required — the same leniency the player already applies to a
//     LearnMD inline `​```quiz` block, whose prompt is just "the markdown
//     before the choices".

import { parseFenceAttrs } from "./attrs";
import { parseFrontmatter } from "./frontmatter";
import { parseQuestionBlock, type QuizQuestion } from "./quizmd";

export interface Nugget {
  id: string;
  title: string;
  tags?: string[];
  level?: string;
  related?: string[];
  /** Raw `lesson:` value on the nugget — resolution is the caller's job. */
  lesson?: string;
  concept: string;
  whyItMatters: string;
  /** Parsed recall question, when the 3rd section has choices to parse. */
  check?: QuizQuestion;
  /** The 3rd section's raw markdown — always kept, even when `check` also parses,
   *  so a nugget with no interactive check still shows something. */
  checkRaw?: string;
  /** 4th+ `###` sections, concatenated — the spec gives them no role. */
  extra?: string;
}

export interface NuggetDocument {
  title: string;
  description?: string;
  frontmatter: Record<string, string | number | boolean>;
  spacedRepetition: "fsrs" | "sm2" | false;
  /** Deck-level default `lesson:`, inherited by nuggets with no `lesson:` of their own. */
  lesson?: string;
  nuggets: Nugget[];
}

const H1_RE = /^#\s+(.*)$/;
const H2_RE = /^##\s+(.*)$/;
const H3_RE = /^###\s+(.*)$/;
const NUGGET_FENCE_START_RE = /^```nugget(?:\s+(.*))?\s*$/;
const FENCE_END_RE = /^```\s*$/;
const QUESTION_MARK_RE = /^\?\s*/;
const CHOICE_RE = /^[-*]\s*\[[ xX]\]/;

export function parseNuggetMD(source: string): NuggetDocument {
  const { data, body } = parseFrontmatter(source);
  const lines = body.split(/\r\n|\n/);

  let title = typeof data.title === "string" ? data.title : "";
  const lesson = typeof data.lesson === "string" ? data.lesson : undefined;
  const spacedRepetition =
    data.spaced_repetition === "fsrs" || data.spaced_repetition === "sm2"
      ? data.spaced_repetition
      : false;

  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(H1_RE);
    if (m) {
      if (!title) title = m[1].trim();
      bodyStart = i + 1;
      break;
    }
  }

  let firstH2 = lines.length;
  for (let i = bodyStart; i < lines.length; i++) {
    if (H2_RE.test(lines[i])) {
      firstH2 = i;
      break;
    }
  }
  const description = lines.slice(bodyStart, firstH2).join("\n").trim() || undefined;

  const nuggets: Nugget[] = [];
  let i = firstH2;
  while (i < lines.length) {
    const h2 = lines[i].match(H2_RE);
    if (!h2) {
      i++;
      continue;
    }
    const heading = h2[1].trim();
    i++;
    const blockLines: string[] = [];
    while (i < lines.length && !H2_RE.test(lines[i])) {
      blockLines.push(lines[i]);
      i++;
    }
    nuggets.push(buildNugget(heading, blockLines));
  }

  return { title: title || "Untitled nuggets", description, frontmatter: data, spacedRepetition, lesson, nuggets };
}

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining diacritics, after NFD decomposition
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildNugget(heading: string, lines: string[]): Nugget {
  let i = 0;

  // An optional attribute fence right after the heading — spec: no body,
  // attributes on the opening line only. Any other content between the
  // fence markers (a real-world deviation seen in generated content) is
  // skipped rather than parsed, so it doesn't leak into the first section.
  let attrs: Record<string, string | string[]> = {};
  while (i < lines.length && !lines[i].trim()) i++;
  const fenceMatch = lines[i]?.match(NUGGET_FENCE_START_RE);
  if (fenceMatch) {
    attrs = parseFenceAttrs(fenceMatch[1] ?? "");
    i++;
    while (i < lines.length && !FENCE_END_RE.test(lines[i])) i++;
    i++;
  }

  const preface: string[] = [];
  const sections: string[][] = [];
  for (; i < lines.length; i++) {
    const h3 = lines[i].match(H3_RE);
    if (h3) {
      sections.push([]);
      continue;
    }
    (sections.length === 0 ? preface : sections[sections.length - 1]).push(lines[i]);
  }

  const [conceptLines, whyLines, checkLines, ...extraLines] = sections;
  const concept = [...preface, ...(conceptLines ?? [])].join("\n").trim();
  const whyItMatters = (whyLines ?? []).join("\n").trim();
  const checkRaw = checkLines ? checkLines.join("\n").trim() : undefined;
  const extra = extraLines.length
    ? extraLines
        .map((s) => s.join("\n").trim())
        .filter(Boolean)
        .join("\n\n") || undefined
    : undefined;

  return {
    id: typeof attrs.id === "string" && attrs.id ? attrs.id : slugify(heading),
    title: heading,
    tags: Array.isArray(attrs.tags) ? attrs.tags : undefined,
    level: typeof attrs.level === "string" ? attrs.level : undefined,
    related: Array.isArray(attrs.related) ? attrs.related : undefined,
    lesson: typeof attrs.lesson === "string" ? attrs.lesson : undefined,
    concept,
    whyItMatters,
    check: checkLines ? parseCheckQuestion(checkLines) : undefined,
    checkRaw: checkRaw || undefined,
    extra,
  };
}

/**
 * The Check section holds a single QuizMD Level 0 question: prose (with an
 * optional leading `?`) followed by `- [ ]` / `- [x]` choices. Reuses
 * `parseQuestionBlock` for everything after the question text is split off,
 * so choice/explanation/feedback parsing stays in one place in the codebase.
 */
function parseCheckQuestion(lines: string[]): QuizQuestion | undefined {
  const choiceStart = lines.findIndex((l) => CHOICE_RE.test(l));
  if (choiceStart === -1) return undefined;

  const questionText = lines
    .slice(0, choiceStart)
    .join("\n")
    .trim()
    .replace(QUESTION_MARK_RE, "")
    .trim();
  if (!questionText) return undefined;

  const question = parseQuestionBlock(questionText, lines.slice(choiceStart));
  return question.type === "unsupported" ? undefined : question;
}
