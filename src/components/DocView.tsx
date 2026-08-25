// Reading view for the formats this player does not *play*: FlashMD,
// NuggetMD, GlossaryMD and anything else a track imports.
//
// This is graceful degradation applied to the player itself. Spaced
// repetition scheduling, review queues and progress are platform features,
// not format features — so rather than fake them, the file is rendered as
// the Markdown document it already is, with the limitation stated up front.

import { parseFrontmatter } from "../parser/frontmatter";
import type { StepKind } from "../parser/trackmd";
import { Markdown } from "./Markdown";

interface DocViewProps {
  source: string;
  kind: StepKind;
  /** Fallback title when the file carries no frontmatter title or H1. */
  fallbackTitle: string;
}

const NOTICE: Partial<Record<StepKind, string>> = {
  flash: "Flashcards are shown as a plain document: scheduling and review are player features, not format features.",
  nugget: "Shown as a plain document: this player renders NuggetMD without its card behaviour.",
  other: "Shown as a plain Markdown document: this player has no dedicated view for this format.",
};

export function DocView({ source, kind, fallbackTitle }: DocViewProps) {
  const { data, body } = parseFrontmatter(source);
  const title = typeof data.title === "string" && data.title ? data.title : fallbackTitle;
  const notice = NOTICE[kind] ?? NOTICE.other!;

  return (
    <article class="learn doc-view">
      <header class="learn-header">
        <h1>{title}</h1>
        {typeof data.description === "string" && data.description && (
          <p class="learn-description">{data.description}</p>
        )}
      </header>
      <p class="doc-notice">{notice}</p>
      <Markdown markdown={body} />
    </article>
  );
}
