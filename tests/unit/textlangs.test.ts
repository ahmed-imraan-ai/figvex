import { describe, expect, it } from "vitest";
import { isD2 } from "../../src/engines/d2";
import { detectEngine } from "../../src/engines/detect";
import { isNomnoml, renderNomnoml } from "../../src/engines/nomnoml";
import type { RenderOptions } from "../../src/engines/types";
import { textLanguageTemplates } from "../../src/templates/textlangs";

const opts = (dark = false, nomnomlStyle: RenderOptions["nomnomlStyle"] = "default") => ({ dark, nomnomlStyle }) as RenderOptions;

describe("nomnoml", () => {
  it("draws every nomnoml template, in both styles and themes", async () => {
    for (const t of textLanguageTemplates.filter((x) => x.engine === "nomnoml"))
      for (const style of ["default", "plain"] as const)
        for (const dark of [false, true]) {
          const r = await renderNomnoml(t.code, opts(dark, style));
          expect(r.ok, `${t.id} ${r.ok ? "" : r.message}`).toBe(true);
          if (r.ok) expect(r.svg).toContain("<svg");
        }
  });

  it("points at the line of a syntax error, not counting the lines Figvex adds", async () => {
    const r = await renderNomnoml("[A] -> [B]\n[C -> [D]", opts());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.line).toBe(2);
      expect(r.message).toMatch(/^Expected/);
    }
  });
});

describe("D2 and nomnoml detection", () => {
  it("knows the first lines of each", () => {
    expect(isNomnoml("[Customer] -> [Order]")).toBe(true);
    expect(isNomnoml("#direction: right")).toBe(true);
    expect(isNomnoml("# a D2 comment")).toBe(false);
    expect(isD2("a -> b: label")).toBe(true);
    expect(isD2("direction: right")).toBe(true);
    expect(isD2("campus: Campus cloud {")).toBe(true);
    expect(isD2("Jane Smith: Chief Executive")).toBe(false);
    expect(detectEngine("[A]->[B]")).toBe("nomnoml");
    expect(detectEngine("client -> server: request")).toBe("d2");
    expect(detectEngine("flowchart TD\nA --> B")).toBe("mermaid");
    expect(detectEngine("digraph { a -> b }")).toBe("graphviz");
  });
});
