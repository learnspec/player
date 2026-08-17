# LearnSpec Player

Static, 100% client-side player for LearnSpec formats (QuizMD, LearnMD).

Paste a raw file URL and it renders in your browser — nothing is uploaded
anywhere, there is no backend. The whole app is a static bundle you can host
on any static file server or CDN.

## Usage

Open the app and either:

- paste a URL to a `.quiz.md` or `.learn.md` file, or
- click one of the "try a sample" buttons, or
- load a file directly via a query string: `?url=<url-encoded file URL>`

`?url=` accepts:

- a direct raw file URL (e.g. `https://raw.githubusercontent.com/...`)
- a `github.com/.../blob/...` page URL (automatically rewritten to the raw
  URL, with a [jsDelivr](https://www.jsdelivr.com/) CDN fallback)
- a `gist.github.com/...` page URL (resolved through the GitHub Gist API)
- any other URL that serves the file directly with permissive CORS headers

If a URL doesn't end in `.quiz.md` or `.learn.md`, the format is guessed
from the content: a `## ` question section containing a `- [ ]` / `- [x]`
checkbox choice is treated as QuizMD, otherwise the file is treated as
LearnMD.

Fetch errors (CORS, 404, GitHub rate-limiting, ...) are shown with a retry
button and, for GitHub URLs, a suggestion to try the jsDelivr mirror
(`https://cdn.jsdelivr.net/gh/OWNER/REPO@REF/PATH`) directly.

## Supported blocks vs. graceful degradation

| Block | Behavior |
| --- | --- |
| Frontmatter (`title`, `description`, `math`, `partial_scoring`, ...) | Parsed (flat `key: value` pairs only, unknown keys ignored) |
| `- [ ]` / `- [x]` choices | Rendered as mcq/multi choice, graded client-side |
| Exactly two `True` / `False` choices | Inferred as `tf`, rendered like an mcq |
| `___` blank(s) + `**Answer:** value \| value2` | Rendered as one open-answer input per blank, matched case/diacritic-insensitively, each blank graded independently |
| 2-column Markdown table + `type: match` | Rendered as a `<select>` per row; partial-scored (correct pairs / total pairs) |
| Numbered list (write order = correct order) + `type: order` | Rendered as a reorderable list (up/down buttons); partial-scored via Kendall's tau |
| `  > text` (indented under a choice) | Rendered as per-choice feedback, shown only if that choice was selected |
| `> [!correct]` / `> [!incorrect]` | Rendered as feedback shown only on a correct / incorrect answer |
| `> ...` trailing blockquote | Rendered as the post-answer explanation |
| ` ```quiz ` config fence (`id`, `type`, `points`, `hint`) | Parsed and shown on the question card |
| `> [!note]` / `[!tip]` / `[!warning]` / `[!important]` | Rendered as styled callout boxes |
| ` ```example ` / ` ```summary ` fences | Rendered as styled boxes (content is Markdown) |
| ` ```quiz ` fence in LearnMD | Rendered as an inline interactive mini-quiz |
| `$...$` / `$$...$$` | Rendered with [KaTeX](https://katex.org/) (loaded on demand) |
| ` ```mermaid ` | Rendered with the [mermaid](https://mermaid.js.org/) library (loaded on demand) |
| ` ```graphviz ` / ` ```plantuml ` / ` ```d2 ` | Rendered as an `<img>` via [kroki.io](https://kroki.io) |
| ` ```tikz ` / ` ```latex ` | **Degrades** — the public kroki.io TikZ endpoint is currently unreliable, and kroki.io has no generic LaTeX diagram type |
| ` ```d3 `, ` ```geomap `, ` ```chess `, ` ```vega-lite `, ` ```svg `, ` ```abc `, `diagram ref:` | **Degrades** — shown as a labeled, unrendered source block |
| Any other fenced code block | Rendered as a plain Markdown code block (no special handling) |

"Degrades" means the block is never silently dropped: it's shown as its raw
source in a code block with a "not rendered by this player" banner.

## kroki.io

Diagram rendering for Graphviz, PlantUML, and D2 goes through the
public [kroki.io](https://kroki.io) service — a third-party dependency, not
something this project hosts. The diagram source is compressed
(deflate, raw) and base64url-encoded into the image URL; nothing is sent as
a POST body or stored server-side by this app.

If you run your own kroki instance (or want to avoid the public one),
override it with the `?kroki=` query parameter:

```
?kroki=https://kroki.example.com
```

## Development

```bash
npm install
npm run dev       # start the dev server
npm run test      # run the vitest suite (parser + URL-resolution logic)
npx tsc --noEmit  # typecheck
npm run build     # production build into dist/
npm run preview   # preview the production build locally
```

To build for deployment under a sub-path (e.g. `/play/`):

```bash
npm run build -- --base=/play/
```

## Deployment

The build output is a folder of static files — no server, no backend. It can be
hosted anywhere that serves files.

learnspec.org publishes it at `learnspec.org/play/`: the site's own GitHub Pages
workflow checks this repository out, builds it with `--base=/play/`, and copies
`dist/` into the site artifact before publishing. This repository therefore has
no deploy workflow of its own — only CI (typecheck, tests, and a `/play/` build
so a base-path regression is caught here rather than on the site).

## Project layout

```
src/
  parser/quizmd.ts      # QuizMD parser (pure, no DOM) + types
  parser/learnmd.ts      # LearnMD segmenter (prose | quiz | example | summary | diagram | unsupported)
  parser/frontmatter.ts  # shared minimal frontmatter parser
  render/markdown.ts     # marked + DOMPurify + KaTeX + callout styling
  render/kroki.ts         # kroki.io payload encoding
  components/             # Preact components (QuizPlayer, LearnView, UrlLoader, ...)
  lib/resolve.ts           # URL rewriting (GitHub blob/raw, Gist, jsDelivr fallback)
samples/                   # demo .quiz.md / .learn.md files used by "try a sample"
```

## License

MIT — see [LICENSE](./LICENSE).
