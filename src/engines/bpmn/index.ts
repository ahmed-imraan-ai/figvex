// BPMN 2.0 process diagrams, drawn by our own renderer from the OMG
// specification rather than bpmn-js, whose licence requires its watermark
// on every diagram (see ROADMAP.md, licence policy).

import { loadGraphviz } from "../graphviz";
import type { RenderOptions, RenderResult } from "../types";
import { layoutBpmn, needsLayout } from "./layout";
import { BpmnError, parseBpmn, type BpmnModel } from "./model";
import { drawBpmn } from "./render";

export { BpmnError, parseBpmn } from "./model";

/** The model behind the last drawing, for dragging shapes in the preview. */
let last: { code: string; model: BpmnModel; laidOut: boolean } | null = null;

/**
 * The model last drawn from `code`, with positions filled in. `laidOut` is
 * true when the file has no positions of its own and Graphviz placed things.
 */
export function lastBpmn(code: string): { model: BpmnModel; laidOut: boolean } | null {
  return last?.code === code ? last : null;
}

export async function renderBpmn(code: string, options: RenderOptions): Promise<RenderResult> {
  const t0 = performance.now();
  try {
    const model = parseBpmn(code);
    const laidOut = needsLayout(model);
    if (laidOut) layoutBpmn(model, await loadGraphviz());
    last = { code, model, laidOut };
    const svg = drawBpmn(model, { dark: options.dark, style: options.bpmnStyle });
    return { ok: true, svg, ms: performance.now() - t0 };
  } catch (err) {
    if (err instanceof BpmnError) return { ok: false, message: err.message, line: err.line, ms: performance.now() - t0 };
    return { ok: false, message: err instanceof Error ? err.message : String(err), ms: performance.now() - t0 };
  }
}
