// One shared cache in front of `fetchContent`, so a file is fetched at most
// once per session however many times the player needs it.
//
// This is what makes reading track step titles honest rather than wasteful:
// the same request that resolves a step's title also puts its content in
// hand, so opening that step costs no network at all. Without the cache the
// title pass would be N throwaway requests; with it, it is a prefetch.

import { fetchContent } from "./fetchContent";

/** Cached *promises*, so two callers racing for one URL share a single request. */
const cache = new Map<string, Promise<string>>();

/**
 * Roughly one large track's worth of files. Content is small (a few KB per
 * file), and the cap only exists so a long session browsing many tracks
 * doesn't grow without bound.
 */
const MAX_ENTRIES = 80;

export function fetchContentCached(url: string): Promise<string> {
  const hit = cache.get(url);
  if (hit) return hit;

  const pending = fetchContent(url);
  cache.set(url, pending);

  // A failed fetch must not be remembered: the reader may well retry, and a
  // cached rejection would make the retry button useless.
  pending.catch(() => cache.delete(url));

  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return pending;
}

/** Test seam: forget everything fetched so far. */
export function clearContentCache(): void {
  cache.clear();
}

/** Test seam: how many URLs are currently held. */
export function contentCacheSize(): number {
  return cache.size;
}
