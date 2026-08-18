// Pure TrackMD (.track.md) parser — no DOM access, safe to unit test.
//
// TrackMD is the orchestrator format of the suite: a table of contents made
// of `##` sections holding `!import` directives that point at sibling
// content files, plus `!ref` context declarations and `!checkpoint` markers.
// See spec/trackmd/SPEC.md (v0.1).
//
// Level 0 is deliberately readable as plain Markdown, so the parser walks
// lines and only treats the three `!directives` specially — everything else
// stays prose and is rendered as-is.

import { parseFrontmatter } from "./frontmatter";

/**
 * What kind of content a step points at. The spec's importable set is
 * learn/quiz/flash, but real tracks in the wild also import `.nugget.md`
 * (NuggetMD post-dates TrackMD v0.1), so it gets its own kind rather than
 * being lumped into `other`.
 */
export type StepKind = "learn" | "quiz" | "flash" | "nugget" | "other";

export interface TrackStep {
  type: "step";
  /** Path exactly as written in the directive, e.g. `./fractions.learn.md`. */
  path: string;
  kind: StepKind;
  /** Human-ish label derived from the filename (the real title needs a fetch). */
  label: string;
  optional: boolean;
  /** Level 2 `passing_score:` override, when present and parseable. */
  passingScore?: number;
  /** Index into `TrackDocument.steps`, for prev/next navigation. */
  index: number;
}

export interface TrackCheckpoint {
  type: "checkpoint";
  id: string;
  label?: string;
}

export type TrackEntry = TrackStep | TrackCheckpoint;

export interface TrackSection {
  /** `null` for entries that appear before the first `##` heading. */
  title: string | null;
  entries: TrackEntry[];
}

export interface TrackRef {
  path: string;
  /** `media`, `glossary`, `diagram`… derived from the double extension. */
  kind: string;
}

export interface TrackDocument {
  title: string;
  description?: string;
  frontmatter: Record<string, string | number | boolean>;
  /** Prose between the H1 and the first section (objectives callout, intro…). */
  intro: string;
  sections: TrackSection[];
  refs: TrackRef[];
  /** All steps, flattened in document order. */
  steps: TrackStep[];
}

const IMPORT_RE = /^!import\s+(\S+)\s*(.*)$/;
const REF_RE = /^!ref\s+(\S+)\s*$/;
const CHECKPOINT_RE = /^!checkpoint\s+(.*)$/;
const ATTRIBUTE_RE = /(\w+):(?:"([^"]*)"|(\S+))/g;

const KIND_BY_EXTENSION: Record<string, StepKind> = {
  learn: "learn",
  quiz: "quiz",
  flash: "flash",
  nugget: "nugget",
};

/** `./03-loops.learn.md` → `loops`, `./stock.media.md` → `media`. */
function doubleExtension(path: string): string | null {
  const file = path.split("/").pop() ?? path;
  const match = file.match(/\.([a-z]+)\.md$/i);
  return match ? match[1].toLowerCase() : null;
}

export function stepKindFromPath(path: string): StepKind {
  const ext = doubleExtension(path);
  return (ext ? KIND_BY_EXTENSION[ext] : undefined) ?? "other";
}

/**
 * Best-effort display label for a step. The authoritative title lives in the
 * imported file's own frontmatter, which would cost one fetch per step just
 * to draw the table of contents — so the filename stem is prettified instead
 * and the real title shows up when the step is opened.
 */
export function labelFromPath(path: string): string {
  const file = path.split("/").pop() ?? path;
  const stem = file
    .replace(/\.[a-z]+\.md$/i, "")
    // Ordering prefixes (`01-`, `02_`) are structure, not title.
    .replace(/^\d+[-_.]\s*/, "")
    .replace(/[-_]+/g, " ")
    .trim();
  if (!stem) return file;
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of raw.matchAll(ATTRIBUTE_RE)) {
    attrs[match[1]] = match[2] ?? match[3] ?? "";
  }
  return attrs;
}

/**
 * Parses a `.track.md` document into an ordered table of contents.
 *
 * Follows the spec's lenient validation posture: nothing here throws. An
 * unknown import extension becomes an `other` step, a malformed checkpoint
 * is dropped, and a track with no imports parses into zero steps rather
 * than an error — the UI decides what to say about it.
 */
export function parseTrackMD(source: string): TrackDocument {
  const { data, body } = parseFrontmatter(source);

  const sections: TrackSection[] = [];
  const refs: TrackRef[] = [];
  const steps: TrackStep[] = [];
  const introLines: string[] = [];

  let current: TrackSection = { title: null, entries: [] };
  let headingTitle = "";
  let seenSection = false;
  let inFence = false;

  for (const line of body.split(/\r\n|\n/)) {
    const trimmed = line.trim();

    // Directives inside a fenced block are sample code, not instructions —
    // the spec's own examples embed `!import` lines in fences.
    if (/^(```|~~~)/.test(trimmed)) inFence = !inFence;
    if (inFence || /^(```|~~~)/.test(trimmed)) {
      if (!seenSection) introLines.push(line);
      continue;
    }

    const h1 = trimmed.match(/^#\s+(.+)$/);
    if (h1) {
      if (!headingTitle) headingTitle = h1[1].trim();
      continue;
    }

    const h2 = trimmed.match(/^##\s+(.+)$/);
    if (h2) {
      if (seenSection || current.entries.length > 0) sections.push(current);
      current = { title: h2[1].trim(), entries: [] };
      seenSection = true;
      continue;
    }

    const importMatch = trimmed.match(IMPORT_RE);
    if (importMatch) {
      const path = importMatch[1];
      const attrs = parseAttributes(importMatch[2] ?? "");
      const score = Number(attrs.passing_score);
      const step: TrackStep = {
        type: "step",
        path,
        kind: stepKindFromPath(path),
        label: labelFromPath(path),
        optional: attrs.optional === "true",
        passingScore: Number.isFinite(score) ? score : undefined,
        index: steps.length,
      };
      steps.push(step);
      current.entries.push(step);
      continue;
    }

    const refMatch = trimmed.match(REF_RE);
    if (refMatch) {
      refs.push({ path: refMatch[1], kind: doubleExtension(refMatch[1]) ?? "other" });
      continue;
    }

    const checkpointMatch = trimmed.match(CHECKPOINT_RE);
    if (checkpointMatch) {
      const attrs = parseAttributes(checkpointMatch[1]);
      // `id` is required by the spec; a checkpoint without one is dropped
      // rather than rendered as an anonymous marker.
      if (attrs.id) {
        current.entries.push({ type: "checkpoint", id: attrs.id, label: attrs.label });
      }
      continue;
    }

    if (!seenSection) introLines.push(line);
  }

  if (seenSection || current.entries.length > 0) sections.push(current);

  const frontmatterTitle = typeof data.title === "string" ? data.title : "";
  const description = typeof data.description === "string" ? data.description : undefined;

  return {
    title: frontmatterTitle || headingTitle || "Untitled track",
    description,
    frontmatter: data,
    intro: introLines.join("\n").trim(),
    sections,
    refs,
    steps,
  };
}

/**
 * Heuristic for a document whose URL doesn't end in `.track.md`: a TrackMD
 * file is the only format in the suite that carries `!import` directives at
 * the top level.
 */
export function looksLikeTrack(content: string): boolean {
  return /^!import\s+\S+/m.test(content);
}
