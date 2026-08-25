// @vitest-environment jsdom
// Instance-id regression cases: Mermaid element ids carry a per-render
// instance prefix and an unguessable counter — bindings must resolve by
// pattern in ANY namespace, never by exact rendered id.
import { describe, expect, it } from "vitest";
import { parseAnimScript } from "../parser/animmd";
import { drawables, preflight, resolveBindings } from "./animResolve";

// Minimal SVG mimicking the shapes Mermaid emits: namespaced node ids,
// prefix-free data-id shared by the edge path and its label group.
function scene(prefix: string): SVGSVGElement {
  document.body.innerHTML = `
    <svg id="${prefix}">
      <g class="edgePaths">
        <path class="flowchart-link" data-id="L_O_V_0" d="M0 0 L10 10"/>
      </g>
      <g class="edgeLabels">
        <g class="label" data-id="L_O_V_0"><text>Evaporation</text></g>
      </g>
      <g class="nodes">
        <g class="node default" id="${prefix}-flowchart-O-0"><text>Oceans</text></g>
        <g class="node default" id="${prefix}-flowchart-V-3"><text>Water vapour</text></g>
      </g>
    </svg>`;
  return document.querySelector("svg") as unknown as SVGSVGElement;
}

const SCRIPT = parseAnimScript(`---
bind:
  oceans: {node: O}
  vapour: {node: V}
  evaporation: {edge: [O, V]}
  caption: {label: "vapour"}
---

## S
show: oceans, vapour
draw: evaporation
`).script!;

describe("resolveBindings", () => {
  for (const prefix of ["container", "mermaid-8f3a1c9e"]) {
    it(`resolves all bindings under the "${prefix}" namespace`, () => {
      const table = resolveBindings(scene(prefix), SCRIPT);
      expect(preflight(table).missing).toEqual([]);
      expect(table.get("oceans")!.els).toHaveLength(1);
      // An edge is one name, two elements: the path AND its label group.
      expect(table.get("evaporation")!.els).toHaveLength(2);
      expect(table.get("caption")!.els).toHaveLength(1);
    });
  }

  it("reports unresolved names without failing the rest", () => {
    const script = parseAnimScript(
      "---\nbind:\n  ghost: {node: Z}\n  real: {node: O}\n---\n\n## S\nshow: ghost, real\n",
    ).script!;
    const pf = preflight(resolveBindings(scene("container"), script));
    expect(pf).toEqual({ resolved: 1, total: 2, missing: ["ghost"] });
  });

  it("narrows edge elements to strokeable paths for draw", () => {
    const table = resolveBindings(scene("container"), SCRIPT);
    const paths = drawables(table.get("evaporation")!.els);
    expect(paths).toHaveLength(1);
    expect(paths[0].localName).toBe("path");
  });
});
