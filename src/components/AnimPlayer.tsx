// AnimMD step-reveal player (spec: learnspec/animmd) over a Mermaid scene
// from the diagram stock.
//
// Playback model (normative): `show`/`hide`/`draw` are cumulative,
// `focus`/`pulse` momentary. The state of step n is recomputed by replaying
// steps 0..n — forward, backward and jumps all take the same code path, so
// there is no incremental state to corrupt. Elements no binding names are
// background: always visible, dimmed under focus.
//
// Degradation is literal: an unparseable script, or a script none of whose
// bindings resolve against the rendered SVG, renders exactly the static
// diagram the stock entry would render anyway.

import { useRef, useState } from "preact/hooks";
import { isPlayable, parseAnimScript, type AnimScript } from "../parser/animmd";
import type { DiagramStockEntry } from "../parser/diagrammd";
import { drawables, preflight, resolveBindings, type BindingTable } from "../render/animResolve";
import { MermaidDiagram } from "./LearnView";

/** Escape-then-emphasise: captions come from user-editable files. */
function captionHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
}

function setDraw(paths: SVGPathElement[], animate: boolean): void {
  for (const p of paths) {
    let len = 0;
    try {
      len = typeof p.getTotalLength === "function" ? p.getTotalLength() : 0;
    } catch {
      len = 0;
    }
    if (!len) continue;
    p.style.strokeDasharray = `${len} ${len}`;
    if (animate) {
      p.style.transition = "none";
      p.style.strokeDashoffset = String(len);
      p.getBoundingClientRect(); // forced reflow — the transition must restart
      p.style.transition = "stroke-dashoffset 900ms cubic-bezier(.4,0,.2,1)";
      p.style.strokeDashoffset = "0";
    } else {
      p.style.transition = "none";
      p.style.strokeDashoffset = "0";
    }
  }
}

function applyStep(
  svg: SVGSVGElement,
  script: AnimScript,
  table: BindingTable,
  n: number,
  animate: boolean,
  reduced: boolean,
): void {
  // 1. Reset: every bound element hidden, momentary classes cleared.
  for (const b of table.values()) {
    for (const el of b.els) {
      el.classList.add("am-target", "am-hidden");
      el.classList.remove("am-focused", "am-pulse");
    }
  }
  svg.classList.remove("has-focus");

  // 2. Cumulative verbs: replay steps 0..n.
  const drawn: Array<{ els: Element[]; step: number }> = [];
  for (let s = 0; s <= n && s < script.steps.length; s++) {
    for (const d of script.steps[s].directives) {
      for (const name of d.targets) {
        const b = table.get(name);
        if (!b || b.els.length === 0) continue; // unknown/unresolved → skip
        if (d.verb === "show" || d.verb === "draw") {
          b.els.forEach((el) => el.classList.remove("am-hidden"));
        }
        if (d.verb === "hide") b.els.forEach((el) => el.classList.add("am-hidden"));
        if (d.verb === "draw") drawn.push({ els: b.els, step: s });
      }
    }
  }

  // 3. Momentary verbs: current step only.
  const cur = script.steps[n];
  if (cur) {
    for (const d of cur.directives) {
      if (d.verb === "focus") {
        svg.classList.add("has-focus");
        for (const name of d.targets) {
          table.get(name)?.els.forEach((el) => el.classList.add("am-focused"));
        }
      }
      if (d.verb === "pulse" && !reduced) {
        for (const name of d.targets) {
          table.get(name)?.els.forEach((el) => {
            el.classList.remove("am-pulse");
            (el as SVGGraphicsElement).getBoundingClientRect();
            el.classList.add("am-pulse");
          });
        }
      }
    }
  }

  // 4. `draw` animates only on the step that owns it.
  for (const d of drawn) setDraw(drawables(d.els), animate && !reduced && d.step === n);
}

export function AnimPlayer({ entry }: { entry: DiagramStockEntry }) {
  const parsed = parseAnimScript(entry.anim ?? "");
  if (!isPlayable(parsed)) {
    // Unparseable script → exactly the static diagram.
    return <MermaidDiagram source={entry.source} />;
  }
  return <WiredPlayer entry={entry} script={parsed.script} />;
}

function WiredPlayer({ entry, script }: { entry: DiagramStockEntry; script: AnimScript }) {
  const [step, setStep] = useState(0);
  const [degraded, setDegraded] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const tableRef = useRef<BindingTable | null>(null);
  // Authoritative index for gesture handlers: under background-tab timer
  // throttling, re-renders (and thus the `step` in this closure) can lag
  // several gestures behind — a rapid double-tap must not replay from a
  // stale index.
  const stepRef = useRef(0);
  const reduced =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const total = script.steps.length;

  const onRendered = (svg: SVGSVGElement) => {
    svgRef.current = svg;
    const table = resolveBindings(svg, script);
    const pf = preflight(table);
    if (pf.missing.length > 0) {
      console.warn(`[anim] ${pf.missing.length}/${pf.total} binding(s) unresolved: ${pf.missing.join(", ")}`);
    }
    if (pf.resolved === 0) {
      // Nothing to animate → static scene, no chrome.
      setDegraded(true);
      return;
    }
    tableRef.current = table;
    applyStep(svg, script, table, 0, false, reduced);
    setStep(0);
  };

  // The scene mutation happens SYNCHRONOUSLY in the gesture handler, not
  // in an effect keyed on `step`: the SVG and the binding table are refs
  // (they never re-render), and effect scheduling is deferred — under a
  // background tab's timer throttling it can lag by seconds, leaving the
  // scene on a stale step while the counter has already moved. The state
  // update only drives the caption chrome.
  const go = (n: number, animate: boolean) => {
    const clamped = Math.max(0, Math.min(total - 1, n));
    stepRef.current = clamped;
    if (svgRef.current && tableRef.current) {
      applyStep(svgRef.current, script, tableRef.current, clamped, animate, reduced);
    }
    setStep(clamped);
  };

  const onStageClick = (e: MouseEvent) => {
    if (degraded) return;
    const stage = e.currentTarget as HTMLElement;
    const rect = stage.getBoundingClientRect();
    if (e.clientX - rect.left < rect.width * 0.25) go(stepRef.current - 1, false);
    else go(stepRef.current + 1, true);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (degraded) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
      e.preventDefault();
      go(stepRef.current + 1, true);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      go(stepRef.current - 1, false);
    } else if (e.key === "Home") {
      e.preventDefault();
      go(0, false);
    } else if (e.key === "End") {
      e.preventDefault();
      go(total - 1, false);
    }
  };

  const current = script.steps[step];

  return (
    <figure
      class={`anim-player${script.captions === "overlay" ? " anim-player-overlay" : ""}${degraded ? " anim-player-degraded" : ""}`}
      role="group"
      aria-label="Step-by-step animated diagram"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div class="anim-stage" onClick={onStageClick}>
        <MermaidDiagram source={entry.source} onRendered={onRendered} />
      </div>
      {!degraded && (
        <figcaption class="anim-caption">
          <div class="anim-caption-header">
            <span class="anim-counter">
              {step + 1} / {total}
            </span>
            <span class="anim-step-title">{current?.title ?? ""}</span>
            <span class="anim-controls">
              <button
                type="button"
                class="anim-btn"
                aria-label="Previous step"
                title="Previous step"
                disabled={step === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  go(stepRef.current - 1, false);
                }}
              >
                ‹
              </button>
              <button
                type="button"
                class="anim-btn"
                aria-label="Next step"
                title="Next step"
                disabled={step >= total - 1}
                onClick={(e) => {
                  e.stopPropagation();
                  go(stepRef.current + 1, true);
                }}
              >
                ›
              </button>
              <button
                type="button"
                class="anim-btn"
                aria-label="Restart from the first step"
                title="Restart from the first step"
                onClick={(e) => {
                  e.stopPropagation();
                  go(0, false);
                }}
              >
                ↺
              </button>
            </span>
          </div>
          <div
            class="anim-caption-text"
            aria-live="polite"
            dangerouslySetInnerHTML={{ __html: captionHtml(current?.caption ?? "") }}
          />
        </figcaption>
      )}
    </figure>
  );
}
