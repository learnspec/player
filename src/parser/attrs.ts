// Parses the `key:value key2:"quoted value" key3:[a,b,c]` attribute syntax
// used on fence opening lines across the suite (FlashMD card attributes,
// NuggetMD's `​```nugget` block, TrackMD's `!import`). Distinct from
// trackmd.ts's own `parseAttributes`, which predates this and doesn't
// support bracket arrays — kept separate to avoid touching working code for
// a feature only FlashMD/NuggetMD need.

export type FenceAttrValue = string | string[];

const ATTR_RE = /(\w+):(?:"([^"]*)"|\[([^\]]*)\]|(\S+))/g;

export function parseFenceAttrs(raw: string): Record<string, FenceAttrValue> {
  const attrs: Record<string, FenceAttrValue> = {};
  for (const match of raw.matchAll(ATTR_RE)) {
    const [, key, quoted, list, bare] = match;
    if (list !== undefined) {
      attrs[key] = list
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    } else {
      attrs[key] = quoted ?? bare ?? "";
    }
  }
  return attrs;
}
