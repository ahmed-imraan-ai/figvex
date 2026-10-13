// Network diagrams: devices, zones (subnets, VLANs, sites) and links in a
// small text format. Graphviz places things; the icons and checks are ours.

import { loadGraphviz } from "../graphviz";
import type { RenderOptions, RenderResult } from "../types";
import { checkNetwork, NetworkError, parseNetwork } from "./model";
import { drawNetwork, layoutNetwork } from "./render";

export async function renderNetwork(code: string, options: RenderOptions): Promise<RenderResult> {
  const t0 = performance.now();
  try {
    const net = parseNetwork(code);
    const warnings = net.checks ? checkNetwork(net) : [];
    const layout = layoutNetwork(net, await loadGraphviz());
    const svg = drawNetwork(net, layout, { dark: options.dark, style: options.netStyle, warnings });
    return { ok: true, svg, ms: performance.now() - t0, warnings };
  } catch (err) {
    const line = err instanceof NetworkError ? err.line : undefined;
    return { ok: false, message: err instanceof Error ? err.message : String(err), line, ms: performance.now() - t0 };
  }
}
