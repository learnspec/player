// Minimal DiagramMD catalogue parser — reads a `stock.diagram.md` file
// (spec: learnspec/diagrammd, §Standalone .diagram.md File Format) into a
// slug → entry map, including AnimMD companion blocks (```anim for:<slug>,
// spec: learnspec/animmd, §Embedding).
//
// Lenient on purpose: a malformed entry is skipped, an `anim` block whose
// `for:` matches no entry is ignored (the authoritative implementation
// preserves those through rewrites; this player only reads).

import { parseFenceAttrs } from "./attrs";

export interface DiagramStockEntry {
  slug: string;
  kind: string; // mermaid | tikz | graphviz | … (fence language)
  source: string;
  caption?: string;
  /** Raw AnimMD companion script body, when the entry has one. */
  anim?: string;
}

export type DiagramStock = Map<string, DiagramStockEntry>;

const FENCE_OPEN_RE = /^```([A-Za-z0-9_-]+)((?:[ \t].*)?)$/;

export function parseDiagramStock(text: string): DiagramStock {
  const stock: DiagramStock = new Map();
  if (!text) return stock;

  const lines = text.split(/\r\n|\n/);
  const anims: Array<{ forSlug: string; body: string }> = [];

  let i = 0;
  while (i < lines.length) {
    const open = lines[i].match(FENCE_OPEN_RE);
    if (!open) {
      i++;
      continue;
    }
    const lang = open[1].toLowerCase();
    const attrs = parseFenceAttrs(open[2] ?? "");
    i++;
    const bodyLines: string[] = [];
    while (i < lines.length && !/^```\s*$/.test(lines[i])) {
      bodyLines.push(lines[i]);
      i++;
    }
    i++; // closing fence
    const body = bodyLines.join("\n");

    if (lang === "anim") {
      const forSlug = typeof attrs.for === "string" ? attrs.for : "";
      if (forSlug) anims.push({ forSlug, body });
      continue;
    }
    const slug = typeof attrs.id === "string" ? attrs.id : "";
    if (!slug) continue; // unreferenceable entry
    stock.set(slug, {
      slug,
      kind: lang,
      source: body,
      caption: typeof attrs.caption === "string" ? attrs.caption : undefined,
    });
  }

  // Attach companions after all entries are collected, so a script placed
  // before its diagram still binds. First block wins per slug.
  for (const { forSlug, body } of anims) {
    const entry = stock.get(forSlug);
    if (entry && entry.anim === undefined) entry.anim = body;
  }
  return stock;
}
