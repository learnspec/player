// Pure FlashMD (.flash.md) parser — no DOM access, safe to unit test.
//
// Implements LearnSpec FlashMD v0.3, levels 0-2:
//   - frontmatter (title, lang, tags, new_per_day, deck-level `lesson`)
//   - `​```flash id:slug [tags:[...]] [hint:"..."] [lesson:...]` card blocks
//   - front / `===` variants / `---` / back
//
// Deliberately not implemented: `media:slug` resolution inside card content
// (MediaMD isn't wired into this player yet — falls through as plain
// Markdown image syntax, which still renders via its literal URL fallback).

import { parseFenceAttrs } from "./attrs";
import { parseFrontmatter } from "./frontmatter";

export interface FlashCard {
  id: string;
  /** One or more front phrasings sharing the same back (Level 2 variants). */
  frontVariants: string[];
  back: string;
  tags?: string[];
  hint?: string;
  /** Raw `lesson:` value on the card — resolution is the caller's job. */
  lesson?: string;
}

export interface FlashDocument {
  title: string;
  frontmatter: Record<string, string | number | boolean>;
  /** Deck-level default `lesson:`, inherited by cards with no `lesson:` of their own. */
  lesson?: string;
  cards: FlashCard[];
}

const H1_RE = /^#\s+(.*)$/;
const FENCE_START_RE = /^```flash(?:\s+(.*))?\s*$/;
const FENCE_END_RE = /^```\s*$/;
const FRONT_SEPARATOR_RE = /^={3,}\s*$/m;
const BACK_SEPARATOR_RE = /^-{3}\s*$/;

export function parseFlashMD(source: string): FlashDocument {
  const { data, body } = parseFrontmatter(source);
  const lines = body.split(/\r\n|\n/);

  let title = typeof data.title === "string" ? data.title : "";
  const lesson = typeof data.lesson === "string" ? data.lesson : undefined;

  if (!title) {
    for (const line of lines) {
      const m = line.match(H1_RE);
      if (m) {
        title = m[1].trim();
        break;
      }
    }
  }

  const cards: FlashCard[] = [];
  let i = 0;
  while (i < lines.length) {
    const start = lines[i].match(FENCE_START_RE);
    if (!start) {
      i++;
      continue;
    }
    const attrs = parseFenceAttrs(start[1] ?? "");
    i++;
    const blockLines: string[] = [];
    while (i < lines.length && !FENCE_END_RE.test(lines[i])) {
      blockLines.push(lines[i]);
      i++;
    }
    i++; // consume the closing fence

    const card = buildCard(attrs, blockLines);
    if (card) cards.push(card);
  }

  return { title: title || "Untitled deck", frontmatter: data, lesson, cards };
}

function buildCard(
  attrs: Record<string, string | string[]>,
  lines: string[],
): FlashCard | null {
  const id = typeof attrs.id === "string" ? attrs.id : undefined;
  if (!id) return null;

  const backIdx = lines.findIndex((l) => BACK_SEPARATOR_RE.test(l));
  if (backIdx === -1) return null; // spec: '---' missing is an Error — drop rather than misrender

  const frontLines = lines.slice(0, backIdx);
  const back = lines
    .slice(backIdx + 1)
    .join("\n")
    .trim();
  if (!back) return null;

  const frontVariants = frontLines
    .join("\n")
    .split(FRONT_SEPARATOR_RE)
    .map((v) => v.trim())
    .filter(Boolean);
  if (frontVariants.length === 0) return null;

  return {
    id,
    frontVariants,
    back,
    tags: Array.isArray(attrs.tags) ? attrs.tags : undefined,
    hint: typeof attrs.hint === "string" ? attrs.hint : undefined,
    lesson: typeof attrs.lesson === "string" ? attrs.lesson : undefined,
  };
}
