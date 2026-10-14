// Automata: DFAs, NFAs and Turing machines from their transitions, laid
// out by Graphviz, with each input string run through the machine.

import { loadGraphviz } from "../graphviz";
import type { RenderOptions, RenderResult } from "../types";
import { AutomatonError, parseAutomaton } from "./model";
import { drawAutomaton, layoutAutomaton } from "./render";

export async function renderAutomaton(code: string, options: RenderOptions): Promise<RenderResult> {
  const t0 = performance.now();
  try {
    const a = parseAutomaton(code);
    const svg = drawAutomaton(a, layoutAutomaton(a, await loadGraphviz()), options.dark, options.automatonStyle);
    return { ok: true, svg, ms: performance.now() - t0, warnings: a.warnings };
  } catch (err) {
    const line = err instanceof AutomatonError ? err.line : undefined;
    return { ok: false, message: err instanceof Error ? err.message : String(err), line, ms: performance.now() - t0 };
  }
}
