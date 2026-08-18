// Fetching a LearnSpec file from a user-supplied URL, with the URL rewriting
// and CDN fallback that makes raw GitHub / Gist links work from a static page.

import { extractGistContent, resolveContentUrl } from "./resolve";

export async function fetchContent(url: string): Promise<string> {
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
