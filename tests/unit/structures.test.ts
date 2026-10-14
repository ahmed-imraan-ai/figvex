import { beforeAll, describe, expect, it } from "vitest";
import { detectEngine } from "../../src/engines/detect";
import type { VizInstance } from "../../src/engines/graphviz";
import { buildBst, hashOf, heapTree, parseStructures, parseTree, splitTop, StructuresError, type TreeNode } from "../../src/engines/structures/model";
import { drawStructures } from "../../src/engines/structures/render";
import { structuresTemplates } from "../../src/templates/structures";

let viz: VizInstance;

beforeAll(async () => {
  // @ts-expect-error: the script ships without type declarations.
  await import("@plantuml/core/viz-global.js");
  viz = await (globalThis as unknown as { Viz: { instance(): Promise<VizInstance> } }).Viz.instance();
});

/** A tree as text again: value(children), with empty slots left empty. */
const show = (t: TreeNode | null): string => (!t ? "" : t.children.length ? `${t.value}(${t.children.map(show).join(", ")})` : t.value);

describe("data structure parsing", () => {
  it("reads every kind, with marks and pointers", () => {
    const doc = parseStructures(`structures
title "Test"
array A = [3, "a b", 4] mark 1 ptr i=0 j=2
matrix M = [[1, 2], [3, 4]]
stack S = [1, 2]
queue Q = []
list L = 1 -> 2 -> null
list D = 1 <-> 2 circular
tree T = 1(2, 3)
`);
    expect(doc.title).toBe("Test");
    const [a, m, s, q, l, d] = doc.structures;
    expect(a.items).toEqual(["3", "a b", "4"]);
    expect([...a.marks]).toEqual(["1"]);
    expect(a.pointers).toEqual([{ name: "i", at: 0 }, { name: "j", at: 2 }]);
    expect(m.rows).toEqual([["1", "2"], ["3", "4"]]);
    expect(s.items).toEqual(["1", "2"]);
    expect(q.items).toEqual([]);
    expect(l).toMatchObject({ items: ["1", "2"], doubly: false, circular: false });
    expect(d).toMatchObject({ items: ["1", "2"], doubly: true, circular: true });
  });

  it("builds trees, BSTs and heaps", () => {
    expect(show(parseTree("8(3(1, 6(4, 7)), 10(, 14(13)))", 1))).toBe("8(3(1, 6(4, 7)), 10(, 14(13)))");
    expect(show(buildBst(["50", "30", "70", "20", "40", "35"]))).toBe("50(30(20, 40(35, )), 70)");
    expect(show(buildBst(["m", "c", "x"]))).toBe("m(c, x)");
    expect(show(heapTree(["9", "5", "8", "1"]))).toBe("9(5(1, ), 8)");
    expect(() => parseTree("1(2, 3", 4)).toThrow(/isn't closed/);
    expect(() => parseTree("1(2, (3))", 4)).toThrow(/follows a value/);
  });

  it("hashes numbers and strings, with chaining and probing", () => {
    expect(hashOf("22", 7)).toBe(1);
    expect(hashOf("-3", 7)).toBe(4);
    expect(hashOf("ab", 10)).toBe((97 + 98) % 10);
    const doc = parseStructures("structures\nhash C size 7 = 10, 22, 31, 4, 15\nhash L size 7 = 10, 22, 31, 4, 15 probe linear\nhash F size 2 = 1, 2, 3 probe linear");
    expect(doc.structures[0].hash!.buckets).toEqual([[], ["22", "15"], [], ["10", "31"], ["4"], [], []]);
    expect(doc.structures[1].hash!.buckets.map((b) => b[0] ?? "")).toEqual(["", "22", "15", "10", "31", "4", ""]);
    expect(doc.warnings).toEqual([{ message: expect.stringMatching(/No free slot for 3/), line: 4 }]);
  });

  it("reads graphs and weights, and splits at top-level commas only", () => {
    const doc = parseStructures("structures\ngraph G = A-B:4, B-C, D\ndigraph H = 1->2, 2->1");
    expect(doc.structures[0].graph).toEqual({ nodes: ["A", "B", "C", "D"], edges: [{ a: "A", b: "B", weight: "4" }, { a: "B", b: "C", weight: undefined }] });
    expect(doc.structures[1].graph!.edges).toHaveLength(2);
    expect(splitTop("[1, 2], 3, '4, 5'")).toEqual(["[1, 2]", "3", "'4, 5'"]);
  });

  it("warns about heaps that aren't heaps and pointers past the end", () => {
    const doc = parseStructures("structures\nheap H = [5, 9, 1, 7]\narray A = [1, 2] ptr k=5");
    expect(doc.warnings.map((w) => w.line)).toEqual([2, 3]);
  });

  it("explains mistakes with their line", () => {
    const err = (src: string) => {
      try {
        parseStructures(src);
      } catch (e) {
        return e as StructuresError;
      }
      throw new Error("no error");
    };
    expect(err("array A = [1]")).toMatchObject({ line: 1 });
    expect(err("structures\nset S = [1]").message).toMatch(/isn't a structure/);
    expect(err("structures\narray A = 1, 2").message).toMatch(/square brackets/);
    expect(err("structures\nhash H = 1, 2").message).toMatch(/Give a hash table a size/);
    expect(err("structures\ngraph G = A->B").message).toMatch(/make it a digraph/);
    expect(err("structures\narray A = [1]\narray A = [2]").message).toMatch(/defined twice/);
  });
});

describe("data structure drawing", () => {
  it("draws every template in both styles, light and dark", () => {
    for (const t of structuresTemplates) {
      const doc = parseStructures(t.code);
      expect(doc.warnings, t.id).toEqual([]);
      for (const style of ["plain", "colour"] as const) {
        const svg = drawStructures(doc, { dark: style === "colour", style }, viz);
        expect(svg.startsWith("<svg"), t.id).toBe(true);
        expect(svg).not.toContain("NaN");
        for (const s of doc.structures) expect(svg).toContain(`data-qualified-name="${s.name}"`);
      }
    }
  });

  it("is picked up from the first line", () => {
    expect(detectEngine("structures\narray A = [1]")).toBe("structures");
  });
});
