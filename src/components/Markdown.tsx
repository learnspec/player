// Small wrapper that renders a Markdown string to sanitized HTML.
//
// `inline` mode (choice text, hints, question titles) skips block elements
// (no wrapping `<p>`) but still supports `$...$` math — it paints
// synchronously first (fast, no math) then re-renders through the
// math-aware async pipeline once KaTeX (if needed) has loaded. Block mode
// only ever renders asynchronously, since callout styling also needs it.

import { useEffect, useState } from "preact/hooks";
import { renderInlineMarkdownSync, renderMarkdown } from "../render/markdown";

interface MarkdownProps {
  markdown: string;
  inline?: boolean;
}

export function Markdown({ markdown, inline }: MarkdownProps) {
  const [html, setHtml] = useState<string>(() => (inline ? renderInlineMarkdownSync(markdown) : ""));

  useEffect(() => {
    let cancelled = false;
    renderMarkdown(markdown, { inline }).then((rendered) => {
      if (!cancelled) setHtml(rendered);
    });
    return () => {
      cancelled = true;
    };
  }, [markdown, inline]);

  const Tag = inline ? "span" : "div";
  return <Tag class="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />;
}
