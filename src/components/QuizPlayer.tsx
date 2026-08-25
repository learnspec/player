// Renders a full QuizMD document (or, with `compact`, a single inline
// question from a LearnMD ```quiz block). All questions are shown on one
// page; the learner answers everything, hits "Check answers", and gets
// per-question feedback plus a final score.
//
// Scoring: mcq/multi/tf/open are all-or-nothing (score 0 or 1). match/order
// support partial scoring per spec (`partial_scoring`, default true):
//   - match: correct pairs / total pairs
//   - order: Kendall's tau (concordant pairs / total pairs)
// The overall score is therefore a float, rounded to 1 decimal for display.

import { useState } from "preact/hooks";
import type { QuizDocument, QuizQuestion } from "../parser/quizmd";
import { isOpenAnswerCorrect, kendallTau } from "../parser/quizmd";
import { Markdown } from "./Markdown";

interface QuizPlayerProps {
  quiz: QuizDocument;
  /** Compact mode: no title/description header, used for inline quiz blocks in LearnMD. */
  compact?: boolean;
}

type AnswerState =
  | { kind: "choice"; choiceIndex: number | null }
  | { kind: "multi"; choiceIndexes: Set<number> }
  | { kind: "open"; texts: string[] }
  | { kind: "match"; selected: (string | null)[]; options: string[] }
  | { kind: "order"; order: number[] }
  | { kind: "unsupported" };

function shuffled<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function initialAnswer(question: QuizQuestion): AnswerState {
  switch (question.type) {
    case "mcq":
    case "tf":
      return { kind: "choice", choiceIndex: null };
    case "multi":
      return { kind: "multi", choiceIndexes: new Set() };
    case "open":
      return { kind: "open", texts: (question.blanks ?? [""]).map(() => "") };
    case "match":
      return {
        kind: "match",
        selected: (question.matchPairs ?? []).map(() => null),
        options: shuffled((question.matchPairs ?? []).map((p) => p.right)),
      };
    case "order":
      return {
        kind: "order",
        order: shuffled((question.orderItems ?? []).map((_, i) => i)),
      };
    default:
      return { kind: "unsupported" };
  }
}

/** Fraction correct, in [0, 1]. Only match/order can be fractional. */
function scoreForQuestion(question: QuizQuestion, answer: AnswerState, partialScoring: boolean): number {
  if ((question.type === "mcq" || question.type === "tf") && answer.kind === "choice") {
    if (answer.choiceIndex === null) return 0;
    return question.choices?.[answer.choiceIndex]?.correct ? 1 : 0;
  }
  if (question.type === "multi" && answer.kind === "multi") {
    const correctSet = new Set(
      (question.choices ?? []).flatMap((c, i) => (c.correct ? [i] : [])),
    );
    if (correctSet.size !== answer.choiceIndexes.size) return 0;
    for (const i of answer.choiceIndexes) if (!correctSet.has(i)) return 0;
    return 1;
  }
  if (question.type === "open" && answer.kind === "open") {
    const blanks = question.blanks ?? [];
    if (blanks.length === 0) return 0;
    const allCorrect = blanks.every((accepted, i) => isOpenAnswerCorrect(answer.texts[i] ?? "", accepted));
    return allCorrect ? 1 : 0;
  }
  if (question.type === "match" && answer.kind === "match") {
    const pairs = question.matchPairs ?? [];
    if (pairs.length === 0) return 0;
    const correct = pairs.filter((p, i) => answer.selected[i] === p.right).length;
    if (!partialScoring) return correct === pairs.length ? 1 : 0;
    return correct / pairs.length;
  }
  if (question.type === "order" && answer.kind === "order") {
    const items = question.orderItems ?? [];
    if (items.length === 0) return 0;
    if (!partialScoring) {
      const exact = answer.order.every((itemIdx, i) => itemIdx === i);
      return exact ? 1 : 0;
    }
    return kendallTau(answer.order);
  }
  return 0;
}

export function QuizPlayer({ quiz, compact }: QuizPlayerProps) {
  const [answers, setAnswers] = useState<AnswerState[]>(() =>
    quiz.questions.map(initialAnswer),
  );
  const [checked, setChecked] = useState(false);
  const [openHints, setOpenHints] = useState<Set<number>>(new Set());

  // Takes an updater rather than a value so two updates dispatched before a
  // re-render lands (e.g. two `<select>` changes in the same match question)
  // each read the *previous* state instead of a stale render-time snapshot —
  // otherwise the second update can silently clobber the first.
  const setAnswer = (index: number, updater: (prev: AnswerState) => AnswerState) => {
    setAnswers((prev) => {
      const copy = prev.slice();
      copy[index] = updater(prev[index]);
      return copy;
    });
  };

  const toggleHint = (index: number) => {
    setOpenHints((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const answerable = quiz.questions.filter((q) => q.type !== "unsupported");
  const rawScore = checked
    ? quiz.questions.reduce(
        (sum, q, i) =>
          sum + (q.type !== "unsupported" ? scoreForQuestion(q, answers[i], quiz.partialScoring) : 0),
        0,
      )
    : 0;
  const displayScore = Math.round(rawScore * 10) / 10;

  return (
    <div class={compact ? "quiz quiz-compact" : "quiz"}>
      {!compact && (
        <header class="quiz-header">
          <h1>{quiz.title}</h1>
          {quiz.description && (
            <div class="quiz-description">
              <Markdown markdown={quiz.description} />
            </div>
          )}
        </header>
      )}

      {quiz.questions.map((question, index) => (
        <QuestionCard
          key={index}
          index={index}
          question={question}
          answer={answers[index]}
          checked={checked}
          partialScoring={quiz.partialScoring}
          hintOpen={openHints.has(index)}
          onAnswer={(updater) => setAnswer(index, updater)}
          onToggleHint={() => toggleHint(index)}
        />
      ))}

      {answerable.length > 0 && (
        <div class="quiz-actions">
          {!checked ? (
            <button type="button" class="btn btn-primary" onClick={() => setChecked(true)}>
              Check answers
            </button>
          ) : (
            <div class="quiz-score" role="status">
              Score: <strong>{displayScore}</strong> / {answerable.length}
              <button
                type="button"
                class="btn btn-secondary"
                onClick={() => {
                  setChecked(false);
                  setAnswers(quiz.questions.map(initialAnswer));
                  setOpenHints(new Set());
                }}
              >
                Try again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface QuestionCardProps {
  index: number;
  question: QuizQuestion;
  answer: AnswerState;
  checked: boolean;
  partialScoring: boolean;
  hintOpen: boolean;
  onAnswer: (updater: (prev: AnswerState) => AnswerState) => void;
  onToggleHint: () => void;
}

function QuestionCard({
  index,
  question,
  answer,
  checked,
  partialScoring,
  hintOpen,
  onAnswer,
  onToggleHint,
}: QuestionCardProps) {
  const score =
    checked && question.type !== "unsupported" ? scoreForQuestion(question, answer, partialScoring) : null;
  const cardState: "correct" | "incorrect" | "partial" | null =
    score === null ? null : score >= 1 ? "correct" : score <= 0 ? "incorrect" : "partial";

  return (
    <section
      class={
        "question" +
        (cardState === "correct" ? " question-correct" : "") +
        (cardState === "incorrect" ? " question-incorrect" : "") +
        (cardState === "partial" ? " question-partial" : "")
      }
    >
      <h2 class="question-title">
        <span class="question-number">Q{index + 1}.</span>{" "}
        <Markdown markdown={question.title || "Question"} inline />
        {typeof question.points === "number" && (
          <span class="question-points">
            {question.points} pt{question.points === 1 ? "" : "s"}
          </span>
        )}
      </h2>

      {question.prompt && (
        <div class="question-prompt">
          <Markdown markdown={question.prompt} />
        </div>
      )}

      {question.type === "unsupported" && (
        <p class="question-warning">
          ⚠ Unsupported question type: this question has no checkboxes, no <code>___</code> blank,
          no match table, and no ordered list, so it can't be answered here.
        </p>
      )}

      {(question.type === "mcq" || question.type === "tf") && answer.kind === "choice" && (
        <ChoiceList
          name={`q${index}`}
          multi={false}
          question={question}
          checked={checked}
          selectedIndexes={answer.choiceIndex === null ? new Set() : new Set([answer.choiceIndex])}
          onToggle={(i) => onAnswer(() => ({ kind: "choice", choiceIndex: i }))}
        />
      )}

      {question.type === "multi" && answer.kind === "multi" && (
        <ChoiceList
          name={`q${index}`}
          multi
          question={question}
          checked={checked}
          selectedIndexes={answer.choiceIndexes}
          onToggle={(i) => {
            onAnswer((prev) => {
              if (prev.kind !== "multi") return prev;
              const next = new Set(prev.choiceIndexes);
              if (next.has(i)) next.delete(i);
              else next.add(i);
              return { kind: "multi", choiceIndexes: next };
            });
          }}
        />
      )}

      {question.type === "open" && answer.kind === "open" && (
        <OpenAnswer question={question} answer={answer} checked={checked} onAnswer={onAnswer} />
      )}

      {question.type === "match" && answer.kind === "match" && (
        <MatchQuestion question={question} answer={answer} checked={checked} onAnswer={onAnswer} />
      )}

      {question.type === "order" && answer.kind === "order" && (
        <OrderQuestion question={question} answer={answer} checked={checked} onAnswer={onAnswer} />
      )}

      {question.hint && (
        <div class="question-hint">
          <button type="button" class="hint-toggle" onClick={onToggleHint}>
            {hintOpen ? "Hide hint" : "Show hint"}
          </button>
          {hintOpen && (
            <div class="hint-body">
              <Markdown markdown={question.hint} inline />
            </div>
          )}
        </div>
      )}

      {checked && (score === 1 ? question.correctFeedback : score !== null && question.incorrectFeedback) && (
        <div class="question-explanation">
          <Markdown markdown={(score === 1 ? question.correctFeedback : question.incorrectFeedback) ?? ""} />
        </div>
      )}

      {checked && question.explanation && (
        <div class="question-explanation">
          <Markdown markdown={question.explanation} />
        </div>
      )}
    </section>
  );
}

function ChoiceList({
  name,
  multi,
  question,
  checked,
  selectedIndexes,
  onToggle,
}: {
  name: string;
  multi: boolean;
  question: QuizQuestion;
  checked: boolean;
  selectedIndexes: Set<number>;
  onToggle: (index: number) => void;
}) {
  return (
    <ul class="choices">
      {question.choices!.map((choice, i) => {
        const selected = selectedIndexes.has(i);
        return (
          <li key={i}>
            <label class={choiceClass(checked, choice.correct, selected)}>
              <input
                type={multi ? "checkbox" : "radio"}
                name={multi ? undefined : name}
                checked={selected}
                disabled={checked}
                onChange={() => onToggle(i)}
              />
              <Markdown markdown={choice.text} inline />
            </label>
            {checked && selected && choice.feedback && (
              <div class="choice-feedback">
                <Markdown markdown={choice.feedback} inline />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function OpenAnswer({
  question,
  answer,
  checked,
  onAnswer,
}: {
  question: QuizQuestion;
  answer: Extract<AnswerState, { kind: "open" }>;
  checked: boolean;
  onAnswer: (updater: (prev: AnswerState) => AnswerState) => void;
}) {
  const blanks = question.blanks ?? [];
  return (
    <div class="open-answer">
      {blanks.map((accepted, i) => {
        const correct = checked ? isOpenAnswerCorrect(answer.texts[i] ?? "", accepted) : null;
        return (
          <div class="open-answer-blank" key={i}>
            {blanks.length > 1 && <label class="open-answer-label">Blank {i + 1}</label>}
            <input
              type="text"
              class="open-answer-input"
              value={answer.texts[i] ?? ""}
              disabled={checked}
              placeholder="Your answer"
              onInput={(e) => {
                const value = (e.target as HTMLInputElement).value;
                onAnswer((prev) => {
                  if (prev.kind !== "open") return prev;
                  const next = prev.texts.slice();
                  next[i] = value;
                  return { kind: "open", texts: next };
                });
              }}
            />
            {checked && (
              <p class={correct ? "open-answer-feedback correct" : "open-answer-feedback incorrect"}>
                {correct ? "Correct" : `Expected: ${accepted}`}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MatchQuestion({
  question,
  answer,
  checked,
  onAnswer,
}: {
  question: QuizQuestion;
  answer: Extract<AnswerState, { kind: "match" }>;
  checked: boolean;
  onAnswer: (updater: (prev: AnswerState) => AnswerState) => void;
}) {
  const pairs = question.matchPairs ?? [];
  const columns = question.matchColumns ?? ["Left", "Right"];
  const correctCount = pairs.filter((p, i) => answer.selected[i] === p.right).length;

  return (
    <div class="match-question">
      <table class="match-table">
        <thead>
          <tr>
            <th>{columns[0]}</th>
            <th>{columns[1]}</th>
          </tr>
        </thead>
        <tbody>
          {pairs.map((pair, i) => {
            const isRowCorrect = checked ? answer.selected[i] === pair.right : null;
            return (
              <tr key={i} class={isRowCorrect === true ? "match-row-correct" : isRowCorrect === false ? "match-row-incorrect" : ""}>
                <td>
                  <Markdown markdown={pair.left} inline />
                </td>
                <td>
                  <select
                    class="match-select"
                    disabled={checked}
                    value={answer.selected[i] ?? ""}
                    onChange={(e) => {
                      const value = (e.target as HTMLSelectElement).value || null;
                      onAnswer((prev) => {
                        if (prev.kind !== "match") return prev;
                        const next = prev.selected.slice();
                        next[i] = value;
                        return { kind: "match", selected: next, options: prev.options };
                      });
                    }}
                  >
                    <option value="">choose…</option>
                    {answer.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  {checked && isRowCorrect === false && (
                    <p class="match-expected">Expected: {pair.right}</p>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {checked && (
        <p class="match-summary">
          {correctCount} / {pairs.length} pairs correct
        </p>
      )}
    </div>
  );
}

function OrderQuestion({
  question,
  answer,
  checked,
  onAnswer,
}: {
  question: QuizQuestion;
  answer: Extract<AnswerState, { kind: "order" }>;
  checked: boolean;
  onAnswer: (updater: (prev: AnswerState) => AnswerState) => void;
}) {
  const items = question.orderItems ?? [];
  const move = (from: number, to: number) => {
    onAnswer((prev) => {
      if (prev.kind !== "order") return prev;
      if (to < 0 || to >= prev.order.length) return prev;
      const next = prev.order.slice();
      [next[from], next[to]] = [next[to], next[from]];
      return { kind: "order", order: next };
    });
  };
  const tau = checked ? kendallTau(answer.order) : null;

  return (
    <div class="order-question">
      <ol class="order-list">
        {answer.order.map((itemIdx, position) => {
          const isPositionCorrect = checked ? itemIdx === position : null;
          return (
            <li
              key={itemIdx}
              class={
                "order-item" +
                (isPositionCorrect === true ? " order-item-correct" : "") +
                (isPositionCorrect === false ? " order-item-incorrect" : "")
              }
            >
              <span class="order-item-text">
                <Markdown markdown={items[itemIdx] ?? ""} inline />
              </span>
              <span class="order-item-controls">
                <button
                  type="button"
                  class="order-btn"
                  disabled={checked || position === 0}
                  onClick={() => move(position, position - 1)}
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  class="order-btn"
                  disabled={checked || position === answer.order.length - 1}
                  onClick={() => move(position, position + 1)}
                  aria-label="Move down"
                >
                  ↓
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      {checked && tau !== null && (
        <p class="order-summary">Kendall's tau: {Math.round(tau * 100) / 100}</p>
      )}
    </div>
  );
}

function choiceClass(checked: boolean, isCorrectChoice: boolean, isSelected: boolean): string {
  if (!checked) return isSelected ? "choice choice-selected" : "choice";
  if (isCorrectChoice) return "choice choice-correct";
  if (isSelected) return "choice choice-incorrect";
  return "choice";
}
