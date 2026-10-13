// Org charts: people and reporting lines written as an indented list, laid
// out as a tidy tree. Our own layout, so there's no new dependency.

import type { RenderOptions, RenderResult } from "../types";
import { OrgError, parseOrgChart } from "./model";
import { drawOrgChart } from "./render";

export function renderOrgChart(code: string, options: RenderOptions): Promise<RenderResult> {
  const t0 = performance.now();
  try {
    const svg = drawOrgChart(parseOrgChart(code), { dark: options.dark, style: options.orgStyle });
    return Promise.resolve({ ok: true, svg, ms: performance.now() - t0 });
  } catch (err) {
    const line = err instanceof OrgError ? err.line : undefined;
    return Promise.resolve({ ok: false, message: err instanceof Error ? err.message : String(err), line, ms: performance.now() - t0 });
  }
}
