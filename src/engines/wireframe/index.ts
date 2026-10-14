// UI wireframes: screens of common controls written as text, drawn clean or
// sketchy, with arrows between screens for a flow. Our own drawing.

import type { RenderOptions, RenderResult } from "../types";
import { parseWireframe, WireframeError } from "./model";
import { drawWireframe } from "./render";

export function renderWireframe(code: string, options: RenderOptions): Promise<RenderResult> {
  const t0 = performance.now();
  try {
    const doc = parseWireframe(code);
    const svg = drawWireframe(doc, { dark: options.dark, style: options.wireStyle });
    return Promise.resolve({ ok: true, svg, ms: performance.now() - t0, warnings: doc.warnings });
  } catch (err) {
    const line = err instanceof WireframeError ? err.line : undefined;
    return Promise.resolve({ ok: false, message: err instanceof Error ? err.message : String(err), line, ms: performance.now() - t0 });
  }
}
