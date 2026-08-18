// Rewrites "convenient" URLs a user might paste (a GitHub file/blob page, a
// Gist page) into a raw-content URL that can actually be fetched with CORS
// from a static site, plus a jsDelivr CDN fallback for when the raw host is
// unreachable (rate-limited, CORS-blocked, etc).

export interface ResolvedUrl {
  /** Best URL to try first. */
  primary: string;
  /** jsDelivr (or other) fallback to try if `primary` fails. */
  fallback?: string;
}

const GITHUB_BLOB_RE =
  /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/;
const GITHUB_RAW_RE =
  /^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/;
const GIST_PAGE_RE = /^https?:\/\/gist\.github\.com\/([^/]+)\/([0-9a-f]+)\/?$/i;

/**
 * Normalizes a user-supplied URL into a fetchable raw-content URL, with a
 * jsDelivr fallback attached when we can compute one (currently: GitHub
 * `owner/repo@ref/path` URLs).
 */
export function resolveContentUrl(rawUrl: string): ResolvedUrl {
  const url = rawUrl.trim();

  const blobMatch = url.match(GITHUB_BLOB_RE);
  if (blobMatch) {
    const [, owner, repo, ref, path] = blobMatch;
    return {
      primary: `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`,
      fallback: `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}/${path}`,
    };
  }

  const rawMatch = url.match(GITHUB_RAW_RE);
  if (rawMatch) {
    const [, owner, repo, ref, path] = rawMatch;
    return {
      primary: url,
      fallback: `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}/${path}`,
    };
  }

  const gistMatch = url.match(GIST_PAGE_RE);
  if (gistMatch) {
    const [, , gistId] = gistMatch;
    return { primary: `https://api.github.com/gists/${gistId}` };
  }

  return { primary: url };
}

/**
 * Extracts the raw file content from a GitHub Gist API response. Gists can
 * contain multiple files; picks the first `.quiz.md` / `.learn.md` file, or
 * the first file if none matches.
 */
export function extractGistContent(gistApiResponse: unknown): string | null {
  if (
    typeof gistApiResponse !== "object" ||
    gistApiResponse === null ||
    !("files" in gistApiResponse)
  ) {
    return null;
  }
  const files = (gistApiResponse as { files: Record<string, { content?: string; filename?: string }> })
    .files;
  const entries = Object.values(files ?? {});
  if (entries.length === 0) return null;

  const preferred = entries.find(
    (f) => f.filename?.endsWith(".quiz.md") || f.filename?.endsWith(".learn.md"),
  );
  return (preferred ?? entries[0]).content ?? null;
}

/**
 * Resolves a TrackMD `!import ./sibling.learn.md` path against the URL the
 * track itself was loaded from.
 *
 * Resolution happens against the *original* URL rather than the rewritten
 * raw one, so a `github.com/.../blob/...` track yields a sibling blob URL
 * that `resolveContentUrl` can then rewrite (and attach a jsDelivr fallback
 * to) exactly like a hand-pasted one.
 *
 * Returns `null` when the base URL has no meaningful directory to resolve
 * against — notably Gists, whose files are a flat API payload, not paths.
 */
export function resolveRelativeUrl(baseUrl: string, relativePath: string): string | null {
  const path = relativePath.trim();
  if (/^https?:\/\//i.test(path)) return path;

  const base = baseUrl.trim();
  if (/gist\.github\.com|api\.github\.com\/gists\//i.test(base)) return null;

  try {
    return new URL(path, base).toString();
  } catch {
    return null;
  }
}

export type LearnSpecFormat = "quiz" | "learn";

/** Detects the format from a URL's file extension, defaulting to `"learn"`. */
export function detectFormatFromUrl(url: string): LearnSpecFormat {
  const path = url.split(/[?#]/)[0];
  if (path.endsWith(".quiz.md")) return "quiz";
  if (path.endsWith(".learn.md")) return "learn";
  return "learn";
}

/**
 * Detects the format from document content when the URL extension is
 * ambiguous: presence of a QuizMD checkbox choice (`- [ ]` / `- [x]`) inside
 * a `## ` question section implies QuizMD, otherwise LearnMD.
 */
export function detectFormatFromContent(content: string): LearnSpecFormat {
  const hasQuestionHeading = /^##\s+.+$/m.test(content);
  const hasCheckbox = /^[-*]\s*\[[ xX]\]/m.test(content);
  return hasQuestionHeading && hasCheckbox ? "quiz" : "learn";
}
