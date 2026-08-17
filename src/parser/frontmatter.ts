// Minimal YAML-ish frontmatter parser shared by QuizMD and LearnMD.
//
// This intentionally does NOT implement full YAML. It only supports the
// small subset LearnSpec frontmatter actually uses: flat `key: value` pairs
// with string / number / boolean scalars. Nested maps, lists, and multi-line
// scalars are out of scope for this prototype player. Unknown keys are kept
// as strings on the returned record so callers can pick what they need.

export interface FrontmatterResult {
  /** Parsed key/value pairs (values are string | number | boolean). */
  data: Record<string, string | number | boolean>;
  /** The remaining document body, with the frontmatter block stripped. */
  body: string;
}

const FRONTMATTER_DELIMITER = /^---\s*$/;

function coerceScalar(raw: string): string | number | boolean {
  let value = raw.trim();

  // Strip a single layer of matching quotes.
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  if (value === "true") return true;
  if (value === "false") return false;
  if (value !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return value;
}

/**
 * Splits a document into frontmatter data and body. If the document does
 * not start with a `---` fence, returns an empty data object and the
 * original text unchanged.
 */
export function parseFrontmatter(source: string): FrontmatterResult {
  const lines = source.split(/\r\n|\n/);

  if (lines.length === 0 || !FRONTMATTER_DELIMITER.test(lines[0])) {
    return { data: {}, body: source };
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (FRONTMATTER_DELIMITER.test(lines[i])) {
      endIndex = i;
      break;
    }
  }

  // No closing fence: treat the whole thing as body (malformed frontmatter).
  if (endIndex === -1) {
    return { data: {}, body: source };
  }

  const data: Record<string, string | number | boolean> = {};
  for (const line of lines.slice(1, endIndex)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const match = line.match(/^([^:]+):\s?(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2];
    data[key] = coerceScalar(value);
  }

  const body = lines.slice(endIndex + 1).join("\n");
  return { data, body };
}
