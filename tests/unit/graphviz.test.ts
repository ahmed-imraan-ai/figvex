import { beforeAll, describe, expect, it } from "vitest";
import { applyDefaults, defaultAttributes, describeError, openingBrace } from "../../src/engines/graphviz";
import { TEMPLATES } from "../../src/templates";

const light = { dark: false, graphvizStyle: "plain" as const };

describe("openingBrace", () => {
  it("finds the brace that opens the graph", () => {
    const src = "digraph G {\n  a -> b\n}";
    expect(src.slice(0, openingBrace(src))).toBe("digraph G {");
  });

  it("skips braces in comments and quoted or HTML IDs", () => {
    const src = '// {not this}\n/* { nor this } */\n# {preprocessor}\ndigraph "a{b" {\n}';
    expect(src.slice(0, openingBrace(src)).endsWith('"a{b" {')).toBe(true);
    const html = "digraph <x{y> {\n}";
    expect(html.slice(0, openingBrace(html))).toBe("digraph <x{y> {");
  });

  it("returns -1 without a brace", () => {
    expect(openingBrace("digraph G")).toBe(-1);
    expect(openingBrace("/* never closed { ")).toBe(-1);
  });
});

describe("applyDefaults", () => {
  it("adds defaults on the same line so line numbers don't move", () => {
    const src = "digraph G {\n  a -> b\n}";
    const out = applyDefaults(src, light);
    expect(out.split("\n")).toHaveLength(3);
    expect(out.split("\n")[0]).toContain('fontname="Helvetica"');
    expect(out.split("\n")[1]).toBe("  a -> b");
  });

  it("leaves text without a graph alone", () => {
    expect(applyDefaults("hello", light)).toBe("hello");
  });

  it("keeps Graphviz fonts for the default style and lightens ink in dark mode", () => {
    expect(defaultAttributes({ dark: false, graphvizStyle: "default" })).not.toContain("fontname");
    expect(defaultAttributes({ dark: true, graphvizStyle: "default" })).toContain('fontcolor="#ebe9e4"');
    expect(defaultAttributes(light)).toContain('bgcolor="transparent"');
  });
});

describe("describeError", () => {
  const err = (message: string) => [{ level: "error" as const, message }];

  it("reports the line and token of syntax errors", () => {
    expect(describeError(err("syntax error in line 4 near '}'"), "digraph {\n")).toEqual({
      message: 'Unexpected "}".',
      line: 4,
    });
  });

  it("explains -> in an undirected graph and -- in a digraph", () => {
    expect(describeError(err("syntax error in line 1 near '->'"), "graph { a -> b }").message).toContain("digraph");
    expect(describeError(err("syntax error in line 1 near '--'"), "digraph { a -- b }").message).toContain("-> in a digraph");
  });

  it("explains a missing graph keyword and an early end", () => {
    expect(describeError(err("syntax error in line 1 near 'hello'"), "hello").message).toMatch(/^A DOT file starts/);
    expect(describeError(err("syntax error in line 3"), "digraph G {\n a -> b\n").message).toMatch(/missing \}/);
  });

  it("keeps other messages, capitalised", () => {
    expect(describeError(err("something odd"), "digraph {}")).toEqual({ message: "Something odd" });
  });
});

// The real Graphviz build that ships with @plantuml/core, run in Node.
interface Viz {
  render(src: string, options: { format: string }): { status: string; output?: string; errors: { message: string }[] };
}
let viz: Viz;

beforeAll(async () => {
  // The package is "type": "module", so the UMD script loads as ESM and
  // falls back to defining globalThis.Viz. It needs a document (happy-dom)
  // to work out its own URL.
  // @ts-expect-error: the script ships without type declarations.
  await import("@plantuml/core/viz-global.js");
  viz = await (globalThis as unknown as { Viz: { instance(): Promise<Viz> } }).Viz.instance();
});

describe("Graphviz templates", () => {
  const templates = TEMPLATES.filter((t) => t.engine === "graphviz");

  it("exist", () => {
    expect(templates.length).toBeGreaterThan(3);
  });

  it.each(templates.map((t) => [t.id, t] as const))("%s renders without errors or warnings", (_id, t) => {
    for (const dark of [false, true]) {
      const result = viz.render(applyDefaults(t.code, { dark, graphvizStyle: "plain" }), { format: "svg" });
      expect(result.status, JSON.stringify(result.errors)).toBe("success");
      expect(result.errors).toEqual([]);
      expect(result.output).toContain("<svg");
    }
  });
});
