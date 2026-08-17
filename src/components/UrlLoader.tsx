// Home screen: a URL field plus "try a sample" buttons.

interface UrlLoaderProps {
  onLoad: (url: string) => void;
  onLoadSample: (name: "quiz" | "learn") => void;
  initialUrl?: string;
}

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
        A static, 100% client-side player for <strong>QuizMD</strong> and{" "}
        <strong>LearnMD</strong> — paste a raw file URL and it renders in your browser,
        nothing uploaded anywhere.
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
      </div>
    </div>
  );
}
