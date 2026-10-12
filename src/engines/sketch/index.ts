// Freeform sketches: shapes, arrows and pen strokes drawn on the canvas and
// stored as text, so saving, sharing and undo work as for every other type.

import type { RenderOptions, RenderResult } from "../types";
import { parseSketch, SketchError } from "./model";
import { drawSketch } from "./render";

export function renderSketch(code: string, options: RenderOptions): Promise<RenderResult> {
  const t0 = performance.now();
  try {
    const svg = drawSketch(parseSketch(code), { dark: options.dark, style: options.sketchStyle });
    return Promise.resolve({ ok: true, svg, ms: performance.now() - t0 });
  } catch (err) {
    if (err instanceof SketchError) return Promise.resolve({ ok: false, message: err.message, line: err.line, ms: performance.now() - t0 });
    return Promise.resolve({ ok: false, message: err instanceof Error ? err.message : String(err), ms: performance.now() - t0 });
  }
}
