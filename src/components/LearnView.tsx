// Renders a parsed LearnMD document: prose segments through the shared
// Markdown component, and special segments (example/summary boxes, inline
// quizzes, diagrams) through their own small renderers.

import { useEffect, useRef, useState } from "preact/hooks";
import type { DiagramKind, LearnDocument, LearnSegment } from "../parser/learnmd";
import { buildKrokiUrl, isKrokiRenderable } from "../render/kroki";
import { Markdown } from "./Markdown";
import { QuizPlayer } from "./QuizPlayer";

interface LearnViewProps {
  doc: LearnDocument;
  /** Override kroki.io instance, from `?kroki=`. */
  krokiBaseUrl?: string;
}

export function LearnView({ doc, krokiBaseUrl }: LearnViewProps) {
  return (
    <article class="learn">
      {(doc.title || doc.description) && (
        <header class="learn-header">
          {doc.title && <h1>{doc.title}</h1>}
          {doc.description && <p class="learn-description">{doc.description}</p>}
        </header>
      )}

      {doc.segments.map((segment, i) => (
        <Segment key={i} segment={segment} krokiBaseUrl={krokiBaseUrl} />
      ))}
    </article>
  );
}

function Segment({ segment, krokiBaseUrl }: { segment: LearnSegment; krokiBaseUrl?: string }) {
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
            quiz={{ title: "", frontmatter: {}, questions: [segment.question] }}
            compact
          />
        </div>
      );
    case "diagram":
      return <Diagram kind={segment.kind} source={segment.source} krokiBaseUrl={krokiBaseUrl} />;
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

function MermaidDiagram({ source }: { source: string }) {
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
