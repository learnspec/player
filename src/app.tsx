import { useEffect, useState } from "preact/hooks";
import { LearnView } from "./components/LearnView";
import { QuizPlayer } from "./components/QuizPlayer";
import { UrlLoader } from "./components/UrlLoader";
import { parseLearnMD } from "./parser/learnmd";
import { parseQuizMD } from "./parser/quizmd";
import {
  detectFormatFromContent,
  detectFormatFromUrl,
  extractGistContent,
  resolveContentUrl,
} from "./lib/resolve";

import demoQuizMd from "../samples/demo.quiz.md?raw";
import demoLearnMd from "../samples/demo.learn.md?raw";

type AppState =
  | { view: "home" }
  | { view: "loading"; url: string }
  | { view: "error"; url: string; message: string }
  | { view: "quiz"; source: string }
  | { view: "learn"; source: string };

function getQueryParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

async function fetchContent(url: string): Promise<string> {
  const resolved = resolveContentUrl(url);

  try {
    const res = await fetch(resolved.primary, { headers: { Accept: "text/plain, */*" } });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    if (resolved.primary.includes("api.github.com/gists/")) {
      const json = await res.json();
      const content = extractGistContent(json);
      if (!content) throw new Error("No matching file found in this Gist.");
      return content;
    }
    return await res.text();
  } catch (primaryError) {
    if (resolved.fallback) {
      try {
        const res = await fetch(resolved.fallback);
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        return await res.text();
      } catch (fallbackError) {
        throw new Error(
          `Could not fetch from the original URL (${
            primaryError instanceof Error ? primaryError.message : String(primaryError)
          }), and the jsDelivr fallback also failed (${
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          }).`,
        );
      }
    }
    const reason = primaryError instanceof Error ? primaryError.message : String(primaryError);
    const hint =
      " This can happen with CORS restrictions, a 404, or GitHub rate-limiting. If this is a GitHub file, try the jsDelivr mirror instead: https://cdn.jsdelivr.net/gh/OWNER/REPO@REF/PATH";
    throw new Error(`Failed to fetch ${resolved.primary}: ${reason}.${hint}`);
  }
}

export function App() {
  const [state, setState] = useState<AppState>({ view: "home" });
  const krokiBaseUrl = getQueryParam("kroki") ?? undefined;

  const loadUrl = async (url: string) => {
    setState({ view: "loading", url });
    try {
      const content = await fetchContent(url);
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

  return (
    <div class="app">
      <div class="app-content">{renderBody(state, loadUrl, loadSample, krokiBaseUrl)}</div>
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

function renderBody(
  state: AppState,
  loadUrl: (url: string) => void,
  loadSample: (name: "quiz" | "learn") => void,
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
          <button type="button" class="btn btn-secondary" onClick={() => loadUrl(state.url)}>
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
  }
}
