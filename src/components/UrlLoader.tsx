// Home screen: a URL field plus "try a sample" buttons.

interface UrlLoaderProps {
  onLoad: (url: string) => void;
  onLoadSample: (name: "quiz" | "learn") => void;
  initialUrl?: string;
}

/**
 * The track demo is several files importing each other, so unlike the
 * single-file demos it can't be inlined at build time — it ships in
 * `public/` and goes through the normal `?url=` path. The URL is made
 * absolute so relative `!import` resolution has a directory to work from.
 */
const TRACK_DEMO_URL = new URL(
  `${import.meta.env.BASE_URL}samples/track-demo/index.track.md`,
  window.location.href,
).toString();

/** Same public/-hosted shape as the track demo: the lesson references its
 *  sibling `stock.diagram.md` (AnimMD companion script), so it needs a real
 *  URL for relative resolution — it can't be inlined at build time. */
const ANIM_DEMO_URL = new URL(
  `${import.meta.env.BASE_URL}samples/anim-demo/water-cycle.learn.md`,
  window.location.href,
).toString();

export function UrlLoader({ onLoad, onLoadSample, initialUrl }: UrlLoaderProps) {
  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const input = form.elements.namedItem("url") as HTMLInputElement;
    if (input.value.trim()) onLoad(input.value.trim());
  };

  return (
    <div class="url-loader">
      <h1>LearnSpec Player</h1>
      <p class="tagline">
        A static, 100% client-side player for <strong>QuizMD</strong>,{" "}
        <strong>LearnMD</strong> and <strong>TrackMD</strong>. Paste a raw file URL and it
        renders in your browser, nothing uploaded anywhere.
      </p>

      <form onSubmit={handleSubmit} class="url-form">
        <input
          type="url"
          name="url"
          placeholder="https://raw.githubusercontent.com/.../lesson.learn.md"
          defaultValue={initialUrl}
          required
        />
        <button type="submit" class="btn btn-primary">
          Load
        </button>
      </form>

      <div class="sample-buttons">
        <span>Try a sample:</span>
        <button type="button" class="btn btn-secondary" onClick={() => onLoadSample("quiz")}>
          QuizMD demo
        </button>
        <button type="button" class="btn btn-secondary" onClick={() => onLoadSample("learn")}>
          LearnMD demo
        </button>
        <button type="button" class="btn btn-secondary" onClick={() => onLoad(TRACK_DEMO_URL)}>
          TrackMD demo
        </button>
        <button type="button" class="btn btn-secondary" onClick={() => onLoad(ANIM_DEMO_URL)}>
          AnimMD demo
        </button>
      </div>
    </div>
  );
}
