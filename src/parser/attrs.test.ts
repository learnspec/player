import { describe, expect, it } from "vitest";
import { parseFenceAttrs } from "./attrs";

describe("parseFenceAttrs", () => {
  it("parses bare, quoted and bracket-array values on one line", () => {
    expect(parseFenceAttrs('id:enumerate tags:[iteration] level:beginner hint:"Think" related:[a,b]')).toEqual({
      id: "enumerate",
      tags: ["iteration"],
      level: "beginner",
      hint: "Think",
      related: ["a", "b"],
    });
  });

  it("trims whitespace inside a bracket array", () => {
    expect(parseFenceAttrs("tags:[a, b ,  c]")).toEqual({ tags: ["a", "b", "c"] });
  });

  it("returns an empty object for an empty or attribute-less string", () => {
    expect(parseFenceAttrs("")).toEqual({});
    expect(parseFenceAttrs("just prose, no attrs")).toEqual({});
  });

  it("drops an empty array item from a trailing comma", () => {
    expect(parseFenceAttrs("tags:[a,b,]")).toEqual({ tags: ["a", "b"] });
  });
});
