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

const CALLOUT_MARKER_RE = /^\s*\[!(note|tip|warning|important)\]\s*/i;

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
    bq.classList.add("callout", `callout-${kind}`);

    const label = document.createElement("div");
    label.className = "callout-label";
    label.textContent = kind.charAt(0).toUpperCase() + kind.slice(1);
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
