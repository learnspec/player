// Encodes diagram source for the kroki.io "GET" API, which expects the
// payload deflate-compressed (raw, no zlib header) and then base64url
// encoded: https://docs.kroki.io/kroki/setup/encode-diagram/

import { deflate } from "pako";
import type { DiagramKind } from "../parser/learnmd";

/** kroki.io diagram type for each LearnMD diagram fence language we render. */
const KROKI_TYPE: Partial<Record<DiagramKind, string>> = {
  mermaid: "mermaid",
  graphviz: "graphviz",
  plantuml: "plantuml",
  d2: "d2",
  tikz: "tikz",
  "vega-lite": "vegalite",
  // kroki.io has no generic "latex" diagram type — a plain LaTeX snippet has
  // no equivalent here and degrades to a code block instead.
};

/**
 * kroki.io's TikZ backend compiles a *whole LaTeX document*: a bare
 * `\begin{tikzpicture}` snippet comes back as a 400 with a rendered error
 * image. Authors write the snippet, so wrap it when no preamble is present.
 *
 * Detection is on `\documentclass` rather than on `\begin{document}`, since
 * that is what actually decides whether the source compiles standalone.
 */
export function wrapTikzDocument(source: string): string {
  if (/\\documentclass/.test(source)) return source;
  return `\\documentclass[tikz,border=6pt]{standalone}
\\begin{document}
${source.trim()}
\\end{document}`;
}

/** Diagram kinds this player renders via a kroki.io `<img>` (excludes mermaid, which uses the JS lib). */
export function isKrokiRenderable(kind: DiagramKind): boolean {
  return kind !== "mermaid" && kind in KROKI_TYPE;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Encodes diagram source into the kroki.io payload segment of the URL. */
export function encodeKrokiPayload(source: string): string {
  const bytes = new TextEncoder().encode(source);
  const compressed = deflate(bytes, { level: 9 });
  return toBase64Url(compressed);
}

/**
 * Builds a full kroki.io render URL for the given diagram, or `null` if this
 * diagram kind has no kroki.io equivalent. `baseUrl` defaults to the public
 * instance but can be overridden (e.g. via the `?kroki=` query param) to
 * point at a self-hosted instance.
 */
export function buildKrokiUrl(
  kind: DiagramKind,
  source: string,
  baseUrl = "https://kroki.io",
): string | null {
  const type = KROKI_TYPE[kind];
  if (!type) return null;
  const payload = encodeKrokiPayload(kind === "tikz" ? wrapTikzDocument(source) : source);
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/${type}/svg/${payload}`;
}
