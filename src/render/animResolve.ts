// Resolves AnimMD binding intents against a rendered Mermaid SVG
// (spec: learnspec/animmd, §The Binding Layer).
//
// Two normative adapter constraints drive every selector here:
//
// 1. Match PATTERNS, never exact rendered ids. Mermaid namespaces its
//    output per render (instance prefix before `-flowchart-`, an internal
//    counter after the node id) — an exact id breaks silently on the next
//    render. A node declared `A` matches `[id*="-flowchart-A-"]`.
// 2. An edge is ONE name, however many elements realise it. Mermaid emits
//    the edge path and its label group with the same prefix-free
//    `data-id` (`L_<src>_<dst>_<n>`); one selector catches both, so
//    hiding an edge hides its label.

import type { AnimIntent, AnimScript } from "../parser/animmd";

export interface ResolvedBinding {
  name: string;
  intent: AnimIntent;
  els: Element[];
}

export type BindingTable = Map<string, ResolvedBinding>;

function cssEscape(s: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(s)
    : s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}

function resolveIntent(scene: SVGSVGElement, intent: AnimIntent): Element[] {
  if (intent.kind === "node") {
    return Array.from(scene.querySelectorAll(`g.node[id*="-flowchart-${cssEscape(intent.value)}-"]`));
  }
  if (intent.kind === "edge") {
    const prefix = `L_${intent.value[0]}_${intent.value[1]}_`;
    return Array.from(scene.querySelectorAll(`[data-id^="${cssEscape(prefix)}"]`));
  }
  // label: text filter — the weakest binding (flowchart labels live in
  // <foreignObject>, so no selector reaches them portably).
  const needle = intent.value;
  return Array.from(scene.querySelectorAll("g.node")).filter((n) =>
    (n.textContent ?? "").includes(needle),
  );
}

/**
 * Resolve every binding of `script` against `scene`. Unresolved names stay
 * in the table with an empty element list — the player skips their
 * directives (fail-well) and `preflight` reports them.
 */
export function resolveBindings(scene: SVGSVGElement, script: AnimScript): BindingTable {
  const table: BindingTable = new Map();
  for (const [name, intent] of script.bind) {
    table.set(name, { name, intent, els: resolveIntent(scene, intent) });
  }
  return table;
}

export function preflight(table: BindingTable): { resolved: number; total: number; missing: string[] } {
  const missing = [...table.values()].filter((b) => b.els.length === 0).map((b) => b.name);
  return { resolved: table.size - missing.length, total: table.size, missing };
}

/**
 * Narrow a bound element set to strokeable paths for the `draw` verb; an
 * element with no drawable path falls back to plain `show` upstream.
 */
export function drawables(els: Element[]): SVGPathElement[] {
  const out: SVGPathElement[] = [];
  for (const el of els) {
    if (el.localName === "path") out.push(el as SVGPathElement);
    else out.push(...Array.from(el.querySelectorAll<SVGPathElement>("path.flowchart-link")));
  }
  return out;
}
