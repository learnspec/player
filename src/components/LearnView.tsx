// Renders a parsed LearnMD document: prose segments through the shared
// Markdown component, and special segments (example/summary boxes, inline
// quizzes, diagrams) through their own small renderers.

import { useEffect, useRef, useState } from "preact/hooks";
import { fetchContentCached } from "../lib/contentCache";
import { resolveRelativeUrl } from "../lib/resolve";
import { parseDiagramStock, type DiagramStock } from "../parser/diagrammd";
import type { DiagramKind, LearnDocument, LearnSegment } from "../parser/learnmd";
import { buildKrokiUrl, isKrokiRenderable } from "../render/kroki";
import { AnimPlayer } from "./AnimPlayer";
import { Markdown } from "./Markdown";
import { QuizPlayer } from "./QuizPlayer";

interface LearnViewProps {
  doc: LearnDocument;
  /** Override kroki.io instance, from `?kroki=`. */
  krokiBaseUrl?: string;
  /**
   * URL the document was loaded from. When the document references the
   * diagram stock (```diagram ref:``` / ```anim ref:``` fences), the
   * sibling `stock.diagram.md` is fetched relative to it — the Default
   * Reference Convention of DiagramMD. Absent for inlined demo content.
   */
  sourceUrl?: string;
}

export function LearnView({ doc, krokiBaseUrl, sourceUrl }: LearnViewProps) {
  const needsStock = doc.segments.some((s) => s.type === "diagramref" || s.type === "animref");
  // null = not loaded (yet); refs stay pending rather than flashing broken.
  const [stock, setStock] = useState<DiagramStock | null>(null);

  useEffect(() => {
    if (!needsStock || !sourceUrl) return;
    let cancelled = false;
    const stockUrl = resolveRelativeUrl(sourceUrl, "stock.diagram.md");
    if (!stockUrl) return;
    fetchContentCached(stockUrl)
      .then((text) => {
        if (!cancelled) setStock(parseDiagramStock(text));
      })
      .catch(() => {
        // Best-effort: no sibling stock → refs render their fallback banner.
        if (!cancelled) setStock(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [needsStock, sourceUrl]);

  return (
    <article class="learn">
      {(doc.title || doc.description) && (
        <header class="learn-header">
          {doc.title && <h1>{doc.title}</h1>}
          {doc.description && <p class="learn-description">{doc.description}</p>}
        </header>
      )}

      {doc.segments.map((segment, i) => (
        <Segment key={i} segment={segment} krokiBaseUrl={krokiBaseUrl} stock={stock} />
      ))}
    </article>
  );
}

function Segment({
  segment,
  krokiBaseUrl,
  stock,
}: {
  segment: LearnSegment;
  krokiBaseUrl?: string;
  stock?: DiagramStock | null;
}) {
  switch (segment.type) {
    case "prose":
      return <Markdown markdown={segment.markdown} />;
    case "example":
    case "summary":
      return (
        <aside class={`box box-${segment.type}`}>
          <div class="box-label">{segment.type === "example" ? "Example" : "Summary"}</div>
          <Markdown markdown={segment.markdown} />
        </aside>
      );
    case "quiz":
      return (
        <div class="inline-quiz">
          <QuizPlayer
            quiz={{ title: "", frontmatter: {}, partialScoring: true, questions: [segment.question] }}
            compact
          />
        </div>
      );
    case "diagram":
      return <Diagram kind={segment.kind} source={segment.source} krokiBaseUrl={krokiBaseUrl} />;
    case "diagramref":
    case "animref": {
      if (!stock) return null; // stock still loading (or no source URL) — stay pending
      const entry = stock.get(segment.slug);
      if (!entry) {
        return (
          <div class="unsupported-block">
            <div class="unsupported-banner">
              Reference <code>{segment.slug}</code> not found in <code>stock.diagram.md</code>
            </div>
          </div>
        );
      }
      // AnimMD playback needs a Mermaid scene AND a companion script;
      // anything else degrades to exactly what ```diagram ref:``` renders.
      if (segment.type === "animref" && entry.kind === "mermaid" && entry.anim) {
        return <AnimPlayer entry={entry} />;
      }
      return (
        <Diagram kind={entry.kind as DiagramKind} source={entry.source} krokiBaseUrl={krokiBaseUrl} />
      );
    }
    case "unsupported":
      return (
        <div class="unsupported-block">
          <div class="unsupported-banner">
            Not rendered by this player (<code>```{segment.lang}</code> block)
          </div>
          <pre>
            <code>{segment.source}</code>
          </pre>
        </div>
      );
    default:
      return null;
  }
}

function Diagram({
  kind,
  source,
  krokiBaseUrl,
}: {
  kind: DiagramKind;
  source: string;
  krokiBaseUrl?: string;
}) {
  if (kind === "mermaid") {
    return <MermaidDiagram source={source} />;
  }

  if (isKrokiRenderable(kind)) {
    const url = buildKrokiUrl(kind, source, krokiBaseUrl);
    if (url) {
      return (
        <div class="diagram diagram-kroki">
          <img src={url} loading="lazy" alt={`${kind} diagram`} />
        </div>
      );
    }
  }

  return (
    <div class="unsupported-block">
      <div class="unsupported-banner">
        Not rendered by this player (<code>```{kind}</code> block)
      </div>
      <pre>
        <code>{source}</code>
      </pre>
    </div>
  );
}

let mermaidInitPromise: Promise<typeof import("mermaid")> | null = null;

function loadMermaid() {
  if (!mermaidInitPromise) {
    mermaidInitPromise = import("mermaid").then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default",
      });
      return mod;
    });
  }
  return mermaidInitPromise;
}

export function MermaidDiagram({
  source,
  onRendered,
}: {
  source: string;
  /** Called with the <svg> element once mermaid has rendered it (AnimPlayer). */
  onRendered?: (svg: SVGSVGElement) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let cancelled = false;
    loadMermaid()
      .then(async (mod) => {
        if (cancelled) return;
        const mermaid = mod.default;
        const { svg } = await mermaid.render(idRef.current, source);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          const svgEl = containerRef.current.querySelector("svg");
          if (svgEl && onRendered) onRendered(svgEl as unknown as SVGSVGElement);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  if (error) {
    return (
      <div class="unsupported-block">
        <div class="unsupported-banner">Mermaid diagram failed to render: {error}</div>
        <pre>
          <code>{source}</code>
        </pre>
      </div>
    );
  }

  return <div class="diagram diagram-mermaid" ref={containerRef} />;
}
