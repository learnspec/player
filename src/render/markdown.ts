// Markdown → sanitized HTML pipeline shared by LearnView and QuizPlayer.
//
// Pipeline: extract $...$ / $$...$$ math into placeholders (so `marked`
// never sees it and can't mangle underscores/asterisks inside formulas) →
// parse the rest with `marked` (GFM) → style `> [!note]` etc. callouts →
// substitute math placeholders with KaTeX output (dynamically imported,
// only when math is actually present) → sanitize the final HTML with
// DOMPurify before it ever touches `dangerouslySetInnerHTML`.

import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ gfm: true, breaks: false });

const MATH_BLOCK_RE = /\$\$([\s\S]+?)\$\$/g;
const MATH_INLINE_RE = /\$([^\n$]+?)\$/g;

interface MathPlaceholder {
  id: string;
  tex: string;
  display: boolean;
}

function extractMath(markdown: string): { text: string; placeholders: MathPlaceholder[] } {
  const placeholders: MathPlaceholder[] = [];
  let idx = 0;

  let text = markdown.replace(MATH_BLOCK_RE, (_m, tex: string) => {
    const id = `@@MATH_BLOCK_${idx++}@@`;
    placeholders.push({ id, tex, display: true });
    return id;
  });

  text = text.replace(MATH_INLINE_RE, (_m, tex: string) => {
    const id = `@@MATH_INLINE_${idx++}@@`;
    placeholders.push({ id, tex, display: false });
    return id;
  });

  return { text, placeholders };
}

// Any `[!word]` marker is treated as a callout, not just the eight types
// LearnMD names (SPEC §Callouts). Matching only the known list meant an
// unlisted type — `[!concept]`, which the wider ecosystem emits — leaked
// into the page as literal text. An unknown type gets neutral styling and
// its own name as the label: the player doesn't invent semantics it hasn't
// been told, but it never shows the reader raw markup either.
const CALLOUT_MARKER_RE = /^\s*\[!([a-z][a-z0-9-]*)\]\s*/i;

/** Types with a dedicated palette in index.css; others fall back to neutral. */
const STYLED_CALLOUTS: ReadonlySet<string> = new Set([
  "note",
  "tip",
  "warning",
  "important",
  "caution",
  "summary",
  "example",
  "objectives",
]);

/** Display label per callout type — the rest are just capitalised. */
const CALLOUT_LABEL: Record<string, string> = {
  objectives: "Learning objectives",
  todo: "To do",
};

/** Detects `> [!note]`-style GFM callouts and adds styling hooks. */
function applyCalloutStyling(html: string): string {
  if (typeof document === "undefined") return html;
  const container = document.createElement("div");
  container.innerHTML = html;

  container.querySelectorAll("blockquote").forEach((bq) => {
    const firstP = bq.querySelector("p");
    if (!firstP) return;
    const match = firstP.innerHTML.match(CALLOUT_MARKER_RE);
    if (!match) return;

    const kind = match[1].toLowerCase();
    firstP.innerHTML = firstP.innerHTML.slice(match[0].length);
    bq.classList.add("callout", STYLED_CALLOUTS.has(kind) ? `callout-${kind}` : "callout-generic");

    const label = document.createElement("div");
    label.className = "callout-label";
    label.textContent = CALLOUT_LABEL[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);
    bq.insertBefore(label, bq.firstChild);
  });

  return container.innerHTML;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Renders LearnSpec Markdown to sanitized HTML. Safe to feed directly into
 * `dangerouslySetInnerHTML` — every code path ends in DOMPurify.
 *
 * `inline: true` uses `marked`'s inline parser (no wrapping `<p>`, no block
 * elements) for short strings like question titles, choice text, and
 * hints — but still supports `$...$` math, since those can contain formulas
 * too.
 */
export async function renderMarkdown(markdown: string, opts?: { inline?: boolean }): Promise<string> {
  const hasMath = markdown.includes("$");
  let text = markdown;
  let placeholders: MathPlaceholder[] = [];

  if (hasMath) {
    ({ text, placeholders } = extractMath(markdown));
  }

  let html: string;
  if (opts?.inline) {
    html = marked.parseInline(text) as string;
  } else {
    html = (await marked.parse(text, { async: true })) as string;
    html = applyCalloutStyling(html);
  }

  if (placeholders.length > 0) {
    const [katex] = await Promise.all([import("katex"), import("katex/dist/katex.min.css")]);
    for (const ph of placeholders) {
      let rendered: string;
      try {
        rendered = katex.renderToString(ph.tex.trim(), {
          throwOnError: false,
          displayMode: ph.display,
        });
      } catch {
        rendered = `<code>${escapeHtml(ph.tex)}</code>`;
      }
      html = html.split(ph.id).join(rendered);
    }
  }

  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true, mathMl: true },
  });
}

/** Fast synchronous first-paint for inline strings, before the math-aware async render lands. */
export function renderInlineMarkdownSync(markdown: string): string {
  const html = marked.parseInline(markdown) as string;
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
