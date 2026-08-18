# LearnSpec Player

Static, 100% client-side player for LearnSpec formats (QuizMD, LearnMD,
TrackMD, FlashMD, NuggetMD).

Paste a raw file URL and it renders in your browser — nothing is uploaded
anywhere, there is no backend. The whole app is a static bundle you can host
on any static file server or CDN.

## Usage

Open the app and either:

- paste a URL to a `.quiz.md`, `.learn.md`, `.track.md`, `.flash.md` or `.nugget.md` file, or
- click one of the "try a sample" buttons, or
- load a file directly via a query string: `?url=<url-encoded file URL>`

`?url=` accepts:

- a direct raw file URL (e.g. `https://raw.githubusercontent.com/...`)
- a `github.com/.../blob/...` page URL (automatically rewritten to the raw
  URL, with a [jsDelivr](https://www.jsdelivr.com/) CDN fallback)
- a `gist.github.com/...` page URL (resolved through the GitHub Gist API)
- any other URL that serves the file directly with permissive CORS headers

If a URL doesn't end in `.quiz.md`, `.learn.md`, `.track.md`, `.flash.md` or
`.nugget.md`, the format is guessed from the content: a file containing
`!import` directives is treated as TrackMD; a `## ` question section
containing a `- [ ]` / `- [x]` checkbox choice is treated as QuizMD;
otherwise the file is treated as LearnMD. FlashMD and NuggetMD are only
detected by extension — their fenced-block syntax is closer to LearnMD's
than QuizMD's, so a content sniff would be unreliable.

Fetch errors (CORS, 404, GitHub rate-limiting, ...) are shown with a retry
button and, for GitHub URLs, a suggestion to try the jsDelivr mirror
(`https://cdn.jsdelivr.net/gh/OWNER/REPO@REF/PATH`) directly.

## Tracks

A `.track.md` file renders as a clickable table of contents: sections, steps,
and `!checkpoint` milestones. Each step is labelled with the title the imported
file declares for itself (frontmatter `title`, else its first `# H1`), fetched
in the background — the list renders immediately with a label derived from the
filename, and each one is replaced as its file arrives. A step whose file can't
be read keeps the filename label.

That costs one request per step, so those requests double as a prefetch: every
file goes through a shared cache, and opening a step afterwards is served from
memory with no network at all. On a 37-step track that is 37 requests totalling
about 157 KB — roughly the size of the player's own main JS chunk — after which
every step opens instantly. Opening a step resolves its `!import ./path`
relative to the URL the track was loaded from, so a whole multi-file path
plays straight from a raw GitHub folder — no backend, no account, no upload.

Steps of type `.learn.md` and `.quiz.md` open in the full lesson and quiz
views. `.flash.md`, `.nugget.md` and anything else open in a plain reading
view with a banner saying so: scheduling, review queues and cross-step
progress are *player* features, not format features, and this player
deliberately implements none of them. Nothing is persisted between steps.

Relative imports need a URL with a directory to resolve against. A raw or
`blob` GitHub URL works; a Gist does not, so a track loaded from a Gist
renders as a read-only syllabus.

## Flashcards and nuggets

`.flash.md` opens as a one-card-at-a-time review: front, then back on tap
(or Enter/Space), Previous/Next, an optional per-card hint. A card with
multiple front variants (`===`-separated) rotates through them round-robin
across the deck rather than always showing the first — the deck-wide
approximation of the spec's "coverage over time" without any persistence
between sessions. There is no spaced-repetition scheduling: this is a
straight pass through the deck as authored, not FSRS.

`.nugget.md` opens as an expandable list, one entry per `## ` heading. The
first nugget starts open, the rest collapsed. Concept and Why it matters
render as written; when the third `### ` section parses as a question (a
line of prose followed by `- [ ]` / `- [x]` choices — the spec's `?` marker
is recognised but not required, the same leniency LearnMD's own inline
quizzes already get) it renders as an interactive recall check, reusing the
QuizMD question component; otherwise the section still renders as plain
text rather than disappearing. A fourth or later `### ` section, which the
spec gives no role, renders after the rest.

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
| `> [!note]` / `[!tip]` / `[!warning]` / `[!important]` / `[!caution]` / `[!summary]` / `[!example]` / `[!objectives]` | Rendered as styled callout boxes |
| Any other `> [!type]` marker | Rendered as a neutral callout labelled with the type name — the marker is never left as literal text, but no semantic is invented for a type the spec doesn't define |
| `!import` / `!ref` / `!checkpoint` in TrackMD | Parsed into steps, context references and milestones (`optional:true` and `passing_score:` attributes included) |
| `!import` in LearnMD | **Not implemented** — LearnMD-level composition is ignored, so a lesson assembled from other files renders without them |
| ` ```example ` / ` ```summary ` fences | Rendered as styled boxes (content is Markdown) |
| ` ```quiz ` fence in LearnMD | Rendered as an inline interactive mini-quiz |
| `$...$` / `$$...$$` | Rendered with [KaTeX](https://katex.org/) (loaded on demand) |
| ` ```mermaid ` | Rendered with the [mermaid](https://mermaid.js.org/) library (loaded on demand) |
| ` ```graphviz ` / ` ```plantuml ` / ` ```d2 ` | Rendered as an `<img>` via [kroki.io](https://kroki.io) |
| ` ```tikz ` | Rendered via kroki.io. A bare `\begin{tikzpicture}` snippet is wrapped in a `standalone` document first — kroki.io's TikZ backend compiles a whole LaTeX document and rejects a bare snippet |
| ` ```vega-lite ` | Rendered as a static chart via kroki.io (server-rendered SVG, so no tooltips or interaction) |
| ` ```latex ` | **Degrades** — kroki.io has no generic LaTeX diagram type |
| ` ```d3 `, ` ```geomap `, ` ```chess `, ` ```svg `, ` ```abc `, `diagram ref:` | **Degrades** — shown as a labeled, unrendered source block |
| Any other fenced code block | Rendered as a plain Markdown code block (no special handling) |

"Degrades" means the block is never silently dropped: it's shown as its raw
source in a code block with a "not rendered by this player" banner.

## kroki.io

Diagram rendering for Graphviz, PlantUML, D2, TikZ and Vega-Lite goes through the
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
  parser/trackmd.ts       # TrackMD parser (sections, !import/!ref/!checkpoint)
  parser/flashmd.ts        # FlashMD parser (cards, front variants, lesson refs)
  parser/nuggetmd.ts       # NuggetMD parser (positional ###, Check reuses quizmd.ts)
  parser/attrs.ts          # shared `key:value key2:[a,b]` fence-attribute parser
  lib/resolve.ts           # URL rewriting (GitHub blob/raw, Gist, jsDelivr) + relative imports
  lib/contentCache.ts      # dedupes fetches shared by the title pass and step navigation
samples/                   # demo .quiz.md / .learn.md files inlined into the bundle
public/samples/track-demo/ # multi-file TrackMD demo, served as static files
```

## License

MIT — see [LICENSE](./LICENSE).
