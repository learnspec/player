// Reviews a FlashMD deck: one card at a time, front then back, prev/next.
//
// What this deliberately is NOT: a spaced-repetition scheduler. FSRS state,
// due dates and cross-session queues are platform concerns — this is a
// straight-through session over the deck as authored, which is enough to
// prove the format plays without a backend. `new_per_day` from the
// frontmatter is read for display only; it changes nothing about ordering.

import { useEffect, useMemo, useState } from "preact/hooks";
import type { FlashCard, FlashDocument } from "../parser/flashmd";
import { Markdown } from "./Markdown";

interface FlashDeckViewProps {
  doc: FlashDocument;
}

export function FlashDeckView({ doc }: FlashDeckViewProps) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [hintShown, setHintShown] = useState(false);
  // One variant index per card id, assigned round-robin as each new card is
  // first shown and then kept stable for the rest of the session (Previous
  // shows the same phrasing again). With no cross-session persistence this
  // is the session-scoped reading of the spec's "rotate through variants for
  // coverage over time" — different cards in the deck get different
  // phrasings rather than every card defaulting to its first variant.
  const [variantByCard] = useState(() => new Map<string, number>());

  const card = doc.cards[index];

  useEffect(() => {
    setFlipped(false);
    setHintShown(false);
  }, [index]);

  const front = useMemo(() => {
    if (!card) return "";
    if (card.frontVariants.length === 1) return card.frontVariants[0];
    let variant = variantByCard.get(card.id);
    if (variant === undefined) {
      variant = variantByCard.size % card.frontVariants.length;
      variantByCard.set(card.id, variant);
    }
    return card.frontVariants[variant];
  }, [card, variantByCard]);

  if (doc.cards.length === 0) {
    return (
      <div class="flash-deck">
        <DeckHeader doc={doc} />
        <p class="track-notice">This deck has no readable cards.</p>
      </div>
    );
  }

  const goTo = (next: number) => setIndex(Math.max(0, Math.min(doc.cards.length - 1, next)));

  return (
    <div class="flash-deck">
      <DeckHeader doc={doc} />

      <div class="flash-progress">
        Card {index + 1} of {doc.cards.length}
      </div>

      <FlashCardFace card={card} front={front} flipped={flipped} onFlip={() => setFlipped(true)} />

      <div class="flash-controls">
        <button type="button" class="btn btn-secondary" disabled={index === 0} onClick={() => goTo(index - 1)}>
          Previous
        </button>

        {card.hint && !flipped && (
          <button type="button" class="btn btn-secondary" onClick={() => setHintShown((v) => !v)}>
            {hintShown ? "Hide hint" : "Show hint"}
          </button>
        )}

        {!flipped ? (
          <button type="button" class="btn btn-primary" onClick={() => setFlipped(true)}>
            Show answer
          </button>
        ) : (
          <button
            type="button"
            class="btn btn-primary"
            disabled={index === doc.cards.length - 1}
            onClick={() => goTo(index + 1)}
          >
            Next
          </button>
        )}
      </div>

      {hintShown && !flipped && card.hint && (
        <p class="flash-hint">
          <Markdown markdown={card.hint} inline />
        </p>
      )}

      {card.tags && card.tags.length > 0 && (
        <ul class="flash-tags">
          {card.tags.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DeckHeader({ doc }: { doc: FlashDocument }) {
  return (
    <header class="learn-header">
      <div class="track-kicker">FlashMD</div>
      <h1>{doc.title}</h1>
    </header>
  );
}

function FlashCardFace({
  card,
  front,
  flipped,
  onFlip,
}: {
  card: FlashCard;
  front: string;
  flipped: boolean;
  onFlip: () => void;
}) {
  return (
    <div
      class={`flash-card${flipped ? " flash-card-flipped" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => !flipped && onFlip()}
      onKeyDown={(e) => {
        if (!flipped && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onFlip();
        }
      }}
    >
      <div class="flash-card-side flash-card-front">
        <Markdown markdown={front} />
      </div>
      {flipped && (
        <div class="flash-card-side flash-card-back">
          <div class="flash-card-divider" aria-hidden="true" />
          <Markdown markdown={card.back} />
        </div>
      )}
      {!flipped && <div class="flash-card-tap-hint">Tap to reveal</div>}
    </div>
  );
}
