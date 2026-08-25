// AnimMD script parser — the step-reveal animation format of the suite
// (spec: learnspec/animmd). A script narrates an existing vector scene by
// revealing named elements step by step; it never contains a renderer id
// or a coordinate. Grammar is a deliberately closed subset of YAML (three
// binding-intent shapes, scalar keys), so a dedicated parser IS the
// grammar — no YAML library involved.
//
// Failure semantics (normative): a malformed directive line becomes
// caption prose; an unknown verb becomes caption prose; a structurally
// hopeless script yields `script: null` and the caller renders the scene
// statically. Never worse than the static diagram.

export type AnimVerb = "show" | "hide" | "draw" | "focus" | "pulse";

export type AnimIntent =
  | { kind: "node"; value: string }
  | { kind: "edge"; value: [string, string] }
  | { kind: "label"; value: string };

export interface AnimDirective {
  verb: AnimVerb;
  targets: string[];
}

export interface AnimStep {
  title: string;
  directives: AnimDirective[];
  caption: string;
}

export type AnimCaptions = "overlay" | "below";

export interface AnimScript {
  pace: "learner";
  badges: boolean;
  captions: AnimCaptions;
  bind: Map<string, AnimIntent>;
  steps: AnimStep[];
}

export interface AnimParseResult {
  script: AnimScript | null;
  errors: string[];
  warnings: string[];
}

const VERBS = new Set<string>(["show", "hide", "draw", "focus", "pulse"]);

// Author-chosen bind names — narrow so they stay safe inside selectors.
const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const DIRECTIVE_RE = /^(show|hide|draw|focus|pulse)\s*:\s*(\S.*)$/i;

// The three intent shapes, anchored. These regexes are the grammar.
const NODE_INTENT_RE = /^\{\s*node\s*:\s*([A-Za-z][A-Za-z0-9_]*)\s*\}$/;
const EDGE_INTENT_RE =
  /^\{\s*edge\s*:\s*\[\s*([A-Za-z][A-Za-z0-9_]*)\s*,\s*([A-Za-z][A-Za-z0-9_]*)\s*\]\s*\}$/;
const LABEL_INTENT_RE = /^\{\s*label\s*:\s*"((?:\\.|[^"\\])+)"\s*\}$/;

function parseIntent(raw: string): AnimIntent | null {
  const trimmed = raw.trim();
  let m = trimmed.match(NODE_INTENT_RE);
  if (m) return { kind: "node", value: m[1] };
  m = trimmed.match(EDGE_INTENT_RE);
  if (m) return { kind: "edge", value: [m[1], m[2]] };
  m = trimmed.match(LABEL_INTENT_RE);
  if (m) return { kind: "label", value: m[1].replace(/\\"/g, '"') };
  return null;
}

export function parseAnimScript(text: string): AnimParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fail = (msg: string): AnimParseResult => {
    errors.push(msg);
    return { script: null, errors, warnings };
  };

  if (!text || !text.trim()) return fail("empty script");

  const fm = text.match(/^\s*---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
  if (!fm) return fail("missing frontmatter (bind: is required)");

  const script: AnimScript = {
    pace: "learner",
    badges: false,
    captions: "overlay",
    bind: new Map(),
    steps: [],
  };

  // Frontmatter scanner: top-level `key: value` lines plus a `bind:`
  // section whose entries are indented `name: {intent}` lines.
  let inBind = false;
  for (const rawLine of fm[1].split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith("#")) continue;
    const indented = /^\s/.test(rawLine);
    if (inBind && indented) {
      const m = rawLine.trim().match(/^([^:\s]+)\s*:\s*(\S.*)$/);
      if (!m) {
        errors.push(`bind: unreadable line "${rawLine.trim()}"`);
        continue;
      }
      const name = m[1];
      if (!NAME_RE.test(name)) {
        errors.push(`bind "${name}": invalid name`);
        continue;
      }
      const intent = parseIntent(m[2]);
      if (!intent) {
        errors.push(`bind "${name}": unknown shape (${m[2]})`);
        continue;
      }
      script.bind.set(name, intent);
      continue;
    }
    inBind = false;
    const m = rawLine.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) continue; // unknown frontmatter lines are tolerated
    const [, key, value] = m;
    if (key === "bind") {
      inBind = true;
    } else if (key === "pace") {
      if (value.trim() && value.trim() !== "learner") {
        warnings.push(`unknown pace "${value.trim()}" — treated as learner`);
      }
    } else if (key === "badges") {
      script.badges = value.trim() === "true";
    } else if (key === "captions") {
      const v = value.trim();
      if (v === "overlay" || v === "below") script.captions = v;
      else if (v) warnings.push(`unknown captions "${v}" — treated as overlay`);
    }
    // Other keys (for, lang, scene…) tolerated and ignored.
  }

  if (script.bind.size === 0) errors.push("bind: missing or empty");

  const body = text.slice(fm[0].length);
  for (const part of body.split(/^##[ \t]+/m).slice(1)) {
    const lines = part.split(/\r?\n/);
    const title = (lines.shift() ?? "").trim();
    const directives: AnimDirective[] = [];
    let i = 0;
    while (i < lines.length) {
      const stripped = lines[i].trim();
      if (!stripped) {
        i++;
        continue;
      }
      const dm = stripped.match(DIRECTIVE_RE);
      if (!dm || !VERBS.has(dm[1].toLowerCase())) break;
      directives.push({
        verb: dm[1].toLowerCase() as AnimVerb,
        targets: dm[2].split(",").map((t) => t.trim()).filter(Boolean),
      });
      i++;
    }
    script.steps.push({ title, directives, caption: lines.slice(i).join("\n").trim() });
  }

  if (script.steps.length === 0) errors.push("no steps (## …)");

  return {
    script: script.bind.size > 0 || script.steps.length > 0 ? script : null,
    errors,
    warnings,
  };
}

/** True when the parse produced something a player can actually run. */
export function isPlayable(
  result: AnimParseResult,
): result is AnimParseResult & { script: AnimScript } {
  return result.errors.length === 0 && result.script !== null;
}
