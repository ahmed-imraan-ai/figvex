// The logic language: one boolean function per line, and a few settings.
//
//   logic
//   title "Full adder"
//   vars A B Cin
//   S = A ^ B ^ Cin
//   Cout = AB + Cin(A ^ B)
//   F(A, B, C, D) = m(0, 2, 5, 7) + d(8, 10)
//   show table kmap simplified circuit
//   compare S Cout

import { minimalCover, productOfSums, sumOfProducts, type Implicant } from "./minimise";
import { evaluate, ExprError, parseExpr, variables, type Node } from "./expr";

export type Section = "table" | "kmap" | "simplified" | "circuit" | "minterms";

export const SECTIONS: Section[] = ["table", "kmap", "simplified", "circuit", "minterms"];

export interface LogicFunction {
  name: string;
  line: number;
  vars: string[];
  /** The expression as written; absent for m(...) and M(...) forms. */
  expr?: Node;
  ones: number[];
  dontCares: number[];
  sop: Implicant[];
  /** Implicants of the zeros, for the product of sums. */
  pos: Implicant[];
}

export interface Comparison {
  a: LogicFunction;
  b: LogicFunction;
  line: number;
  /** Combined-table rows where they differ. */
  differ: number[];
}

export interface LogicWarning {
  message: string;
  line: number;
}

export interface LogicDoc {
  title?: string;
  /** Variables of the combined truth table, first is the most significant. */
  vars: string[];
  show: Set<Section>;
  form: "sop" | "pos" | "both";
  gates: "ansi" | "iec";
  circuit: "written" | "simplified";
  functions: LogicFunction[];
  comparisons: Comparison[];
  warnings: LogicWarning[];
}

export class LogicError extends Error {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(message);
  }
}

export const MAX_VARS = 10;
export const MAX_TABLE_VARS = 6;
export const MAX_KMAP_VARS = 4;

/** Natural order: A, B, C, ..., X1, X2, X10. */
export const byName = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }) || (a < b ? -1 : a > b ? 1 : 0);

const numbers = (text: string, line: number): number[] => {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  return parts.map((p) => {
    if (!/^\d+$/.test(p)) throw new LogicError(`"${p}" isn't a minterm number.`, line);
    return Number(p);
  });
};

/** The value of f for one row of a table over `vars`: 1, 0 or "x" (don't care). */
export function valueAt(f: LogicFunction, vars: string[], row: number): 0 | 1 | "x" {
  let m = 0;
  for (const v of f.vars) {
    const i = vars.indexOf(v);
    m = (m << 1) | (i >= 0 && row & (1 << (vars.length - 1 - i)) ? 1 : 0);
  }
  return f.ones.includes(m) ? 1 : f.dontCares.includes(m) ? "x" : 0;
}

export function parseLogic(src: string): LogicDoc {
  const lines = src.split(/\r?\n/);
  const doc: LogicDoc = {
    vars: [],
    show: new Set(["table", "kmap", "simplified"]),
    form: "sop",
    gates: "ansi",
    circuit: "written",
    functions: [],
    comparisons: [],
    warnings: [],
  };
  let declared: string[] | undefined;
  let header = false;
  const pending: { line: number; name: string; vars?: string[]; rhs: string; rhsAt: number }[] = [];
  const compares: { a: string; b: string; line: number }[] = [];

  lines.forEach((raw, k) => {
    const line = k + 1;
    const text = raw.replace(/\s(#|\/\/).*$/, "").replace(/^\s*(#|\/\/).*$/, "").trim();
    if (!text) return;
    if (!header) {
      if (text !== "logic") throw new LogicError('A logic diagram starts with the word "logic" on the first line.', line);
      header = true;
      return;
    }
    const setting = text.match(/^(title|vars|show|form|gates|circuit|compare)\b\s*(.*)$/);
    if (setting) {
      const [, key, rest] = setting;
      if (key === "title") doc.title = rest.replace(/^"(.*)"$/, "$1") || undefined;
      else if (key === "vars") {
        declared = rest.split(/[\s,]+/).filter(Boolean);
        const bad = declared.find((v) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(v) || /^(and|or|not|xor|xnor|nand|nor)$/i.test(v));
        if (bad) throw new LogicError(`"${bad}" can't be a variable name.`, line);
      } else if (key === "show") {
        const words = rest.split(/[\s,]+/).filter(Boolean);
        const bad = words.find((w) => w !== "all" && !SECTIONS.includes(w as Section));
        if (bad) throw new LogicError(`show takes ${SECTIONS.join(", ")} or all, not "${bad}".`, line);
        doc.show = new Set(words.includes("all") ? SECTIONS : (words as Section[]));
      } else if (key === "form") {
        if (!["sop", "pos", "both"].includes(rest)) throw new LogicError("form is sop (sum of products), pos (product of sums) or both.", line);
        doc.form = rest as LogicDoc["form"];
      } else if (key === "gates") {
        if (!["ansi", "iec"].includes(rest)) throw new LogicError("gates is ansi (curved shapes) or iec (boxes).", line);
        doc.gates = rest as LogicDoc["gates"];
      } else if (key === "circuit") {
        if (!["written", "simplified"].includes(rest)) throw new LogicError("circuit is written (as you wrote it) or simplified.", line);
        doc.circuit = rest as LogicDoc["circuit"];
      } else {
        const names = rest.split(/[\s,=]+/).filter(Boolean);
        if (names.length !== 2) throw new LogicError("compare takes two function names: compare F G", line);
        compares.push({ a: names[0], b: names[1], line });
      }
      return;
    }
    const fn = text.match(/^([A-Za-z][\w]*)\s*(?:\(([^)]*)\))?\s*=\s*(.*)$/);
    if (!fn) throw new LogicError('Write a function as Name = expression, for example F = A·B + C.', line);
    const rhsAt = raw.indexOf("=") + 1;
    pending.push({ line, name: fn[1], vars: fn[2]?.split(/[\s,]+/).filter(Boolean), rhs: fn[3].trim(), rhsAt: rhsAt + (raw.slice(rhsAt).length - raw.slice(rhsAt).trimStart().length) });
  });
  if (!header) throw new LogicError('A logic diagram starts with the word "logic" on the first line.');
  if (!pending.length) throw new LogicError("Add a function, for example: F = A·B + C", lines.length);

  for (const p of pending) {
    if (doc.functions.some((f) => f.name === p.name)) throw new LogicError(`${p.name} is defined twice.`, p.line);
    let expr: Node | undefined;
    let ones: number[] = [];
    let dontCares: number[] = [];
    let vars = p.vars ?? declared;
    const terms = p.rhs.match(/^(sum|Σm|Σ|m|prod|ΠM|Π|M)\s*\(([^)]*)\)\s*(?:[+,·*]\s*(?:d|dc)\s*\(([^)]*)\))?\s*$/);
    if (terms) {
      if (!vars) throw new LogicError(`Say which variables ${p.name} uses: ${p.name}(A, B, C) = ${p.rhs}, or add a vars line.`, p.line);
      const n = vars.length;
      const listed = numbers(terms[2], p.line);
      dontCares = terms[3] ? numbers(terms[3], p.line) : [];
      const tooBig = [...listed, ...dontCares].find((m) => m >= 1 << n);
      if (tooBig !== undefined) throw new LogicError(`${tooBig} is too big for ${n} variable${n === 1 ? "" : "s"}; the largest is ${(1 << n) - 1}.`, p.line);
      const maxterms = /^(prod|ΠM|Π|M)$/.test(terms[1]);
      ones = maxterms ? [...Array(1 << n).keys()].filter((m) => !listed.includes(m) && !dontCares.includes(m)) : listed;
    } else {
      let body = p.rhs;
      const dc = body.match(/^(.*?)\s*[+,]\s*(?:d|dc)\s*\(([\d\s,]*)\)\s*$/);
      if (dc) {
        body = dc[1];
        dontCares = numbers(dc[2], p.line);
      }
      try {
        expr = parseExpr(body, vars ?? []);
      } catch (err) {
        if (err instanceof ExprError) throw new LogicError(`${err.message} (column ${p.rhsAt + err.at + 1})`, p.line);
        throw err;
      }
      const used = [...variables(expr)];
      if (vars) {
        const missing = used.find((v) => !vars!.includes(v));
        if (missing) throw new LogicError(`${missing} isn't in ${p.vars ? `${p.name}(${vars.join(", ")})` : "the vars line"}.`, p.line);
      } else vars = used.sort(byName);
      const n = vars.length;
      if (n > MAX_VARS) throw new LogicError(`${p.name} has ${n} variables; up to ${MAX_VARS} are supported.`, p.line);
      const tooBig = dontCares.find((m) => m >= 1 << n);
      if (tooBig !== undefined) throw new LogicError(`${tooBig} is too big for ${n} variables.`, p.line);
      for (let m = 0; m < 1 << n; m++) {
        if (dontCares.includes(m)) continue;
        const env: Record<string, boolean> = {};
        vars.forEach((v, i) => (env[v] = !!(m & (1 << (n - 1 - i)))));
        if (evaluate(expr, env)) ones.push(m);
      }
    }
    if (vars.length > MAX_VARS) throw new LogicError(`${p.name} has ${vars.length} variables; up to ${MAX_VARS} are supported.`, p.line);
    const n = vars.length;
    const zeros = [...Array(1 << n).keys()].filter((m) => !ones.includes(m) && !dontCares.includes(m));
    doc.functions.push({
      name: p.name,
      line: p.line,
      vars,
      expr,
      ones: [...new Set(ones)].sort((a, b) => a - b),
      dontCares: [...new Set(dontCares)].sort((a, b) => a - b),
      sop: minimalCover(n, ones, dontCares),
      pos: minimalCover(n, zeros, dontCares),
    });
  }

  doc.vars = declared ?? [...new Set(doc.functions.flatMap((f) => f.vars))].sort(byName);
  for (const f of doc.functions) for (const v of f.vars) if (!doc.vars.includes(v)) doc.vars.push(v);

  for (const c of compares) {
    const a = doc.functions.find((f) => f.name === c.a);
    const b = doc.functions.find((f) => f.name === c.b);
    const missing = !a ? c.a : !b ? c.b : "";
    if (missing) throw new LogicError(`There's no function called ${missing} to compare.`, c.line);
    const differ: number[] = [];
    if (doc.vars.length <= MAX_VARS)
      for (let row = 0; row < 1 << doc.vars.length; row++) {
        const va = valueAt(a!, doc.vars, row);
        const vb = valueAt(b!, doc.vars, row);
        if (va !== "x" && vb !== "x" && va !== vb) differ.push(row);
      }
    doc.comparisons.push({ a: a!, b: b!, line: c.line, differ });
  }

  if (doc.show.has("table") && doc.vars.length > MAX_TABLE_VARS)
    doc.warnings.push({ message: `The truth table is drawn for up to ${MAX_TABLE_VARS} variables; this has ${doc.vars.length}.`, line: doc.functions[0].line });
  if (doc.show.has("kmap"))
    for (const f of doc.functions)
      if (f.vars.length > MAX_KMAP_VARS || f.vars.length < 2)
        doc.warnings.push({ message: `Karnaugh maps are drawn for 2 to ${MAX_KMAP_VARS} variables; ${f.name} has ${f.vars.length}.`, line: f.line });
  return doc;
}

/** The minimal form of a function as an expression. */
export function simplified(f: LogicFunction, form: "sop" | "pos"): Node {
  return form === "sop" ? sumOfProducts(f.sop, f.vars) : productOfSums(f.pos, f.vars);
}
