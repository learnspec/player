// Pure LearnMD (.learn.md) segmenter — no DOM access, safe to unit test.
//
// LearnMD is standard GFM Markdown plus a handful of special fenced blocks
// and callouts. Rather than teach `marked` about all of that, this module
// walks the document once and splits it into an ordered list of typed
// segments. Each segment is either plain prose (still full Markdown,
// rendered later by `render/markdown.ts`) or one of the special blocks the
// player treats differently: `example`, `summary`, `quiz`, or a diagram
// fence (mermaid/tikz/graphviz/plantuml/d2/latex/...).
//
// Callouts (`> [!note]` etc.) are deliberately left inside prose segments —
// `render/markdown.ts` post-processes the sanitized HTML to style them,
// since `marked`'s GFM blockquote output is the simplest place to detect
// the `[!type]` marker.

import { parseFenceAttrs } from "./attrs";
import { parseFrontmatter } from "./frontmatter";
import { parseQuestionBlock, type QuizQuestion } from "./quizmd";

export type DiagramKind =
  | "mermaid"
  | "tikz"
  | "graphviz"
  | "plantuml"
  | "d2"
  | "vega-lite"
  | "latex";

const DIAGRAM_KINDS: ReadonlySet<string> = new Set([
  "mermaid",
  "tikz",
  "graphviz",
  "plantuml",
  "d2",
  // The spec's fence id is `vega-lite` (DIAGRAMS.md); kroki.io's diagram
  // type for it is spelled `vegalite`. Mapping lives in render/kroki.ts.
  "vega-lite",
  "latex",
]);

export interface ProseSegment {
  type: "prose";
  markdown: string;
}

export interface ExampleSegment {
  type: "example" | "summary";
  markdown: string;
}

export interface QuizSegment {
  type: "quiz";
  question: QuizQuestion;
}

export interface DiagramSegment {
  type: "diagram";
  kind: DiagramKind;
  source: string;
}

export interface UnsupportedSegment {
  type: "unsupported";
  lang: string;
  source: string;
}

/** ```diagram ref:<slug>``` — resolved against the sibling stock.diagram.md. */
export interface DiagramRefSegment {
  type: "diagramref";
  slug: string;
}

/** ```anim ref:<slug>``` — plays the stock entry's AnimMD companion script. */
export interface AnimRefSegment {
  type: "animref";
  slug: string;
}

export type LearnSegment =
  | ProseSegment
  | ExampleSegment
  | QuizSegment
  | DiagramSegment
  | DiagramRefSegment
  | AnimRefSegment
  | UnsupportedSegment;

export interface LearnDocument {
  title?: string;
  description?: string;
  math: boolean;
  frontmatter: Record<string, string | number | boolean>;
  segments: LearnSegment[];
}

// Trailing attributes after the language word (e.g. ` ```quiz scored:true `,
// ` ```example python title:"..." `) are matched but ignored — this player
// doesn't act on them, it just needs to still recognize the fence.
const FENCE_RE = /^(```+|~~~+)\s*([A-Za-z0-9_-]*)((?:\s+.*)?)$/;
const INLINE_QUIZ_QUESTION_RE = /^\s*\?\s*(.*)$/;

/** Parses a full `.learn.md` document into an ordered list of segments. */
export function parseLearnMD(source: string): LearnDocument {
  const { data: frontmatter, body } = parseFrontmatter(source);
  const lines = body.split(/\r\n|\n/);

  const title = typeof frontmatter.title === "string" ? frontmatter.title : undefined;
  const description =
    typeof frontmatter.description === "string" ? frontmatter.description : undefined;
  const math = frontmatter.math === true || frontmatter.math === "true";

  const segments: LearnSegment[] = [];
  let proseBuffer: string[] = [];

  const flushProse = () => {
    const text = proseBuffer.join("\n").trim();
    if (text) segments.push({ type: "prose", markdown: text });
    proseBuffer = [];
  };

  let i = 0;
  while (i < lines.length) {
    const fenceMatch = lines[i].match(FENCE_RE);
    if (!fenceMatch) {
      proseBuffer.push(lines[i]);
      i++;
      continue;
    }

    const fenceMarker = fenceMatch[1][0].repeat(fenceMatch[1].length);
    const lang = fenceMatch[2].toLowerCase();
    const closeRe = new RegExp(`^${fenceMarker[0] === "`" ? "`{3,}" : "~{3,}"}\\s*$`);

    i++;
    const contentLines: string[] = [];
    while (i < lines.length && !closeRe.test(lines[i])) {
      contentLines.push(lines[i]);
      i++;
    }
    i++; // skip closing fence
    const content = contentLines.join("\n");

    if (lang === "example" || lang === "summary") {
      flushProse();
      segments.push({ type: lang, markdown: content });
    } else if (lang === "quiz") {
      flushProse();
      // LearnMD's inline mini-quiz syntax uses `? question text` as its first
      // line instead of QuizMD's `## Qn` heading — lift it into the title so
      // it renders like a real question instead of leaking into the prompt.
      let quizTitle = "";
      let quizLines = contentLines;
      const firstNonBlank = contentLines.findIndex((l) => l.trim() !== "");
      if (firstNonBlank !== -1) {
        const qm = contentLines[firstNonBlank].match(INLINE_QUIZ_QUESTION_RE);
        if (qm) {
          quizTitle = qm[1].trim();
          quizLines = contentLines.slice(firstNonBlank + 1);
        }
      }
      segments.push({ type: "quiz", question: parseQuestionBlock(quizTitle, quizLines) });
    } else if (DIAGRAM_KINDS.has(lang)) {
      flushProse();
      segments.push({ type: "diagram", kind: lang as DiagramKind, source: content });
    } else if (lang === "diagram" || lang === "anim") {
      // Stock references (DiagramMD §Slug references; AnimMD §Embedding):
      // ```diagram ref:<slug>``` renders the stock entry, ```anim ref:<slug>```
      // plays its AnimMD companion script. The slug may also sit in the fence
      // body (a common authoring slip both reference implementations accept).
      const attrs = parseFenceAttrs(fenceMatch[3] ?? "");
      let ref = typeof attrs.ref === "string" ? attrs.ref : "";
      if (!ref && content.trim()) {
        const bodyAttrs = parseFenceAttrs(content.trim().replace(/\s+/g, " "));
        if (typeof bodyAttrs.ref === "string") ref = bodyAttrs.ref;
      }
      flushProse();
      if (ref) {
        segments.push({ type: lang === "anim" ? "animref" : "diagramref", slug: ref });
      } else {
        segments.push({ type: "unsupported", lang, source: content });
      }
    } else if (lang === "" ) {
      // Plain, unlabeled fence: keep as ordinary Markdown code block (prose).
      proseBuffer.push(fenceMatch[0], ...contentLines, fenceMarker);
    } else {
      // Any other fenced language (d3, geomap, chess, vega-lite, svg, abc, ...)
      // and generic code blocks with a language marker are passed through to
      // `marked` as-is EXCEPT the ones this player explicitly does not
      // render — those degrade gracefully with a banner.
      if (isKnownDegradedBlock(lang)) {
        flushProse();
        segments.push({ type: "unsupported", lang, source: content });
      } else {
        proseBuffer.push(fenceMatch[0], ...contentLines, fenceMarker);
      }
    }
  }

  flushProse();

  return { title, description, math, frontmatter, segments };
}

const DEGRADED_LANGS = new Set([
  "d3",
  "geomap",
  "chess",
  "vega-lite",
  "vega",
  "svg",
  "abc",
]);

function isKnownDegradedBlock(lang: string): boolean {
  return DEGRADED_LANGS.has(lang);
}
