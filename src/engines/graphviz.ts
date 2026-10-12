// Graphviz, via the Viz.js build that ships with @plantuml/core. It is a
// classic script that defines window.Viz, so DOT costs no extra download
// once PlantUML has run, and PlantUML-free sessions skip the 4 MB engine.

import { PLANTUML_ENGINE_BASE } from "../config";
import type { RenderOptions, RenderResult } from "./types";

interface VizRenderResult {
  status: "success" | "failure";
  output?: string;
  errors: { level?: "error" | "warning"; message: string }[];
}

export interface VizInstance {
  render(source: string, options?: { format?: string }): VizRenderResult;
}

declare global {
  interface Window {
    Viz?: { instance(): Promise<VizInstance> };
  }
}

let scriptPromise: Promise<void> | undefined;
let vizPromise: Promise<VizInstance> | undefined;

/** Loads viz-global.js once. PlantUML needs it too and calls this first. */
export function loadVizScript(): Promise<void> {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    if (window.Viz) return resolve();
    const script = document.createElement("script");
    script.src = `${PLANTUML_ENGINE_BASE}viz-global.js`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Graphviz."));
    document.head.append(script);
  });
  scriptPromise.catch(() => (scriptPromise = undefined));
  return scriptPromise;
}

export function loadGraphviz(): Promise<VizInstance> {
  vizPromise ??= loadVizScript().then(() => {
    if (!window.Viz) throw new Error("Could not load Graphviz.");
    return window.Viz.instance();
  });
  vizPromise.catch(() => (vizPromise = undefined));
  return vizPromise;
}

export function isGraphvizLoaded() {
  return vizPromise !== undefined;
}

/** Default attributes per style and tone. Attributes in the source still win. */
export function defaultAttributes(options: Pick<RenderOptions, "dark" | "graphvizStyle">): string {
  const font = options.graphvizStyle === "plain" ? ' fontname="Helvetica"' : "";
  const ink = options.dark ? ' color="#d6d3cb" fontcolor="#ebe9e4"' : "";
  const fill = options.dark ? ' fillcolor="#3b3a36"' : "";
  return `graph [bgcolor="transparent"${font}${ink}] node [${font}${ink}${fill}] edge [${font}${ink}]`.replace(/\[ /g, "[");
}

/**
 * Index just after the `{` that opens the top-level graph, skipping comments
 * and quoted or HTML IDs. Returns -1 when there is no opening brace.
 */
export function openingBrace(source: string): number {
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === "{") return i + 1;
    if (c === "/" && source[i + 1] === "/") i = lineEnd(source, i);
    else if (c === "#" && atLineStart(source, i)) i = lineEnd(source, i);
    else if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end < 0) return -1;
      i = end + 1;
    } else if (c === '"') {
      i++;
      while (i < source.length && source[i] !== '"') i += source[i] === "\\" ? 2 : 1;
    } else if (c === "<") {
      let depth = 1;
      while (depth && ++i < source.length) depth += source[i] === "<" ? 1 : source[i] === ">" ? -1 : 0;
    }
  }
  return -1;
}

function lineEnd(source: string, from: number): number {
  const end = source.indexOf("\n", from);
  return end < 0 ? source.length : end;
}

function atLineStart(source: string, i: number): boolean {
  const start = source.lastIndexOf("\n", i - 1) + 1;
  return !source.slice(start, i).trim();
}

/**
 * Adds the default attributes straight after the opening brace, on the same
 * line, so line numbers in Graphviz errors still match the editor.
 */
export function applyDefaults(source: string, options: Pick<RenderOptions, "dark" | "graphvizStyle">): string {
  const at = openingBrace(source);
  if (at < 0) return source;
  return `${source.slice(0, at)} ${defaultAttributes(options)}; ${source.slice(at)}`;
}

export async function renderGraphviz(code: string, options: RenderOptions): Promise<RenderResult> {
  const viz = await loadGraphviz();
  const t0 = performance.now();
  let result: VizRenderResult;
  try {
    result = viz.render(applyDefaults(code, options), { format: "svg" });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err), ms: performance.now() - t0 };
  }
  const ms = performance.now() - t0;
  if (result.status === "success" && result.output) {
    // Drop the XML prolog, doctype and generator comment.
    const start = result.output.indexOf("<svg");
    return { ok: true, svg: start >= 0 ? result.output.slice(start) : result.output, ms };
  }
  return { ok: false, ...describeError(result.errors, code), ms };
}

export function describeError(errors: VizRenderResult["errors"], code: string): { message: string; line?: number } {
  const error = errors.find((e) => e.level === "error") ?? errors[0];
  const raw = (error?.message ?? "Graphviz could not draw this graph.").trim();
  const syntax = raw.match(/^syntax error in line (\d+)(?: near '(.*)')?/i);
  if (!syntax) return { message: capitalise(raw) };

  const line = Number(syntax[1]);
  const near = syntax[2];
  if (!/^\s*(\/\/.*\n\s*|\/\*[\s\S]*?\*\/\s*|#.*\n\s*)*(strict\s+)?(di)?graph\b/i.test(code)) {
    return { message: "A DOT file starts with graph or digraph, then the graph in braces: digraph G { a -> b }", line };
  }
  if (near === undefined) {
    return { message: "The graph ends too early. Check for a missing } or a quote that isn't closed.", line };
  }
  if (near === "->" && /^\s*(strict\s+)?graph\b/i.test(code)) {
    return { message: "-> only works in a digraph. Use -- in a graph, or change graph to digraph.", line };
  }
  if (near === "--" && /^\s*(strict\s+)?digraph\b/i.test(code)) {
    return { message: "-- only works in a graph. Use -> in a digraph, or change digraph to graph.", line };
  }
  return { message: `Unexpected ${near.length > 40 ? `${near.slice(0, 40)}…` : `"${near}"`}.`, line };
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
