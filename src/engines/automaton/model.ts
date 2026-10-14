// Finite automata and Turing machines, written as transitions.
//
//   automaton
//   title "Ends in ab"
//   start q0
//   accept q2
//   q0 -a-> q1
//   q0 -b-> q0
//   q1 -a-> q1
//   q1 -b-> q2
//   q2 -a-> q1
//   q2 -b-> q0
//   input abab
//
// The kind is worked out from the transitions: a Turing machine when
// labels look like read/write,move (1/0,R); a DFA when every state has at
// most one move per symbol and no ε moves; otherwise an NFA.

export type Kind = "dfa" | "nfa" | "tm";

export interface Rule {
  /** For a finite automaton: the symbol, or "" for ε. For a Turing machine: the symbol read. */
  read: string;
  write?: string;
  move?: "L" | "R" | "S";
}

export interface Edge {
  from: string;
  to: string;
  rules: Rule[];
  line: number;
}

export interface Run {
  input: string;
  line: number;
  accepted: boolean;
  /** Why it stopped, in words. */
  verdict: string;
  steps: Step[];
  /** Turing machines: the cells shown, starting at this tape position. */
  tapeFrom?: number;
  tapeCells?: number;
}

export interface Step {
  /** Current states (one for a DFA or Turing machine). */
  states: string[];
  /** Edges followed to get here (indexes into edges). */
  edges: number[];
  /** Input position, or the head position on the tape. */
  pos: number;
  /** Turing machines: the visible window of the tape. */
  tape?: string[];
  note: string;
}

export interface AutomatonWarning {
  message: string;
  line: number;
}

export interface Automaton {
  kind: Kind;
  title?: string;
  direction: "right" | "down";
  blank: string;
  states: string[];
  stateLine: Map<string, number>;
  start: string;
  accept: Set<string>;
  edges: Edge[];
  /** Every symbol on a transition, in order of first use. */
  alphabet: string[];
  /** Input is read one character at a time when every symbol is one character. */
  charInput: boolean;
  runs: Run[];
  warnings: AutomatonWarning[];
}

export class AutomatonError extends Error {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(message);
  }
}

const EPSILON = new Set(["ε", "eps", "epsilon", "λ", "lambda"]);
export const MAX_STEPS = 500;
const TM_RULE = /^(\S+?)\s*(?:\/|→|->)\s*(\S+?)\s*[, ]\s*([LRSN<>])$/i;

/** Splits a transition line: from -label-> to, or from -> to : label. */
function splitTransition(text: string): { from: string; to: string; label: string } | null {
  const inline = text.match(/^(\S+)\s+-(.+?)->\s*(\S+)$/);
  if (inline) return { from: inline[1], to: inline[3], label: inline[2].trim() };
  const after = text.match(/^(\S+)\s*->\s*(\S+)\s*:\s*(.+)$/);
  if (after) return { from: after[1], to: after[2], label: after[3].trim() };
  return null;
}

export function parseAutomaton(src: string): Automaton {
  const lines = src.split(/\r?\n/);
  let header = false;
  let title: string | undefined;
  let direction: "right" | "down" = "right";
  let blank = "_";
  let start: { name: string; line: number } | undefined;
  const accepts: { name: string; line: number }[] = [];
  const raw: { from: string; to: string; label: string; line: number }[] = [];
  const inputs: { text: string; line: number }[] = [];
  const declared: { name: string; line: number }[] = [];

  lines.forEach((full, k) => {
    const line = k + 1;
    const text = full.replace(/(^|\s)(#|\/\/).*$/, "").trim();
    if (!text) return;
    if (!header) {
      if (!/^(automaton|dfa|nfa|tm|turing)$/i.test(text)) throw new AutomatonError('An automaton starts with the word "automaton" on the first line.', line);
      header = true;
      return;
    }
    const setting = text.match(/^(title|start|accept|final|input|direction|blank|states?)\b\s*(.*)$/);
    if (setting && !/->/.test(text)) {
      const [, key, rest] = setting;
      const value = rest.replace(/^"(.*)"$/, "$1");
      if (key === "title") title = value || undefined;
      else if (key === "start") {
        if (!/^\S+$/.test(rest)) throw new AutomatonError("start takes one state: start q0", line);
        start = { name: rest, line };
      } else if (key === "accept" || key === "final") for (const name of rest.split(/[\s,]+/).filter(Boolean)) accepts.push({ name, line });
      else if (key === "input") inputs.push({ text: /^".*"$/.test(rest) ? value : rest, line });
      else if (key === "direction") {
        if (rest !== "right" && rest !== "down") throw new AutomatonError("direction is right or down.", line);
        direction = rest;
      } else if (key === "blank") {
        if (!/^\S+$/.test(rest)) throw new AutomatonError("blank takes one symbol: blank _", line);
        blank = rest;
      } else for (const name of rest.split(/[\s,]+/).filter(Boolean)) declared.push({ name, line });
      return;
    }
    const t = splitTransition(text);
    if (!t) throw new AutomatonError("Write a transition as from -symbol-> to, for example q0 -a-> q1.", line);
    raw.push({ ...t, line });
  });
  if (!header) throw new AutomatonError('An automaton starts with the word "automaton" on the first line.');
  if (!raw.length) throw new AutomatonError("Add a transition, for example: q0 -a-> q1", lines.length);

  // A Turing machine when every label is read/write,move.
  const pieces = raw.map((r) => r.label.split(/\s*;\s*/).filter(Boolean));
  const tmLike = pieces.map((ps) => ps.every((p) => TM_RULE.test(p)));
  const isTm = tmLike.every(Boolean);
  if (!isTm && tmLike.some(Boolean) && raw.some((r) => r.label.includes("/"))) {
    const bad = raw[tmLike.findIndex((x) => !x)];
    throw new AutomatonError("Turing machine moves are read/write,move, for example 1/0,R. Use ; between several.", bad.line);
  }

  const states: string[] = [];
  const stateLine = new Map<string, number>();
  const see = (name: string, line: number) => {
    if (!stateLine.has(name)) {
      states.push(name);
      stateLine.set(name, line);
    }
  };
  for (const d of declared) see(d.name, d.line);
  if (start) see(start.name, start.line);

  const edges: Edge[] = [];
  raw.forEach((r, i) => {
    see(r.from, r.line);
    see(r.to, r.line);
    const rules: Rule[] = isTm
      ? pieces[i].map((p) => {
          const m = p.match(TM_RULE)!;
          const mv = m[3].toUpperCase();
          return { read: m[1], write: m[2], move: mv === "L" || mv === "<" ? "L" : mv === "R" || mv === ">" ? "R" : "S" };
        })
      : r.label.split(/\s*,\s*/).filter(Boolean).map((s) => ({ read: EPSILON.has(s.toLowerCase()) || s === "ε" ? "" : s }));
    if (!rules.length) throw new AutomatonError("This transition has no symbol.", r.line);
    // Several lines between the same two states share one arrow.
    const same = edges.find((e) => e.from === r.from && e.to === r.to);
    if (same) same.rules.push(...rules);
    else edges.push({ from: r.from, to: r.to, rules, line: r.line });
  });
  for (const a of accepts) if (!stateLine.has(a.name)) throw new AutomatonError(`${a.name} isn't a state in any transition.`, a.line);

  const alphabet: string[] = [];
  for (const e of edges) for (const r of e.rules) if (r.read && !alphabet.includes(r.read)) alphabet.push(r.read);
  const charInput = alphabet.every((s) => [...s].length === 1);

  let kind: Kind = "tm";
  if (!isTm) {
    const nondet = edges.some((e) => e.rules.some((r) => r.read === "")) || states.some((s) => {
      const seen = new Set<string>();
      for (const e of edges) if (e.from === s) for (const r of e.rules) {
        if (seen.has(r.read)) return true;
        seen.add(r.read);
      }
      return false;
    });
    kind = nondet ? "nfa" : "dfa";
  } else {
    for (const s of states) {
      const seen = new Set<string>();
      for (const e of edges) if (e.from === s) for (const r of e.rules) {
        if (seen.has(r.read)) throw new AutomatonError(`${s} has two moves when reading ${r.read}; a Turing machine needs one.`, e.line);
        seen.add(r.read);
      }
    }
  }

  const a: Automaton = {
    kind,
    title,
    direction,
    blank,
    states,
    stateLine,
    start: start?.name ?? raw[0].from,
    accept: new Set(accepts.map((x) => x.name)),
    edges,
    alphabet,
    charInput,
    runs: [],
    warnings: [],
  };

  // States that can't be reached from the start.
  const reach = new Set([a.start]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const e of edges) if (reach.has(e.from) && !reach.has(e.to)) {
      reach.add(e.to);
      grew = true;
    }
  }
  for (const s of states) if (!reach.has(s)) a.warnings.push({ message: `${s} can't be reached from the start state ${a.start}.`, line: stateLine.get(s)! });
  if (!a.accept.size) a.warnings.push({ message: "No accepting state. Add one: accept q2", line: 1 });

  for (const inp of inputs) {
    const run = kind === "tm" ? runTm(a, inp.text) : runFa(a, inp.text);
    run.line = inp.line;
    a.runs.push(run);
    const symbols = kind === "tm" ? [] : tokens(a, inp.text);
    const unknown = symbols.find((s) => !alphabet.includes(s));
    if (unknown !== undefined) a.warnings.push({ message: `"${unknown}" isn't on any transition, so the input is rejected there.`, line: inp.line });
  }
  return a;
}

/** The input split into symbols: characters, or words when symbols are longer. */
export function tokens(a: Pick<Automaton, "charInput">, input: string): string[] {
  if (input === "ε" || input === "") return [];
  return a.charInput ? [...input.replace(/\s+/g, "")] : input.split(/[\s,]+/).filter(Boolean);
}

/** States reachable by ε moves, and the ε edges taken. */
function closure(a: Automaton, set: string[]): { states: string[]; edges: number[] } {
  const states = [...set];
  const used: number[] = [];
  for (let i = 0; i < states.length; i++)
    a.edges.forEach((e, k) => {
      if (e.from === states[i] && e.rules.some((r) => r.read === "")) {
        if (!used.includes(k)) used.push(k);
        if (!states.includes(e.to)) states.push(e.to);
      }
    });
  return { states, edges: used };
}

export function runFa(a: Automaton, input: string): Run {
  const symbols = tokens(a, input);
  const first = closure(a, [a.start]);
  const steps: Step[] = [{ states: first.states, edges: first.edges, pos: 0, note: `Start in ${setText(first.states)}` }];
  let current = first.states;
  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];
    const next: string[] = [];
    const used: number[] = [];
    a.edges.forEach((e, k) => {
      if (current.includes(e.from) && e.rules.some((r) => r.read === sym)) {
        used.push(k);
        if (!next.includes(e.to)) next.push(e.to);
      }
    });
    const closed = closure(a, next);
    current = closed.states;
    steps.push({
      states: current,
      edges: [...used, ...closed.edges.filter((k) => !used.includes(k))],
      pos: i + 1,
      note: current.length ? `Read ${sym}, now in ${setText(current)}` : `Read ${sym}: no move, so the input is rejected`,
    });
    if (!current.length) break;
  }
  const accepted = current.some((s) => a.accept.has(s));
  // Stuck: no state left to be in, so the rest of the input can't be read.
  const finished = current.length > 0;
  const verdict = !finished
    ? `rejected: no move on ${symbols[steps.length - 2]}`
    : accepted
      ? `accepted, ending in ${setText(current.filter((s) => a.accept.has(s)))}`
      : `rejected, ending in ${setText(current)}`;
  return { input, line: 0, accepted: finished && accepted, verdict, steps };
}

const setText = (s: string[]) => (s.length === 1 ? s[0] : `{${s.join(", ")}}`);

export function runTm(a: Automaton, input: string): Run {
  const tape = new Map<number, string>();
  const symbols = tokens({ charInput: true }, input === "ε" ? "" : input);
  symbols.forEach((s, i) => tape.set(i, s));
  let state = a.start;
  let head = 0;
  let lo = 0;
  let hi = Math.max(0, symbols.length - 1);
  const snaps: { state: string; head: number; tape: Map<number, string>; edge: number[]; note: string }[] = [
    { state, head, tape: new Map(tape), edge: [], note: `Start in ${state}, head on the first symbol` },
  ];
  let verdict = "";
  let accepted = false;
  for (let step = 0; ; step++) {
    if (a.accept.has(state)) {
      accepted = true;
      verdict = `accepted: halts in ${state} after ${step} step${step === 1 ? "" : "s"}`;
      break;
    }
    if (step >= MAX_STEPS) {
      verdict = `stopped after ${MAX_STEPS} steps without halting`;
      break;
    }
    const read = tape.get(head) ?? a.blank;
    const k = a.edges.findIndex((e) => e.from === state && e.rules.some((r) => r.read === read));
    if (k < 0) {
      verdict = `rejected: halts in ${state} with no move on ${read}`;
      break;
    }
    const e = a.edges[k];
    const rule = e.rules.find((r) => r.read === read)!;
    if (rule.write === a.blank) tape.delete(head);
    else tape.set(head, rule.write!);
    head += rule.move === "L" ? -1 : rule.move === "R" ? 1 : 0;
    state = e.to;
    lo = Math.min(lo, head);
    hi = Math.max(hi, head);
    snaps.push({ state, head, tape: new Map(tape), edge: [k], note: `Read ${read}, write ${rule.write}, move ${rule.move === "L" ? "left" : rule.move === "R" ? "right" : "nowhere"}, now in ${state}` });
  }
  // Show the cells the head visited, plus one blank either side.
  const from = lo - 1;
  const cells = Math.min(60, hi - lo + 3);
  const steps: Step[] = snaps.map((s) => ({
    states: [s.state],
    edges: s.edge,
    pos: s.head - from,
    tape: [...Array(cells).keys()].map((i) => s.tape.get(from + i) ?? a.blank),
    note: s.note,
  }));
  return { input, line: 0, accepted, verdict, steps, tapeFrom: from, tapeCells: cells };
}
