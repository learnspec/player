// Renders a NuggetMD file as a list of expandable micro-concepts.
//
// FSRS scheduling across sessions is a platform concern, same posture as the
// flashcard deck — this shows every nugget as authored, in order, with an
// interactive recall question where the Check section parses as one.

import { useState } from "preact/hooks";
import type { Nugget, NuggetDocument } from "../parser/nuggetmd";
import { QuizPlayer } from "./QuizPlayer";
import { Markdown } from "./Markdown";

interface NuggetViewProps {
  doc: NuggetDocument;
}

export function NuggetView({ doc }: NuggetViewProps) {
  return (
    <div class="nugget-deck">
      <header class="learn-header">
        <div class="track-kicker">NuggetMD</div>
        <h1>{doc.title}</h1>
        {doc.description && <p class="learn-description">{doc.description}</p>}
        <p class="track-meta">
          {doc.nuggets.length} concept{doc.nuggets.length === 1 ? "" : "s"}
          {doc.spacedRepetition && <> · {doc.spacedRepetition.toUpperCase()} review</>}
        </p>
      </header>

      {doc.nuggets.length === 0 ? (
        <p class="track-notice">This file has no readable nuggets.</p>
      ) : (
        doc.nuggets.map((n, i) => <NuggetCard key={n.id} nugget={n} defaultOpen={i === 0} />)
      )}
    </div>
  );
}

function NuggetCard({ nugget, defaultOpen }: { nugget: Nugget; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <article class={`nugget-card${open ? " nugget-card-open" : ""}`}>
      <button type="button" class="nugget-card-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span class="nugget-card-chevron" aria-hidden="true" />
        <span class="nugget-card-title">{nugget.title}</span>
        {nugget.level && <span class="step-flag">{nugget.level}</span>}
      </button>

      {open && (
        <div class="nugget-card-body">
          <section class="nugget-section">
            <h3 class="nugget-section-label">Concept</h3>
            <Markdown markdown={nugget.concept} />
          </section>

          {nugget.whyItMatters && (
            <section class="nugget-section">
              <h3 class="nugget-section-label">Why it matters</h3>
              <Markdown markdown={nugget.whyItMatters} />
            </section>
          )}

          {nugget.check ? (
            <section class="nugget-section nugget-check">
              <h3 class="nugget-section-label">Check</h3>
              <QuizPlayer
                quiz={{ title: "", frontmatter: {}, partialScoring: true, questions: [nugget.check] }}
                compact
              />
            </section>
          ) : (
            nugget.checkRaw && (
              <section class="nugget-section">
                <h3 class="nugget-section-label">Check</h3>
                <Markdown markdown={nugget.checkRaw} />
              </section>
            )
          )}

          {nugget.extra && (
            <section class="nugget-section">
              <Markdown markdown={nugget.extra} />
            </section>
          )}

          {nugget.tags && nugget.tags.length > 0 && (
            <ul class="flash-tags">
              {nugget.tags.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}
