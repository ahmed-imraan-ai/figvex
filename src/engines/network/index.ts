// Network diagrams: devices, zones (subnets, VLANs, sites) and links in a
// small text format. Graphviz places things; the icons and checks are ours.
// Rack and floor blocks add physical views under the logical diagram.

import { loadGraphviz } from "../graphviz";
import type { RenderOptions, RenderResult } from "../types";
import { checkNetwork, NetworkError, parseNetwork } from "./model";
import { drawPhysical, parsePhysical, splitPhysical } from "./physical";
import { drawNetwork, layoutNetwork } from "./render";

/** Splits an SVG into its size and inner markup. */
function inner(svg: string): { w: number; h: number; body: string } {
  const w = Number(svg.match(/^<svg[^>]*\swidth="([\d.]+)"/)?.[1] ?? 0);
  const h = Number(svg.match(/^<svg[^>]*\sheight="([\d.]+)"/)?.[1] ?? 0);
  return { w, h, body: svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "") };
}

export async function renderNetwork(code: string, options: RenderOptions): Promise<RenderResult> {
  const t0 = performance.now();
  try {
    const { logical, physical } = splitPhysical(code);
    const net = parseNetwork(logical);
    const warnings = net.checks ? checkNetwork(net) : [];
    const phys = parsePhysical(physical, net, warnings);
    const hasPhysical = phys.racks.length + phys.floors.length > 0;
    const showLogical = phys.view !== "physical" || !hasPhysical;
    const parts: { w: number; h: number; body: string }[] = [];
    if (showLogical) {
      const layout = layoutNetwork(net, await loadGraphviz());
      parts.push(inner(drawNetwork(net, layout, { dark: options.dark, style: options.netStyle, warnings })));
    }
    if (hasPhysical && phys.view !== "logical") {
      const p = drawPhysical(phys, net, options.dark);
      parts.push({ w: p.w + 48, h: p.h + 48, body: `<g transform="translate(24 24)">${p.svg}</g>` });
    }
    // Stack the views top to bottom.
    let y = 0;
    const w = Math.max(...parts.map((p) => p.w));
    const body = parts
      .map((p) => {
        const g = `<g transform="translate(0 ${y})">${p.body}</g>`;
        y += p.h;
        return g;
      })
      .join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${y}" viewBox="0 0 ${w} ${y}">${body}</svg>`;
    warnings.sort((a, b) => a.line - b.line);
    return { ok: true, svg, ms: performance.now() - t0, warnings };
  } catch (err) {
    const line = err instanceof NetworkError ? err.line : undefined;
    return { ok: false, message: err instanceof Error ? err.message : String(err), line, ms: performance.now() - t0 };
  }
}
