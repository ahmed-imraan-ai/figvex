// nomnoml (MIT): UML-ish box diagrams from bracketed text, like
// [Customer]->[Order]. Loaded the first time a nomnoml diagram is drawn.

import type { RenderOptions, RenderResult } from "./types";

type Nomnoml = typeof import("nomnoml");
let lib: Promise<Nomnoml> | undefined;

/** Directives that go before the diagram, so the diagram's own win. */
function look(options: RenderOptions): string {
  const base = ["#background: transparent", "#padding: 10"];
  if (options.nomnomlStyle === "plain") {
    base.push(options.dark ? "#fill: #2b2a27; #232321" : "#fill: #ffffff; #f6f5f1", options.dark ? "#stroke: #ebe9e4" : "#stroke: #1d1d1b", "#font: Helvetica");
  } else if (options.dark) base.push("#fill: #3b3a36; #2b2a27", "#stroke: #ebe9e4");
  return `${base.join("\n")}\n`;
}

export async function renderNomnoml(code: string, options: RenderOptions): Promise<RenderResult> {
  const t0 = performance.now();
  lib ??= import("nomnoml");
  lib.catch(() => (lib = undefined));
  const nomnoml = await lib;
  const prefix = look(options);
  const offset = prefix.split("\n").length - 1;
  try {
    const svg = nomnoml.renderSvg(prefix + code);
    return { ok: true, svg, ms: performance.now() - t0 };
  } catch (err) {
    const e = err as { line?: number; column?: number; message?: string; expected?: string; actual?: string };
    if (typeof e.line === "number") {
      const line = e.line - offset;
      return { ok: false, message: `Expected ${e.expected} here, but found ${e.actual}.`, line, ms: performance.now() - t0 };
    }
    return { ok: false, message: e.message ?? String(err), ms: performance.now() - t0 };
  }
}

/** nomnoml text starts with a [box] or a #directive. */
export function isNomnoml(line: string): boolean {
  return /^\[[^\]]*\]/.test(line) || /^#(direction|fill|stroke|font|fontSize|edges|arrowSize|bendSize|spacing|padding|leading|lineWidth|zoom|gutter|ranker|acyclicer|title|background|gravity|visual)\s*:/.test(line);
}
