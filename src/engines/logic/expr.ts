// Boolean expressions: parsing, evaluation and writing them out again in
// the notation people use in class.
//
// A variable is one letter, optionally followed by digits (A, B, x1), so
// "AB" means A AND B. Longer names (Cin) work once they're declared. Operators can be written several ways:
//   NOT  !A  ~A  ¬A  not A  A'
//   AND  A·B  A.B  A*B  A&B  A&&B  A∧B  A and B  AB
//   OR   A+B  A|B  A||B  A∨B  A or B
//   XOR  A^B  A⊕B  A xor B      XNOR  A⊙B  A xnor B
//   NAND A↑B  A nand B          NOR   A↓B  A nor B
// NOT binds tightest, then AND, then XOR, then OR.

export type Node =
  | { k: "var"; name: string }
  | { k: "const"; v: boolean }
  | { k: "not"; a: Node }
  | { k: "and" | "or" | "xor" | "xnor" | "nand" | "nor"; args: Node[] };

export class ExprError extends Error {
  constructor(
    message: string,
    /** 0-based position in the expression text. */
    readonly at: number,
  ) {
    super(message);
  }
}

type Op = "and" | "or" | "xor" | "xnor" | "nand" | "nor" | "not" | "prime" | "(" | ")";
type Tok = { t: "var"; v: string; at: number } | { t: "const"; v: boolean; at: number } | { t: Op; at: number };

const WORD_OPS: Record<string, Op> = { and: "and", or: "or", not: "not", xor: "xor", xnor: "xnor", nand: "nand", nor: "nor" };
const SYMBOLS: [string, Op][] = [
  ["&&", "and"], ["||", "or"], ["·", "and"], [".", "and"], ["*", "and"], ["&", "and"], ["∧", "and"], ["⋅", "and"], ["×", "and"],
  ["+", "or"], ["|", "or"], ["∨", "or"], ["^", "xor"], ["⊕", "xor"], ["⊙", "xnor"], ["↑", "nand"], ["↓", "nor"],
  ["!", "not"], ["~", "not"], ["¬", "not"], ["'", "prime"], ["’", "prime"], ["(", "("], [")", ")"], ["[", "("], ["]", ")"],
];

export function tokenize(src: string, names: string[] = []): Tok[] {
  const out: Tok[] = [];
  // Declared names longer than a letter (Cin, clk) are read whole, longest first.
  const long = names.filter((x) => x.length > 1).sort((a, b) => b.length - a.length);
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const named = long.find((x) => src.startsWith(x, i) && !/[A-Za-z0-9_]/.test(src[i + x.length] ?? ""));
    if (named) {
      out.push({ t: "var", v: named, at: i });
      i += named.length;
      continue;
    }
    const word = src.slice(i).match(/^[A-Za-z]+/);
    if (word && WORD_OPS[word[0].toLowerCase()] && word[0].length > 1) {
      out.push({ t: WORD_OPS[word[0].toLowerCase()], at: i });
      i += word[0].length;
      continue;
    }
    const v = src.slice(i).match(/^[A-Za-z][0-9_]*/);
    if (v) {
      out.push({ t: "var", v: v[0], at: i });
      i += v[0].length;
      continue;
    }
    if (c === "0" || c === "1") {
      out.push({ t: "const", v: c === "1", at: i });
      i++;
      continue;
    }
    const sym = SYMBOLS.find(([s]) => src.startsWith(s, i));
    if (!sym) throw new ExprError(`"${c}" isn't an operator. Use + for OR, · or & for AND, ! or ' for NOT.`, i);
    out.push({ t: sym[1], at: i });
    i += sym[0].length;
  }
  return out;
}

export function parseExpr(src: string, names: string[] = []): Node {
  const toks = tokenize(src, names);
  let i = 0;
  const peek = () => toks[i];
  const end = src.length;
  const startsPrimary = (t?: Tok) => !!t && (t.t === "var" || t.t === "const" || t.t === "(" || t.t === "not");

  const binary = (ops: Op[], next: () => Node): Node => {
    let left = next();
    while (peek() && ops.includes(peek()!.t as Op)) {
      const op = toks[i++].t as "and" | "or" | "xor" | "xnor" | "nand" | "nor";
      const right = next();
      if ((op === "and" || op === "or" || op === "xor") && left.k === op) left.args.push(right);
      else left = { k: op, args: [left, right] };
    }
    return left;
  };
  const orLevel = (): Node => binary(["or", "nor"], xorLevel);
  const xorLevel = (): Node => binary(["xor", "xnor"], andLevel);
  const andLevel = (): Node => {
    let left = unary();
    for (;;) {
      const t = peek();
      if (t && (t.t === "and" || t.t === "nand")) {
        i++;
        const right = unary();
        if (t.t === "and" && left.k === "and") left.args.push(right);
        else left = { k: t.t, args: [left, right] };
      } else if (startsPrimary(t)) {
        // Writing terms side by side means AND: AB, A(B + C).
        const right = unary();
        if (left.k === "and") left.args.push(right);
        else left = { k: "and", args: [left, right] };
      } else return left;
    }
  };
  const unary = (): Node => {
    if (peek()?.t === "not") {
      i++;
      return { k: "not", a: unary() };
    }
    let node = primary();
    while (peek()?.t === "prime") {
      i++;
      node = { k: "not", a: node };
    }
    return node;
  };
  const primary = (): Node => {
    const t = toks[i++];
    if (!t) throw new ExprError("The expression ends too early.", end);
    if (t.t === "var") return { k: "var", name: t.v };
    if (t.t === "const") return { k: "const", v: t.v };
    if (t.t === "(") {
      const inner = orLevel();
      if (peek()?.t !== ")") throw new ExprError("A bracket isn't closed. Add a ).", peek()?.at ?? end);
      i++;
      return inner;
    }
    throw new ExprError(t.t === ")" ? "There's a ) without a ( before it." : `Expected a variable or ( here.`, t.at);
  };

  if (!toks.length) throw new ExprError("The expression is empty.", 0);
  const node = orLevel();
  if (i < toks.length) {
    const t = toks[i];
    throw new ExprError(t.t === ")" ? "There's a ) without a ( before it." : "Expected an operator here.", t.at);
  }
  return node;
}

export function variables(node: Node, into = new Set<string>()): Set<string> {
  if (node.k === "var") into.add(node.name);
  else if (node.k === "not") variables(node.a, into);
  else if (node.k !== "const") for (const a of node.args) variables(a, into);
  return into;
}

export function evaluate(node: Node, env: Record<string, boolean>): boolean {
  switch (node.k) {
    case "var":
      return env[node.name] ?? false;
    case "const":
      return node.v;
    case "not":
      return !evaluate(node.a, env);
    case "and":
      return node.args.every((a) => evaluate(a, env));
    case "or":
      return node.args.some((a) => evaluate(a, env));
    case "nand":
      return !node.args.every((a) => evaluate(a, env));
    case "nor":
      return !node.args.some((a) => evaluate(a, env));
    case "xor":
      return node.args.reduce((acc, a) => acc !== evaluate(a, env), false);
    case "xnor":
      return !node.args.reduce((acc, a) => acc !== evaluate(a, env), false);
  }
}

/** How expressions are written out. */
export type Notation = "overbar" | "prime" | "logic" | "code";

/** Expression text, with the character ranges that get a bar over them. */
export interface Written {
  text: string;
  bars: { from: number; to: number }[];
}

const PREC: Record<Node["k"], number> = { or: 1, nor: 1, xor: 2, xnor: 2, and: 3, nand: 3, not: 4, var: 5, const: 5 };

const SIGNS: Record<Notation, Record<"and" | "or" | "xor" | "xnor" | "nand" | "nor", string>> = {
  overbar: { and: "·", or: " + ", xor: " ⊕ ", xnor: " ⊙ ", nand: "·", nor: " + " },
  prime: { and: "", or: " + ", xor: " ⊕ ", xnor: " ⊙ ", nand: "", nor: " + " },
  logic: { and: " ∧ ", or: " ∨ ", xor: " ⊕ ", xnor: " ⊙ ", nand: " ↑ ", nor: " ↓ " },
  code: { and: " && ", or: " || ", xor: " ^ ", xnor: " ^ ", nand: " && ", nor: " || " },
};

export function write(node: Node, notation: Notation): Written {
  let text = "";
  const bars: Written["bars"] = [];
  const bar = (draw: () => void) => {
    const from = text.length;
    draw();
    bars.push({ from, to: text.length });
  };
  const paren = (draw: () => void, needed: boolean) => {
    if (needed) text += "(";
    draw();
    if (needed) text += ")";
  };
  const go = (n: Node, parent: number): void => {
    if (n.k === "var") {
      text += n.name;
      return;
    }
    if (n.k === "const") {
      text += n.v ? "1" : "0";
      return;
    }
    if (n.k === "not") {
      // A bar groups what's under it, so it never needs brackets.
      if (notation === "overbar") return bar(() => go(n.a, 0));
      if (notation === "prime") {
        paren(() => go(n.a, 0), n.a.k !== "var" && n.a.k !== "const");
        text += "'";
        return;
      }
      text += notation === "logic" ? "¬" : "!";
      paren(() => go(n.a, 0), PREC[n.a.k] < 4);
      return;
    }
    // NAND and NOR are written as a NOT over AND and OR, except in logic
    // notation, which has ↑ and ↓. Code has no XNOR, so it gets !( ^ ).
    const base = n.k === "nand" && notation !== "logic" ? "and" : n.k === "nor" && notation !== "logic" ? "or" : n.k === "xnor" && notation === "code" ? "xor" : n.k;
    const negated = base !== n.k;
    const sign = SIGNS[notation][base];
    const prec = PREC[base];
    // Side by side, anything but a letter or a NOT gets brackets: A(B + C).
    const tight = notation === "prime" && base === "and";
    // ↑, ↓ and ⊙ aren't associative, so they bracket their own kind.
    const own = base === "nand" || base === "nor" || base === "xnor" ? 0.5 : 0;
    const body = () =>
      n.args.forEach((a, k) => {
        if (k) text += sign;
        go(a, tight && a.k !== "var" && a.k !== "not" && a.k !== "const" ? 6 : prec + own);
      });
    if (!negated) return paren(body, prec < parent);
    if (notation === "overbar") return bar(body);
    if (notation === "prime") {
      text += "(";
      body();
      text += ")'";
      return;
    }
    text += "!(";
    body();
    text += ")";
  };
  go(node, 0);
  return { text, bars };
}

/** Plain text, with overbars written as NOT for places that can't draw them. */
export function writePlain(node: Node, notation: Notation): string {
  return write(node, notation === "overbar" ? "logic" : notation).text;
}
