// Boolean logic: truth tables, Karnaugh maps, minimal expressions and gate
// circuits from an expression or a list of minterms. Our own layout and
// minimisation, so there's no new dependency.

import type { RenderOptions, RenderResult } from "../types";
import { LogicError, parseLogic } from "./model";
import { drawLogic } from "./render";

export async function renderLogic(code: string, options: RenderOptions): Promise<RenderResult> {
  const t0 = performance.now();
  try {
    const doc = parseLogic(code);
    const svg = drawLogic(doc, { dark: options.dark, notation: options.logicStyle });
    return { ok: true, svg, ms: performance.now() - t0, warnings: doc.warnings };
  } catch (err) {
    const line = err instanceof LogicError ? err.line : undefined;
    return { ok: false, message: err instanceof Error ? err.message : String(err), line, ms: performance.now() - t0 };
  }
}
