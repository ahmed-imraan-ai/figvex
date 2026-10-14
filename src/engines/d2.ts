// D2 (MPL-2.0), the diagram language from Terrastruct, through its
// WebAssembly build. It's large, so it loads the first time a D2 diagram
// is drawn, and runs in its own worker.

import type { D2Style, RenderOptions, RenderResult } from "./types";

type D2Module = typeof import("@terrastruct/d2");
let instance: Promise<InstanceType<D2Module["D2"]>> | undefined;

function d2() {
  instance ??= import("@terrastruct/d2").then((m) => new m.D2());
  instance.catch(() => (instance = undefined));
  return instance;
}

/** D2 theme numbers for each style. Dark diagrams use D2's dark theme. */
const THEMES: Record<D2Style, number> = {
  neutral: 0,
  grey: 1,
  "colour-blind": 8,
  terminal: 300,
  origami: 302,
  sketch: 0,
};

export async function renderD2(code: string, options: RenderOptions): Promise<RenderResult> {
  const t0 = performance.now();
  const engine = await d2();
  const style = options.d2Style;
  const themeID = options.dark ? 200 : THEMES[style];
  try {
    const result = await engine.compile({ fs: { "input.d2": code }, inputPath: "input.d2", options: { layout: "dagre", sketch: style === "sketch", themeID, pad: 24, center: true } });
    const svg = await engine.render(result.diagram, { ...result.renderOptions, sketch: style === "sketch", themeID, pad: 24, center: true, scale: 1 });
    return { ok: true, svg: svg.replace(/^<\?xml[^>]*>\s*/, ""), ms: performance.now() - t0 };
  } catch (err) {
    let raw = err instanceof Error ? err.message : String(err);
    // D2 reports a JSON list of errors: [{ "range": ..., "errmsg": "input.d2:3:5: ..." }].
    try {
      const list = JSON.parse(raw) as { errmsg?: string }[];
      if (Array.isArray(list) && list[0]?.errmsg) raw = list[0].errmsg;
    } catch {
      // Plain text.
    }
    // "input.d2:3:5: ..." points at the line.
    const at = raw.match(/(?:^|\s)[\w.-]*\.d2:(\d+):(\d+):\s*(.*)$/m);
    const message = (at ? at[3] : raw).replace(/^failed to compile[^:]*:\s*/i, "");
    return { ok: false, message: message.charAt(0).toUpperCase() + message.slice(1), line: at ? Number(at[1]) : undefined, ms: performance.now() - t0 };
  }
}

/** A first line that reads as D2: a connection, a shape with a label, or a D2 keyword. */
export function isD2(line: string): boolean {
  return (
    /^(direction|vars|classes|layers|scenarios|steps|style)\s*:/.test(line) ||
    // D2 puts a label's colon straight after the name ("a -> b: hi");
    // PlantUML messages have a space before it ("A -> B : hi").
    /^[\w"'.-]+(\s*[-<]-[->]|\s*->|\s*<-)\s*[\w"'.-]+(:\s.*)?$/.test(line) ||
    /^[\w"'.-]+\s*:\s*[^{}]*\{\s*$/.test(line)
  );
}
