// Data structure pictures for coursework: arrays, stacks, queues, linked
// lists, trees, heaps, hash tables and graphs, one per line.

import { loadGraphviz } from "../graphviz";
import type { RenderOptions, RenderResult } from "../types";
import { parseStructures, StructuresError } from "./model";
import { drawStructures, needsGraphviz } from "./render";

export async function renderStructures(code: string, options: RenderOptions): Promise<RenderResult> {
  const t0 = performance.now();
  try {
    const doc = parseStructures(code);
    const viz = needsGraphviz(doc) ? await loadGraphviz() : undefined;
    const svg = drawStructures(doc, { dark: options.dark, style: options.structStyle }, viz);
    return { ok: true, svg, ms: performance.now() - t0, warnings: doc.warnings };
  } catch (err) {
    const line = err instanceof StructuresError ? err.line : undefined;
    return { ok: false, message: err instanceof Error ? err.message : String(err), line, ms: performance.now() - t0 };
  }
}
