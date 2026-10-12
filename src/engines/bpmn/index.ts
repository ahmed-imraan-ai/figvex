// BPMN 2.0 process diagrams, drawn by our own renderer from the OMG
// specification rather than bpmn-js, whose licence requires its watermark
// on every diagram (see ROADMAP.md, licence policy).

import { loadGraphviz } from "../graphviz";
import type { RenderOptions, RenderResult } from "../types";
import { layoutBpmn, needsLayout } from "./layout";
import { BpmnError, parseBpmn } from "./model";
import { drawBpmn } from "./render";

export { BpmnError, parseBpmn } from "./model";

export async function renderBpmn(code: string, options: RenderOptions): Promise<RenderResult> {
  const t0 = performance.now();
  try {
    const model = parseBpmn(code);
    if (needsLayout(model)) layoutBpmn(model, await loadGraphviz());
    const svg = drawBpmn(model, { dark: options.dark, style: options.bpmnStyle });
    return { ok: true, svg, ms: performance.now() - t0 };
  } catch (err) {
    if (err instanceof BpmnError) return { ok: false, message: err.message, line: err.line, ms: performance.now() - t0 };
    return { ok: false, message: err instanceof Error ? err.message : String(err), ms: performance.now() - t0 };
  }
}
