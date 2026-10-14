import { beforeAll, describe, expect, it } from "vitest";
import { detectEngine } from "../../src/engines/detect";
import type { VizInstance } from "../../src/engines/graphviz";
import { AutomatonError, parseAutomaton, runFa } from "../../src/engines/automaton/model";
import { drawAutomaton, labelLines, layoutAutomaton } from "../../src/engines/automaton/render";
import { automatonTemplates } from "../../src/templates/automaton";

let viz: VizInstance;

beforeAll(async () => {
  // @ts-expect-error: the script ships without type declarations.
  await import("@plantuml/core/viz-global.js");
  viz = await (globalThis as unknown as { Viz: { instance(): Promise<VizInstance> } }).Viz.instance();
});

const ENDS_AB = `automaton
start q0
accept q2
q0 -b-> q0
q0 -a-> q1
q1 -a-> q1
q1 -b-> q2
q2 -a-> q1
q2 -b-> q0
input abab
input abba
`;

describe("finite automata", () => {
  it("reads states, transitions and settings, and knows a DFA", () => {
    const a = parseAutomaton(ENDS_AB);
    expect(a.kind).toBe("dfa");
    expect(a.states).toEqual(["q0", "q1", "q2"]);
    expect(a.start).toBe("q0");
    expect([...a.accept]).toEqual(["q2"]);
    expect(a.edges.map((e) => `${e.from}>${e.to}:${labelLines(e, a.kind)}`)).toEqual(["q0>q0:b", "q0>q1:a", "q1>q1:a", "q1>q2:b", "q2>q1:a", "q2>q0:b"]);
    expect(a.alphabet).toEqual(["b", "a"]);
    expect(a.warnings).toEqual([]);
  });

  it("runs inputs step by step", () => {
    const a = parseAutomaton(ENDS_AB);
    expect(a.runs.map((r) => [r.input, r.accepted, r.verdict])).toEqual([
      ["abab", true, "accepted, ending in q2"],
      ["abba", false, "rejected, ending in q1"],
    ]);
    expect(a.runs[0].steps.map((s) => s.states[0])).toEqual(["q0", "q1", "q2", "q1", "q2"]);
    expect(a.runs[0].steps[2]).toMatchObject({ pos: 2, edges: [3], note: "Read b, now in q2" });
  });

  it("merges arrows between the same states and reads -> to : label", () => {
    const a = parseAutomaton("automaton\np -> q : a, b\np -c-> q\nq -a-> q\naccept q");
    expect(a.edges).toHaveLength(2);
    expect(labelLines(a.edges[0], a.kind)).toEqual(["a, b, c"]);
  });

  it("treats ε moves and choices as an NFA, tracking sets of states", () => {
    const a = parseAutomaton("automaton\nstart s0\naccept s2\ns0 -ε-> s1\ns1 -a-> s1\ns1 -a-> s2\ninput aa\ninput ε");
    expect(a.kind).toBe("nfa");
    expect(a.runs[0].steps.map((s) => s.states)).toEqual([["s0", "s1"], ["s1", "s2"], ["s1", "s2"]]);
    expect(a.runs[0].accepted).toBe(true);
    expect(a.runs[1]).toMatchObject({ input: "ε", accepted: false });
  });

  it("stops when there's no move, and reads word symbols", () => {
    const a = parseAutomaton(ENDS_AB);
    const r = runFa(a, "abc");
    expect(r.accepted).toBe(false);
    expect(r.verdict).toBe("rejected: no move on c");
    const t = parseAutomaton("automaton\nstart Locked\naccept Locked\nLocked -coin-> Open\nOpen -push-> Locked\ninput coin push");
    expect(t.charInput).toBe(false);
    expect(t.runs[0].accepted).toBe(true);
  });

  it("warns about unreachable states, missing accepting states and unknown symbols", () => {
    const a = parseAutomaton("automaton\nq0 -a-> q1\nq2 -a-> q1\ninput ab");
    expect(a.warnings.map((w) => [w.line, w.message])).toEqual([
      [3, "q2 can't be reached from the start state q0."],
      [1, "No accepting state. Add one: accept q2"],
      [4, '"b" isn\'t on any transition, so the input is rejected there.'],
    ]);
  });

  it("explains mistakes with their line", () => {
    const err = (src: string) => {
      try {
        parseAutomaton(src);
      } catch (e) {
        return e as AutomatonError;
      }
      throw new Error("no error");
    };
    expect(err("q0 -a-> q1")).toMatchObject({ line: 1 });
    expect(err("automaton\nq0 a q1")).toMatchObject({ line: 2, message: expect.stringMatching(/from -symbol-> to/) });
    expect(err("automaton\nq0 -a-> q1\naccept q9").message).toMatch(/q9 isn't a state/);
    expect(err("automaton\nq0 -1/0,R-> q1\nq0 -a-> q1").message).toMatch(/read\/write,move/);
  });
});

describe("Turing machines", () => {
  const INC = `automaton
start right
accept done
right -0/0,R; 1/1,R-> right
right -_/_,L-> carry
carry -1/0,L-> carry
carry -0/1,S; _/1,S-> done
input 1011
input 111
`;

  it("adds one in binary, keeping a tape window for each step", () => {
    const a = parseAutomaton(INC);
    expect(a.kind).toBe("tm");
    const [r1, r2] = a.runs;
    expect(r1.accepted).toBe(true);
    expect(r1.steps.at(-1)!.tape!.join("").replace(/_/g, "")).toBe("1100");
    expect(r2.steps.at(-1)!.tape!.join("").replace(/_/g, "")).toBe("1000");
    expect(r1.verdict).toMatch(/^accepted: halts in done after \d+ steps$/);
    // Every snapshot is the same width, and the head stays on the tape.
    const widths = new Set(r1.steps.map((s) => s.tape!.length));
    expect(widths.size).toBe(1);
    for (const s of r1.steps) expect(s.pos).toBeGreaterThanOrEqual(0);
  });

  it("rejects when it halts without a move, and needs one move per symbol", () => {
    const a = parseAutomaton("automaton\naccept y\nq -a/a,R-> y\ninput b");
    expect(a.runs[0].verdict).toBe("rejected: halts in q with no move on b");
    expect(() => parseAutomaton("automaton\nq -a/a,R-> y\nq -a/b,L-> z")).toThrow(/two moves when reading a/);
  });

  it("gives up on a machine that runs for ever", () => {
    const a = parseAutomaton("automaton\naccept y\nq -_/_,R-> q\nq -a/a,R-> y\ninput ε");
    expect(a.runs[0].verdict).toMatch(/stopped after 500 steps/);
  });
});

describe("automaton drawing", () => {
  it("draws every template with its trace and no warnings", () => {
    for (const t of automatonTemplates) {
      const a = parseAutomaton(t.code);
      expect(a.warnings, t.id).toEqual([]);
      const svg = drawAutomaton(a, layoutAutomaton(a, viz), false, "colour");
      expect(svg.startsWith("<svg"), t.id).toBe(true);
      expect(svg).not.toContain("NaN");
      const trace = JSON.parse(svg.match(/data-trace="([^"]*)"/)![1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
      expect(trace).toHaveLength(a.runs.length);
      for (const s of a.states) expect(svg).toContain(`data-state="${s}"`);
    }
  });

  it("is picked up from the first line", () => {
    expect(detectEngine("automaton\nq0 -a-> q1")).toBe("automaton");
    expect(detectEngine("DFA\nq0 -a-> q1")).toBe("automaton");
  });
});
