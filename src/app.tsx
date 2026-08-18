import { useEffect, useState } from "preact/hooks";
import { DocView } from "./components/DocView";
import { LearnView } from "./components/LearnView";
import { QuizPlayer } from "./components/QuizPlayer";
import { TrackView } from "./components/TrackView";
import { UrlLoader } from "./components/UrlLoader";
import { parseLearnMD } from "./parser/learnmd";
import { parseQuizMD } from "./parser/quizmd";
import { looksLikeTrack, parseTrackMD, type StepKind, type TrackDocument } from "./parser/trackmd";
import {
  detectFormatFromContent,
  detectFormatFromUrl,
  resolveRelativeUrl,
} from "./lib/resolve";
import { fetchContent } from "./lib/fetchContent";

import demoQuizMd from "../samples/demo.quiz.md?raw";
import demoLearnMd from "../samples/demo.learn.md?raw";

/**
 * Set while the learner is inside a track, so every step view can offer
 * "back to the track" and prev/next without refetching the track file.
 */
interface TrackNav {
  doc: TrackDocument;
  /** URL the track itself was loaded from — the base for relative imports. */
  url: string;
  stepIndex: number;
}

type AppState =
  | { view: "home" }
  | { view: "loading"; url: string; nav?: TrackNav }
  | { view: "error"; url: string; message: string; nav?: TrackNav }
  | { view: "quiz"; source: string; nav?: TrackNav }
  | { view: "learn"; source: string; nav?: TrackNav }
  | { view: "doc"; source: string; kind: StepKind; label: string; nav?: TrackNav }
  | { view: "track"; doc: TrackDocument; url: string };

function getQueryParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

export function App() {
  const [state, setState] = useState<AppState>({ view: "home" });
  const krokiBaseUrl = getQueryParam("kroki") ?? undefined;

  const loadUrl = async (url: string) => {
    setState({ view: "loading", url });
    try {
      const content = await fetchContent(url);

      if (url.split(/[?#]/)[0].endsWith(".track.md") || looksLikeTrack(content)) {
        setState({ view: "track", doc: parseTrackMD(content), url });
        return;
      }

      const urlFormat = detectFormatFromUrl(url);
      const format =
        url.endsWith(".quiz.md") || url.endsWith(".learn.md")
          ? urlFormat
          : detectFormatFromContent(content);
      setState(
        format === "quiz" ? { view: "quiz", source: content } : { view: "learn", source: content },
      );
    } catch (err) {
      setState({
        view: "error",
        url,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const openStep = async (doc: TrackDocument, trackUrl: string, stepIndex: number) => {
    const step = doc.steps[stepIndex];
    if (!step) return;

    const nav: TrackNav = { doc, url: trackUrl, stepIndex };
    const target = resolveRelativeUrl(trackUrl, step.path);
    if (!target) {
      setState({
        view: "error",
        url: step.path,
        message: `Can't resolve ${step.path} against ${trackUrl}.`,
        nav,
      });
      return;
    }

    setState({ view: "loading", url: target, nav });
    try {
      const content = await fetchContent(target);
      if (step.kind === "quiz") {
        setState({ view: "quiz", source: content, nav });
      } else if (step.kind === "learn") {
        setState({ view: "learn", source: content, nav });
      } else {
        setState({ view: "doc", source: content, kind: step.kind, label: step.label, nav });
      }
    } catch (err) {
      setState({
        view: "error",
        url: target,
        message: err instanceof Error ? err.message : String(err),
        nav,
      });
    }
  };

  const backToTrack = (nav: TrackNav) => setState({ view: "track", doc: nav.doc, url: nav.url });

  const loadSample = (name: "quiz" | "learn") => {
    setState(
      name === "quiz" ? { view: "quiz", source: demoQuizMd } : { view: "learn", source: demoLearnMd },
    );
  };

  useEffect(() => {
    const urlParam = getQueryParam("url");
    if (urlParam) loadUrl(urlParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nav = state.view === "track" ? undefined : state.view === "home" ? undefined : state.nav;

  return (
    <div class="app">
      {nav && (
        <TrackBar
          nav={nav}
          onBack={() => backToTrack(nav)}
          onGo={(index) => openStep(nav.doc, nav.url, index)}
        />
      )}
      {/* The view name drives the column width: a table of contents wants
          more room than running prose, prose wants a readable measure. */}
      <div class={`app-content app-content-${state.view}`}>
        {renderBody(state, loadUrl, loadSample, openStep, krokiBaseUrl)}
      </div>
      <footer class="app-footer">
        <a href="https://learnspec.org" target="_blank" rel="noreferrer">
          learnspec.org
        </a>
        <span aria-hidden="true">·</span>
        <a href="https://github.com/learnspec" target="_blank" rel="noreferrer">
          Source
        </a>
      </footer>
    </div>
  );
}

function TrackBar({
  nav,
  onBack,
  onGo,
}: {
  nav: TrackNav;
  onBack: () => void;
  onGo: (index: number) => void;
}) {
  const total = nav.doc.steps.length;
  const hasPrev = nav.stepIndex > 0;
  const hasNext = nav.stepIndex < total - 1;

  return (
    <nav class="track-bar">
      <button type="button" class="btn btn-secondary btn-small" onClick={onBack}>
        ← {nav.doc.title}
      </button>
      <span class="track-bar-position">
        Step {nav.stepIndex + 1} of {total}
      </span>
      <span class="track-bar-actions">
        <button
          type="button"
          class="btn btn-secondary btn-small"
          disabled={!hasPrev}
          onClick={() => onGo(nav.stepIndex - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          class="btn btn-primary btn-small"
          disabled={!hasNext}
          onClick={() => onGo(nav.stepIndex + 1)}
        >
          Next
        </button>
      </span>
    </nav>
  );
}

function renderBody(
  state: AppState,
  loadUrl: (url: string) => void,
  loadSample: (name: "quiz" | "learn") => void,
  openStep: (doc: TrackDocument, trackUrl: string, stepIndex: number) => void,
  krokiBaseUrl: string | undefined,
) {
  switch (state.view) {
    case "home":
      return <UrlLoader onLoad={loadUrl} onLoadSample={loadSample} />;
    case "loading":
      return (
        <div class="status-panel">
          <p>Loading {state.url}…</p>
        </div>
      );
    case "error":
      return (
        <div class="status-panel status-error">
          <h2>Couldn't load this file</h2>
          <p>{state.message}</p>
          <button
            type="button"
            class="btn btn-secondary"
            onClick={() =>
              state.nav
                ? openStep(state.nav.doc, state.nav.url, state.nav.stepIndex)
                : loadUrl(state.url)
            }
          >
            Retry
          </button>
        </div>
      );
    case "quiz": {
      const quiz = parseQuizMD(state.source);
      return <QuizPlayer quiz={quiz} />;
    }
    case "learn": {
      const doc = parseLearnMD(state.source);
      return <LearnView doc={doc} krokiBaseUrl={krokiBaseUrl} />;
    }
    case "doc":
      return <DocView source={state.source} kind={state.kind} fallbackTitle={state.label} />;
    case "track": {
      // A track loaded from a Gist has no directory to resolve `./x.learn.md`
      // against, so it renders as a read-only syllabus rather than pretending
      // its steps are openable.
      const resolvable = resolveRelativeUrl(state.url, "./probe.learn.md") !== null;
      return (
        <TrackView
          doc={state.doc}
          url={state.url}
          onOpenStep={
            resolvable ? (index) => openStep(state.doc, state.url, index) : undefined
          }
          unresolvableReason={
            resolvable
              ? undefined
              : "This track's steps can't be opened from here: relative imports need a file URL with a directory (a raw GitHub or blob URL works; a Gist does not)."
          }
        />
      );
    }
  }
}
