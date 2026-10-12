// Mermaid is loaded on first use so PlantUML-only sessions never download it.

import type { MermaidConfig } from "mermaid";
import type { MermaidTheme, RenderOptions, RenderResult } from "./types";

type MermaidApi = typeof import("mermaid").default;

let mermaidPromise: Promise<MermaidApi> | undefined;
let lastConfigKey = "";
let counter = 0;

export function loadMermaid(): Promise<MermaidApi> {
  mermaidPromise ??= import("mermaid").then((m) => m.default);
  mermaidPromise.catch(() => (mermaidPromise = undefined));
  return mermaidPromise;
}

/** Mermaid themes that have their own dark variant; the rest use "dark". */
const DARK_VARIANT: Partial<Record<MermaidTheme, MermaidConfig["theme"]>> = {
  neo: "neo-dark",
  redux: "redux-dark",
  "redux-color": "redux-dark-color",
};

function configure(mermaid: MermaidApi, options: RenderOptions) {
  const key = `${options.dark}|${options.look}|${options.mermaidTheme}`;
  if (key === lastConfigKey) return;
  lastConfigKey = key;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: options.dark ? (DARK_VARIANT[options.mermaidTheme] ?? "dark") : options.mermaidTheme,
    look: options.look,
    // Plain SVG text instead of HTML labels, so PNG and PDF exports match
    // the preview exactly.
    htmlLabels: false,
    suppressErrorRendering: true,
    fontFamily: '"IBM Plex Sans", "Segoe UI", Helvetica, Arial, sans-serif',
  });
}

let running: Promise<unknown> = Promise.resolve();

export async function renderMermaid(code: string, options: RenderOptions): Promise<RenderResult> {
  const mermaid = await loadMermaid();
  const task = async (): Promise<RenderResult> => {
    configure(mermaid, options);
    const id = `mmd-${++counter}`;
    const t0 = performance.now();
    try {
      const { svg } = await mermaid.render(id, code);
      return { ok: true, svg, ms: performance.now() - t0 };
    } catch (err) {
      return { ok: false, ...describeError(err), ms: performance.now() - t0 };
    } finally {
      // Mermaid leaves its scratch container behind when parsing fails.
      document.getElementById(`d${id}`)?.remove();
      document.getElementById(id)?.remove();
    }
  };
  const next = running.then(task, task);
  running = next.catch(() => undefined);
  return next;
}

interface MermaidError {
  message?: string;
  str?: string;
  hash?: { loc?: { first_line?: number }; line?: number };
}

export function describeError(err: unknown): { message: string; line?: number } {
  const e = (err ?? {}) as MermaidError;
  const raw = String(e.message ?? e.str ?? err ?? "Mermaid could not draw this diagram.");
  const line =
    e.hash?.loc?.first_line ??
    (e.hash?.line != null ? e.hash.line + 1 : undefined) ??
    numberFrom(raw.match(/line (\d+)/i)) ??
    numberFrom(raw.match(/at line:? ?(\d+)/i));

  if (/No diagram type detected/i.test(raw)) {
    return {
      message: "Mermaid doesn't recognise the first line. Start with a diagram type such as flowchart, sequenceDiagram or classDiagram.",
    };
  }
  // Jison errors look like "Parse error on line 2:\n<source>\n----^\nExpecting
  // 'A', 'B', got 'C'". The line number is shown separately, so keep only a
  // readable version of the last line.
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (/^Parse error on line/i.test(lines[0] ?? "") && lines.length > 1) {
    const last = lines[lines.length - 1];
    const got = last.match(/got '([^']+)'/)?.[1];
    const expected = [...last.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((t) => t !== got);
    if (got) {
      const list = expected.slice(0, 5).join(", ") + (expected.length > 5 ? ", …" : "");
      return { message: `Unexpected ${got.toLowerCase()}${list ? `. Expected ${list}` : ""}.`, line };
    }
    return { message: last, line };
  }
  return { message: lines.join(" "), line };
}

function numberFrom(match: RegExpMatchArray | null): number | undefined {
  return match ? Number(match[1]) : undefined;
}
