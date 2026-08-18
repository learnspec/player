// Renders a parsed TrackMD document as a clickable table of contents:
// sections, steps grouped under them, and checkpoints shown as milestones.
//
// The player deliberately keeps no progress state — completion tracking,
// scheduling and scoring across a path are platform concerns, not format
// concerns. What this view proves is that a track is *navigable* from raw
// files alone, with no backend and no account.

import { useEffect, useState } from "preact/hooks";
import type { StepKind, TrackDocument, TrackStep } from "../parser/trackmd";
import { resolveStepTitles } from "../lib/stepTitles";
import { Markdown } from "./Markdown";

interface TrackViewProps {
  doc: TrackDocument;
  /** URL the track came from — the base for reading each step's real title. */
  url?: string;
  /** Called with the step's flat index; absent when steps can't be resolved. */
  onOpenStep?: (index: number) => void;
  /** Set when the track's own URL gives us no directory to resolve against. */
  unresolvableReason?: string;
}

const KIND_LABEL: Record<StepKind, string> = {
  learn: "Lesson",
  quiz: "Quiz",
  flash: "Flashcards",
  nugget: "Nugget",
  other: "File",
};

export function TrackView({ doc, url, onOpenStep, unresolvableReason }: TrackViewProps) {
  const mandatory = doc.steps.filter((s) => !s.optional).length;
  const titles = useStepTitles(doc, url);

  return (
    <article class="track">
      <header class="track-header">
        <div class="track-kicker">TrackMD</div>
        <h1>{doc.title}</h1>
        {doc.description && <p class="track-description">{doc.description}</p>}
        <p class="track-meta">
          {doc.steps.length} step{doc.steps.length === 1 ? "" : "s"}
          {mandatory !== doc.steps.length && <> · {mandatory} mandatory</>}
          {typeof doc.frontmatter.estimated_time === "string" && (
            <> · {doc.frontmatter.estimated_time}</>
          )}
          {typeof doc.frontmatter.level === "string" && <> · {doc.frontmatter.level}</>}
        </p>
      </header>

      {doc.intro && (
        <div class="track-intro">
          <Markdown markdown={doc.intro} />
        </div>
      )}

      {unresolvableReason && <p class="track-notice">{unresolvableReason}</p>}

      {doc.steps.length === 0 && (
        <p class="track-notice">
          This track declares no <code>!import</code> steps.
        </p>
      )}

      {doc.sections.map((section, i) => (
        <section key={i} class="track-section">
          {section.title && <h2>{section.title}</h2>}
          <ol class="track-steps">
            {section.entries.map((entry, j) =>
              entry.type === "checkpoint" ? (
                <li key={j} class="track-checkpoint">
                  <span class="track-checkpoint-marker" aria-hidden="true" />
                  <span>{entry.label ?? entry.id}</span>
                </li>
              ) : (
                <li key={j}>
                  <StepRow
                    step={entry}
                    title={titles.get(entry.index) ?? undefined}
                    provisional={Boolean(url) && !titles.has(entry.index)}
                    onOpen={onOpenStep}
                  />
                </li>
              ),
            )}
          </ol>
        </section>
      ))}

      {doc.refs.length > 0 && (
        <footer class="track-refs">
          <h2>Context</h2>
          <ul>
            {doc.refs.map((ref) => (
              <li key={ref.path}>
                <code>{ref.path}</code> <span class="step-kind">{ref.kind}</span>
              </li>
            ))}
          </ul>
        </footer>
      )}
    </article>
  );
}

/**
 * Reads each step's real title from the file it points at, replacing the
 * filename-derived fallback as the answers arrive.
 */
function useStepTitles(doc: TrackDocument, url?: string) {
  // A key present with a null value means "settled, no title" — distinct from
  // absent, which means "still being read".
  const [titles, setTitles] = useState<Map<number, string | null>>(new Map());

  useEffect(() => {
    setTitles(new Map());
    if (!url || doc.steps.length === 0) return;
    return resolveStepTitles(doc, url, ({ index, title }) =>
      setTitles((previous) => new Map(previous).set(index, title)),
    );
  }, [doc, url]);

  return titles;
}

function StepRow({
  step,
  title,
  provisional,
  onOpen,
}: {
  step: TrackStep;
  title?: string;
  /** The label is still the filename fallback, with the real title on its way. */
  provisional?: boolean;
  onOpen?: (index: number) => void;
}) {
  const body = (
    <>
      <span class={`step-kind step-kind-${step.kind}`}>{KIND_LABEL[step.kind]}</span>
      <span class={`step-label${provisional ? " step-label-provisional" : ""}`}>
        {title ?? step.label}
      </span>
      {step.optional && <span class="step-flag">optional</span>}
      {step.passingScore !== undefined && (
        <span class="step-flag">pass {Math.round(step.passingScore * 100)}%</span>
      )}
    </>
  );

  if (!onOpen) {
    return <div class="track-step track-step-static">{body}</div>;
  }

  return (
    <button type="button" class="track-step" onClick={() => onOpen(step.index)}>
      {body}
    </button>
  );
}
