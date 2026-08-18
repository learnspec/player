// Resolves the real title of each track step by reading the imported files.
//
// A track's `!import ./proportionnalite.learn.md` says nothing about what the
// step is called — the title lives inside the file. Deriving a label from the
// filename loses the accents and repeats the same word for the lesson, the
// quiz, the nuggets and the flashcards of one chapter.
//
// So the titles are fetched, but never on the critical path: the table of
// contents renders immediately with filename-derived labels, and each one is
// replaced as its file comes back. A step whose file can't be read simply
// keeps its fallback label.

import { extractTitle } from "../parser/frontmatter";
import { fetchContentCached } from "./contentCache";
import { resolveRelativeUrl } from "./resolve";
import type { TrackDocument } from "../parser/trackmd";

/** Absolute URL → title (or null when the file names itself no title). */
const cache = new Map<string, string | null>();

/** Concurrent fetches. A long track is dozens of files; don't open them all at once. */
const CONCURRENCY = 6;

export interface TitleResolution {
  index: number;
  /** `null` once settled with no title to show — keep the fallback label. */
  title: string | null;
}

/**
 * Fetches step titles and reports each one through `onTitle` as it arrives.
 * Returns a function that cancels the remaining work — call it on unmount so
 * a track the reader has left stops fetching.
 */
export function resolveStepTitles(
  doc: TrackDocument,
  trackUrl: string,
  onTitle: (resolution: TitleResolution) => void,
): () => void {
  let cancelled = false;
  const queue = doc.steps.map((step) => ({
    index: step.index,
    url: resolveRelativeUrl(trackUrl, step.path),
  }));

  // Anything already known is reported synchronously, so navigating back to a
  // track doesn't flash the fallback labels again.
  const pending = queue.filter(({ index, url }) => {
    if (!url) {
      onTitle({ index, title: null });
      return false;
    }
    if (!cache.has(url)) return true;
    onTitle({ index, title: cache.get(url) ?? null });
    return false;
  });

  let next = 0;
  const worker = async (): Promise<void> => {
    while (!cancelled) {
      const item = pending[next++];
      if (!item || !item.url) return;
      try {
        const title = extractTitle(await fetchContentCached(item.url));
        cache.set(item.url, title);
        if (!cancelled) onTitle({ index: item.index, title });
      } catch {
        // A step that can't be read keeps its filename-derived label; the
        // failure surfaces properly if the reader actually opens that step.
        cache.set(item.url, null);
        if (!cancelled) onTitle({ index: item.index, title: null });
      }
    }
  };

  for (let i = 0; i < Math.min(CONCURRENCY, pending.length); i++) void worker();

  return () => {
    cancelled = true;
  };
}
