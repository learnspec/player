// Renders a full QuizMD document (or, with `compact`, a single inline
// question from a LearnMD ```quiz block). All questions are shown on one
// page; the learner answers everything, hits "Check answers", and gets
// per-question feedback plus a final score.

import { useState } from "preact/hooks";
import type { QuizDocument, QuizQuestion } from "../parser/quizmd";
import { isOpenAnswerCorrect } from "../parser/quizmd";
import { Markdown } from "./Markdown";

interface QuizPlayerProps {
  quiz: QuizDocument;
  /** Compact mode: no title/description header, used for inline quiz blocks in LearnMD. */
  compact?: boolean;
}

type AnswerState =
  | { kind: "single"; choiceIndex: number | null }
  | { kind: "multiple"; choiceIndexes: Set<number> }
  | { kind: "open"; text: string }
  | { kind: "unsupported" };

function initialAnswer(question: QuizQuestion): AnswerState {
  switch (question.type) {
    case "single":
      return { kind: "single", choiceIndex: null };
    case "multiple":
      return { kind: "multiple", choiceIndexes: new Set() };
    case "open":
      return { kind: "open", text: "" };
    default:
      return { kind: "unsupported" };
  }
}

function isCorrect(question: QuizQuestion, answer: AnswerState): boolean {
  if (question.type === "single" && answer.kind === "single") {
    if (answer.choiceIndex === null) return false;
    return question.choices?.[answer.choiceIndex]?.correct ?? false;
  }
  if (question.type === "multiple" && answer.kind === "multiple") {
    const correctSet = new Set(
      (question.choices ?? []).flatMap((c, i) => (c.correct ? [i] : [])),
    );
    if (correctSet.size !== answer.choiceIndexes.size) return false;
    for (const i of answer.choiceIndexes) if (!correctSet.has(i)) return false;
    return true;
  }
  if (question.type === "open" && answer.kind === "open") {
    return isOpenAnswerCorrect(answer.text, question.answers ?? []);
  }
  return false;
}

export function QuizPlayer({ quiz, compact }: QuizPlayerProps) {
  const [answers, setAnswers] = useState<AnswerState[]>(() =>
    quiz.questions.map(initialAnswer),
  );
  const [checked, setChecked] = useState(false);
  const [openHints, setOpenHints] = useState<Set<number>>(new Set());

  const setAnswer = (index: number, next: AnswerState) => {
    setAnswers((prev) => {
      const copy = prev.slice();
      copy[index] = next;
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
  const score = checked
    ? quiz.questions.reduce(
        (sum, q, i) => sum + (q.type !== "unsupported" && isCorrect(q, answers[i]) ? 1 : 0),
        0,
      )
    : 0;

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
          hintOpen={openHints.has(index)}
          onAnswer={(next) => setAnswer(index, next)}
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
              Score: <strong>{score}</strong> / {answerable.length}
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
  hintOpen: boolean;
  onAnswer: (next: AnswerState) => void;
  onToggleHint: () => void;
}

function QuestionCard({
  index,
  question,
  answer,
  checked,
  hintOpen,
  onAnswer,
  onToggleHint,
}: QuestionCardProps) {
  const correct = checked && question.type !== "unsupported" ? isCorrect(question, answer) : null;

  return (
    <section
      class={
        "question" +
        (checked && correct === true ? " question-correct" : "") +
        (checked && correct === false ? " question-incorrect" : "")
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
          ⚠ Unsupported question type — no checkboxes and no <code>= answer</code> line were
          found, so this question can't be answered here.
        </p>
      )}

      {question.type === "single" && answer.kind === "single" && (
        <ul class="choices">
          {question.choices!.map((choice, i) => (
            <li key={i}>
              <label class={choiceClass(checked, choice.correct, answer.choiceIndex === i)}>
                <input
                  type="radio"
                  name={`q${index}`}
                  checked={answer.choiceIndex === i}
                  disabled={checked}
                  onChange={() => onAnswer({ kind: "single", choiceIndex: i })}
                />
                <Markdown markdown={choice.text} inline />
              </label>
            </li>
          ))}
        </ul>
      )}

      {question.type === "multiple" && answer.kind === "multiple" && (
        <ul class="choices">
          {question.choices!.map((choice, i) => (
            <li key={i}>
              <label class={choiceClass(checked, choice.correct, answer.choiceIndexes.has(i))}>
                <input
                  type="checkbox"
                  checked={answer.choiceIndexes.has(i)}
                  disabled={checked}
                  onChange={(e) => {
                    const next = new Set(answer.choiceIndexes);
                    if ((e.target as HTMLInputElement).checked) next.add(i);
                    else next.delete(i);
                    onAnswer({ kind: "multiple", choiceIndexes: next });
                  }}
                />
                <Markdown markdown={choice.text} inline />
              </label>
            </li>
          ))}
        </ul>
      )}

      {question.type === "open" && answer.kind === "open" && (
        <div class="open-answer">
          <input
            type="text"
            class="open-answer-input"
            value={answer.text}
            disabled={checked}
            placeholder="Your answer"
            onInput={(e) => onAnswer({ kind: "open", text: (e.target as HTMLInputElement).value })}
          />
          {checked && (
            <p class={correct ? "open-answer-feedback correct" : "open-answer-feedback incorrect"}>
              {correct
                ? "Correct"
                : `Expected: ${question.answers?.join(" / ")}`}
            </p>
          )}
        </div>
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

      {checked && question.explanation && (
        <div class="question-explanation">
          <Markdown markdown={question.explanation} />
        </div>
      )}
    </section>
  );
}

function choiceClass(checked: boolean, isCorrectChoice: boolean, isSelected: boolean): string {
  if (!checked) return isSelected ? "choice choice-selected" : "choice";
  if (isCorrectChoice) return "choice choice-correct";
  if (isSelected) return "choice choice-incorrect";
  return "choice";
}
