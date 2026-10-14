// Timing diagrams with WaveDrom: digital signals over time ({ signal }),
// register bit fields ({ reg }) and logic circuits ({ assign }), written
// in WaveJSON. WaveDrom does the drawing; it is loaded on first use.

import type { RenderOptions, RenderResult } from "../types";

type Runtime = typeof import("./runtime");
let runtime: Promise<Runtime> | undefined;

const load = () => {
  runtime ??= import("./runtime");
  runtime.catch(() => (runtime = undefined));
  return runtime;
};

/** WaveJSON has a signal, reg or assign key at the top. */
export function isWaveJson(code: string): boolean {
  return /^\s*(\/\/[^\n]*\n\s*)*\{[\s\S]{0,200}?["']?\b(signal|reg|assign)\b["']?\s*:/.test(code) && !/["']?\bseries["']?\s*:/.test(code);
}

type Onml = [string, Record<string, unknown>, ...unknown[]];
/** An onml element as [tag, attrs, children]; onml lets the attributes be left out. */
function parts(x: unknown): { tag: string; attrs: Record<string, unknown>; kids: unknown[] } | null {
  if (!Array.isArray(x) || typeof x[0] !== "string") return null;
  const hasAttrs = x[1] !== null && typeof x[1] === "object" && !Array.isArray(x[1]);
  return { tag: x[0], attrs: hasAttrs ? (x[1] as Record<string, unknown>) : {}, kids: x.slice(hasAttrs ? 2 : 1) };
}

/**
 * WaveDrom draws each piece of a wave as <use href="#brick">. The preview's
 * sanitiser removes <use>, so each one is replaced by a copy of the brick.
 * The white background WaveDrom adds is dropped too, so the diagram sits on
 * the light or dark sheet like the others.
 */
export function inlineUses(tree: Onml): Onml {
  const defs = new Map<string, unknown>();
  const collect = (node: unknown) => {
    const e = parts(node);
    if (!e) return;
    if (typeof e.attrs.id === "string") defs.set(e.attrs.id, node);
    e.kids.forEach(collect);
  };
  collect(tree);
  const strip = (node: unknown): unknown => {
    const e = parts(node);
    if (!e) return node;
    const { id: _id, ...attrs } = e.attrs;
    return [e.tag, attrs, ...e.kids.map(strip)];
  };
  const walk = (node: unknown): unknown => {
    const e = parts(node);
    if (!e) return node;
    if (e.tag === "rect" && e.attrs.style === "stroke:none;fill:white") return null;
    if (e.tag === "use") {
      const ref = String(e.attrs["xlink:href"] ?? e.attrs.href ?? "").replace(/^#/, "");
      const def = defs.get(ref);
      if (!def) return null;
      const { "xlink:href": _x, href: _h, ...rest } = e.attrs;
      return ["g", rest, strip(def)];
    }
    return [e.tag, e.attrs, ...e.kids.map(walk).filter((c) => c !== null)];
  };
  return walk(tree) as Onml;
}

export async function renderWaveDrom(code: string, options: RenderOptions): Promise<RenderResult> {
  const t0 = performance.now();
  const { JSON5, wavedrom, skins } = await load();
  let source: Record<string, unknown>;
  try {
    source = JSON5.parse(code);
  } catch (err) {
    const e = err as { lineNumber?: number; message?: string };
    const message = (e.message ?? String(err)).replace(/^JSON5: /, "").replace(/ at \d+:\d+$/, "");
    return { ok: false, message: `This isn't valid WaveJSON: ${message}.`, line: e.lineNumber, ms: performance.now() - t0 };
  }
  if (!source || typeof source !== "object" || !("signal" in source || "reg" in source || "assign" in source)) {
    return { ok: false, message: "A timing diagram is an object with a signal list, for example { signal: [{ name: 'clk', wave: 'p...' }] }.", ms: performance.now() - t0 };
  }
  // Dark diagrams use WaveDrom's dark skin; otherwise the style chosen.
  const config = (source.config ?? {}) as Record<string, unknown>;
  const skin = options.dark ? "dark" : options.waveStyle === "default" ? (config.skin as string) ?? "default" : options.waveStyle;
  source = { ...source, config: { ...config, skin } };
  try {
    const tree = wavedrom.renderAny(0, source, skins);
    const svg = wavedrom.onml.stringify(inlineUses(tree) as typeof tree);
    if (!svg.startsWith("<svg")) throw new Error("Nothing to draw.");
    return { ok: true, svg, ms: performance.now() - t0 };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err), ms: performance.now() - t0 };
  }
}
