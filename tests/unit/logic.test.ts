import { describe, expect, it } from "vitest";
import { detectEngine } from "../../src/engines/detect";
import { evaluate, parseExpr, write, type Node } from "../../src/engines/logic/expr";
import { minimalCover, primeImplicants, sumOfProducts } from "../../src/engines/logic/minimise";
import { LogicError, parseLogic, valueAt } from "../../src/engines/logic/model";
import { drawLogic, gateCount, toGate } from "../../src/engines/logic/render";
import { logicTemplates } from "../../src/templates/logic";

const truth = (node: Node, vars: string[]) =>
  [...Array(1 << vars.length).keys()].map((m) => {
    const env: Record<string, boolean> = {};
    vars.forEach((v, i) => (env[v] = !!(m & (1 << (vars.length - 1 - i)))));
    return evaluate(node, env) ? 1 : 0;
  });

describe("logic expressions", () => {
  it("reads every way of writing the operators, with the usual precedence", () => {
    const forms = ["A·B + !C", "A.B + ~C", "A*B | ¬C", "A & B || not C", "AB + C'", "A and B or not C", "A ∧ B ∨ ¬C", "(A)(B) + (C)'"];
    const expected = truth(parseExpr("A&B|!C"), ["A", "B", "C"]);
    for (const f of forms) expect(truth(parseExpr(f), ["A", "B", "C"]), f).toEqual(expected);
    // NOT binds tighter than AND, AND tighter than XOR, XOR tighter than OR.
    expect(truth(parseExpr("A + B ^ C D"), ["A", "B", "C", "D"])).toEqual(truth(parseExpr("A + (B ^ (C & D))"), ["A", "B", "C", "D"]));
    expect(truth(parseExpr("A nand B"), ["A", "B"])).toEqual([1, 1, 1, 0]);
    expect(truth(parseExpr("A ↓ B"), ["A", "B"])).toEqual([1, 0, 0, 0]);
    expect(truth(parseExpr("A ⊙ B"), ["A", "B"])).toEqual([1, 0, 0, 1]);
    expect(truth(parseExpr("(A + B)'"), ["A", "B"])).toEqual([1, 0, 0, 0]);
  });

  it("reads digits and declared longer names", () => {
    expect([...truth(parseExpr("x1 x2"), ["x1", "x2"])]).toEqual([0, 0, 0, 1]);
    expect(parseExpr("A Cin", ["Cin"])).toEqual({ k: "and", args: [{ k: "var", name: "A" }, { k: "var", name: "Cin" }] });
    expect(parseExpr("ACin", ["A", "Cin"])).toEqual({ k: "and", args: [{ k: "var", name: "A" }, { k: "var", name: "Cin" }] });
  });

  it("points at the problem", () => {
    expect(() => parseExpr("A + (B")).toThrow(/bracket isn't closed/);
    expect(() => parseExpr("A + B)")).toThrow(/without a \(/);
    expect(() => parseExpr("A + ")).toThrow(/ends too early/);
    expect(() => parseExpr("A $ B")).toThrow(/isn't an operator/);
  });

  it("writes expressions in four notations with only the brackets needed", () => {
    const e = parseExpr("!(A & B) + !A & (B | C) + A ^ B");
    expect(write(e, "logic").text).toBe("¬(A ∧ B) ∨ ¬A ∧ (B ∨ C) ∨ A ⊕ B");
    expect(write(e, "code").text).toBe("!(A && B) || !A && (B || C) || A ^ B");
    expect(write(e, "prime").text).toBe("(AB)' + A'(B + C) + A ⊕ B");
    const bar = write(e, "overbar");
    expect(bar.text).toBe("A·B + A·(B + C) + A ⊕ B");
    expect(bar.bars).toEqual([{ from: 0, to: 3 }, { from: 6, to: 7 }]);
    // NAND and NOR: a bar over the whole term, or ↑ ↓ in logic notation.
    expect(write(parseExpr("A nand B"), "logic").text).toBe("A ↑ B");
    expect(write(parseExpr("A nor B"), "overbar")).toEqual({ text: "A + B", bars: [{ from: 0, to: 5 }] });
    expect(write(parseExpr("A xnor B"), "code").text).toBe("!(A ^ B)");
  });
});

describe("minimisation", () => {
  it("finds prime implicants and a minimal cover", () => {
    // F = Σm(0, 1, 2, 5, 6, 7): the classic case with two minimal answers.
    const cover = minimalCover(3, [0, 1, 2, 5, 6, 7]);
    expect(cover).toHaveLength(3);
    const f = sumOfProducts(cover, ["A", "B", "C"]);
    expect(truth(f, ["A", "B", "C"])).toEqual([1, 1, 1, 0, 0, 1, 1, 1]);
    expect(primeImplicants([0, 1, 2, 3]).map((p) => p.mask)).toEqual([3]);
  });

  it("uses don't cares only when they help", () => {
    // Σm(1, 3, 7, 11, 15) + d(0, 2, 5): CD plus A'D or A'B', both minimal.
    const cover = minimalCover(4, [1, 3, 7, 11, 15], [0, 2, 5]);
    expect(["A'B' + CD", "A'D + CD"]).toContain(write(sumOfProducts(cover, ["A", "B", "C", "D"]), "prime").text);
    const f = truth(sumOfProducts(cover, ["A", "B", "C", "D"]), ["A", "B", "C", "D"]);
    for (const m of [1, 3, 7, 11, 15]) expect(f[m]).toBe(1);
    for (const m of [4, 6, 8, 9, 10, 12, 13, 14]) expect(f[m]).toBe(0);
    // Without the don't cares it needs more.
    expect(minimalCover(4, [1, 3, 7, 11, 15]).length).toBe(2);
    expect(write(sumOfProducts(minimalCover(4, [1, 3, 7, 11, 15]), ["A", "B", "C", "D"]), "prime").text).toBe("CD + A'B'D");
  });

  it("handles always 0 and always 1", () => {
    expect(minimalCover(2, [])).toEqual([]);
    expect(write(sumOfProducts(minimalCover(2, [0, 1, 2, 3]), ["A", "B"]), "prime").text).toBe("1");
  });
});

describe("logic files", () => {
  it("reads functions, settings and minterm forms", () => {
    const doc = parseLogic(`logic
title "Test"
vars A B C
F = AB + C   # comment
G(A, B, C) = m(1, 2) + d(7)
H(A, B) = M(0)
show table kmap
form both
gates iec
compare F G
`);
    expect(doc.title).toBe("Test");
    expect(doc.vars).toEqual(["A", "B", "C"]);
    expect(doc.functions.map((f) => [f.name, f.line, f.ones])).toEqual([
      ["F", 4, [1, 3, 5, 6, 7]],
      ["G", 5, [1, 2]],
      ["H", 6, [1, 2, 3]],
    ]);
    expect(doc.functions[1].dontCares).toEqual([7]);
    expect([...doc.show]).toEqual(["table", "kmap"]);
    expect(doc.form).toBe("both");
    expect(doc.gates).toBe("iec");
    expect(doc.comparisons[0].differ.length).toBeGreaterThan(0);
    // H only uses A and B; in the combined table row 0b010 is A=0, B=1.
    expect(valueAt(doc.functions[2], doc.vars, 0b010)).toBe(1);
  });

  it("orders variables naturally and finds equivalent functions", () => {
    const doc = parseLogic("logic\nF = !(x2 & x10)\nG = !x2 | !x10\ncompare F G");
    expect(doc.vars).toEqual(["x2", "x10"]);
    expect(doc.comparisons[0].differ).toEqual([]);
  });

  it("reports mistakes with their line and column", () => {
    const err = (src: string) => {
      try {
        parseLogic(src);
      } catch (e) {
        return e as LogicError;
      }
      throw new Error("no error");
    };
    expect(err("F = A")).toMatchObject({ line: 1, message: expect.stringMatching(/starts with the word "logic"/) });
    expect(err("logic\nF = A + (B")).toMatchObject({ line: 2, message: expect.stringMatching(/column 11/) });
    expect(err("logic\nF = m(1, 2)").message).toMatch(/Say which variables/);
    expect(err("logic\nF(A, B) = m(4)").message).toMatch(/4 is too big for 2 variables/);
    expect(err("logic\nvars A B\nF = A + C").message).toMatch(/C isn't in the vars line/);
    expect(err("logic\nshow everything\nF = A").message).toMatch(/show takes/);
    expect(err("logic\nF = A\nF = B").message).toMatch(/defined twice/);
    expect(err("logic\nF = A\ncompare F G").message).toMatch(/no function called G/);
  });

  it("warns when a map or table would be too big", () => {
    const doc = parseLogic("logic\nF = A B C D E\nshow table kmap");
    expect(doc.warnings.map((w) => w.message)).toEqual([expect.stringMatching(/Karnaugh maps are drawn for 2 to 4/)]);
    const big = parseLogic("logic\nF = A B C D E G H\nshow table");
    expect(big.warnings[0].message).toMatch(/truth table is drawn for up to 6/);
  });
});

describe("logic drawing", () => {
  it("draws tables, maps, groups and circuits for every template and notation", () => {
    for (const t of logicTemplates) {
      const doc = parseLogic(t.code);
      expect(doc.warnings, t.id).toEqual([]);
      for (const notation of ["overbar", "prime", "logic", "code"] as const) {
        const svg = drawLogic(doc, { dark: notation === "code", notation });
        expect(svg.startsWith("<svg"), t.id).toBe(true);
        expect(svg).not.toContain("NaN");
      }
    }
  });

  it("draws a K-map group that wraps round the corners as four open pieces", () => {
    const doc = parseLogic("logic\nF(A, B, C, D) = m(0, 2, 8, 10)\nshow kmap");
    expect(doc.functions[0].sop).toEqual([{ value: 0, mask: 0b1010 }]);
    const svg = drawLogic(doc, { dark: false, notation: "prime" });
    expect(svg.match(/rx="12"/g)).toHaveLength(4);
    expect(svg).toContain("clip-path");
  });

  it("builds circuits with one gate per operator", () => {
    expect(gateCount(toGate(parseExpr("AB + C'")))).toBe(3);
    const svg = drawLogic(parseLogic("logic\nF = A nand B\nshow circuit"), { dark: false, notation: "overbar" });
    expect(svg).toContain("<circle");
  });

  it("is picked up from the first line", () => {
    expect(detectEngine("logic\nF = A")).toBe("logic");
  });
});
