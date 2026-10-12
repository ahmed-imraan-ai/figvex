// PlantUML, via the official TeaVM build published as @plantuml/core.
//
// The engine is a plain ES module served from /vendor (see
// scripts/copy-plantuml.mjs). It shares internal state between calls, so
// renders must never overlap; `exclusive` below takes care of that.

import {
  PLANTUML_ENGINE_BASE,
  PLANTUML_SERVER,
  PLANTUML_STDLIB_LOCAL,
  PLANTUML_STDLIB_REMOTE,
} from "../config";
import { plantumlEncode } from "../lib/encode";
import { loadVizScript, renderGraphviz } from "./graphviz";
import type { RenderOptions, RenderResult } from "./types";

interface PlantUmlModule {
  render(lines: string[], targetId: string, options?: { dark?: boolean }): void;
  renderToString(lines: string[], onSuccess: (svg: string) => void, onError: (message: string) => void): void;
}

type StdlibLoader = (url: string, ok: () => void, err: (message: string) => void) => boolean;

declare global {
  interface Window {
    PLANTUML_STDLIB_BASE?: string;
    PLANTUML_STDLIB_LOADER?: StdlibLoader;
  }
}

const RENDER_TIMEOUT_MS = 20_000;

/**
 * Diagram types that exist in PlantUML but are not part of the browser build
 * yet. Matching them up front gives a clear message instead of a stack trace.
 */
const UNSUPPORTED: [RegExp, string][] = [
  [/^\s*@startsalt\b|^\s*salt\s*$/m, "Salt wireframes"],
  [/^\s*@startditaa\b|^\s*ditaa\b/m, "Ditaa"],
  [/^\s*@start(math|latex)\b/m, "Math and LaTeX formulas"],
  [/^\s*@startchen\b/m, "Chen ER diagrams"],
  [/^\s*@startfiles\b/m, "File trees"],
  [/^\s*@startchronology\b/m, "Chronology diagrams"],
  [/^\s*@startboard\b/m, "Board diagrams"],
  [/^\s*@startgit\b/m, "Git log diagrams"],
  [/^\s*@startwire\b/m, "Wire diagrams"],
  [/^\s*@starthcl\b/m, "HCL diagrams"],
  [/^\s*(nwdiag|packetdiag|rackdiag)\s*\{/m, "Network diagrams (nwdiag)"],
  [/^\s*!include(url)?\s+https?:/m, "Including files from a URL"],
];

export function unsupportedFeature(code: string): string | undefined {
  return UNSUPPORTED.find(([re]) => re.test(code))?.[1];
}

let enginePromise: Promise<PlantUmlModule> | undefined;
let loadedStdlib: Promise<Set<string>> | undefined;

export function isPlantUmlLoaded() {
  return enginePromise !== undefined;
}

export function loadPlantUml(): Promise<PlantUmlModule> {
  enginePromise ??= (async () => {
    installStdlibLoader();
    silenceEngineLogging();
    await loadVizScript();
    const url = new URL(`${PLANTUML_ENGINE_BASE}plantuml.js`, location.href).href;
    return (await import(/* @vite-ignore */ url)) as PlantUmlModule;
  })();
  enginePromise.catch(() => (enginePromise = undefined));
  return enginePromise;
}

function loadClassicScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.append(script);
  });
}

/**
 * Themes, emoji and OpenIconic ship with the engine. Stdlib bundles come from
 * our own /vendor folder when the build downloaded them, and from the official
 * PlantUML host otherwise.
 */
function installStdlibLoader() {
  window.PLANTUML_STDLIB_BASE = new URL(PLANTUML_ENGINE_BASE, location.href).href;
  window.PLANTUML_STDLIB_LOADER = (url, ok, err) => {
    if (!/^[\w.-]+\.min\.js$/.test(url)) return false;
    localStdlib()
      .then((files) => {
        const primary = files.has(url) ? PLANTUML_STDLIB_LOCAL : PLANTUML_STDLIB_REMOTE;
        return loadClassicScript(primary + url).catch(() =>
          primary === PLANTUML_STDLIB_REMOTE ? Promise.reject() : loadClassicScript(PLANTUML_STDLIB_REMOTE + url),
        );
      })
      .then(ok, () => err(`Could not download the "${url.replace(".min.js", "")}" library`));
    return true;
  };
}

function localStdlib(): Promise<Set<string>> {
  loadedStdlib ??= fetch(`${PLANTUML_STDLIB_LOCAL}manifest.json`)
    .then((res) => (res.ok ? res.json() : { files: [] }))
    .then((manifest: { files?: string[] }) => new Set(manifest.files ?? []))
    .catch(() => new Set<string>());
  return loadedStdlib;
}

/**
 * The browser build logs its internal timings ("[  12 ms] [TContext] ...")
 * through console.log. Drop those lines so the console stays useful.
 */
function silenceEngineLogging() {
  const original = console.log.bind(console);
  const noise = /^\[\s*\d+ ms\] |^PlantUML version \$version\$/;
  console.log = (...args: unknown[]) => {
    if (typeof args[0] === "string" && noise.test(args[0])) return;
    original(...args);
  };
}

// Renders run one at a time. While one is running, newer requests replace
// each other, so a burst of keystrokes costs at most two renders.
let running: Promise<unknown> = Promise.resolve();

function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const next = running.then(task, task);
  running = next.catch(() => undefined);
  return next;
}

/** True when there is nothing between @startxxx and @endxxx but comments. */
export function isEmptyDiagram(code: string): boolean {
  return !code.split(/\r?\n/).some((raw) => {
    const line = raw.trim();
    return line && !/^@(start|end)\w*/.test(line) && !line.startsWith("'");
  });
}

/**
 * Apply the user's chosen style by inserting `!theme name` right after the
 * @start line. Diagrams that pick their own theme are left alone. Returns a
 * function that maps line numbers in the styled text back to the editor.
 */
export function applyStyle(code: string, theme: string): { code: string; mapLine: (line: number) => number } {
  const identity = { code, mapLine: (line: number) => line };
  if (!theme || theme === "default" || /^\s*!theme\s/m.test(code)) return identity;
  const lines = code.split(/\r\n|\r|\n/);
  const start = lines.findIndex((l) => /^\s*@start\w+/.test(l));
  if (start < 0) return identity;
  lines.splice(start + 1, 0, `!theme ${theme}`);
  const startLine = start + 1; // 1-based line of @start
  return {
    code: lines.join("\n"),
    mapLine: (line) => (line > startLine + 1 ? line - 1 : Math.min(line, startLine)),
  };
}

/**
 * The DOT graph inside @startdot ... @enddot, and the 0-based line it starts
 * on. PlantUML hands these straight to Graphviz, so we do the same.
 */
export function dotBlock(code: string): { source: string; offset: number } | null {
  const lines = code.split(/\r\n|\r|\n/);
  const start = lines.findIndex((l) => /^\s*@startdot\b/.test(l));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^\s*@enddot\b/.test(l));
  return { source: lines.slice(start + 1, end < 0 ? undefined : end).join("\n"), offset: start + 1 };
}

export async function renderPlantUml(code: string, options: RenderOptions): Promise<RenderResult> {
  const started = performance.now();
  if (isEmptyDiagram(code)) return { ok: false, message: "", ms: 0 };

  const dot = dotBlock(code);
  if (dot) {
    const result = await renderGraphviz(dot.source, options);
    return result.ok ? result : { ...result, line: result.line && result.line + dot.offset };
  }

  const styled = applyStyle(code, options.plantumlTheme);
  const finish = (result: RenderResult): RenderResult =>
    result.ok ? { ...result, mapLine: styled.mapLine } : { ...result, line: result.line && styled.mapLine(result.line) };

  const missing = unsupportedFeature(code);
  if (missing) {
    if (options.serverFallback) return finish(await renderOnServer(styled.code, started));
    return {
      ok: false,
      unsupported: missing,
      message: `${missing} aren't available in the in-browser PlantUML engine yet.`,
      ms: 0,
    };
  }

  const engine = await loadPlantUml();
  const lines = styled.code.split("\n");

  return exclusive(async () => {
    const t0 = performance.now();
    let output: string;
    try {
      output = options.dark ? await renderDark(engine, lines) : await renderLight(engine, lines);
    } catch (err) {
      return { ok: false, message: cleanJavaError(String(err instanceof Error ? err.message : err)), ms: performance.now() - t0 };
    }
    return finish(interpretSvg(output, performance.now() - t0));
  });
}

function renderLight(engine: PlantUmlModule, lines: string[]): Promise<string> {
  return withTimeout(
    new Promise<string>((resolve, reject) => engine.renderToString(lines, resolve, (msg) => reject(new Error(msg)))),
  );
}

// renderToString has no dark option, so dark diagrams go through render()
// into an off-screen element.
let darkHost: HTMLDivElement | undefined;

function renderDark(engine: PlantUmlModule, lines: string[]): Promise<string> {
  if (!darkHost) {
    darkHost = document.createElement("div");
    darkHost.id = "plantuml-dark-host";
    darkHost.setAttribute("aria-hidden", "true");
    darkHost.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none";
    document.body.append(darkHost);
  }
  const host = darkHost;
  host.replaceChildren();
  return withTimeout(
    new Promise<string>((resolve, reject) => {
      const observer = new MutationObserver(() => {
        if (!host.firstChild) return;
        observer.disconnect();
        const svg = host.querySelector("svg");
        if (svg) {
          resolve(new XMLSerializer().serializeToString(svg));
        } else {
          reject(new Error(host.textContent || "Rendering failed"));
        }
        host.replaceChildren();
      });
      observer.observe(host, { childList: true, subtree: true });
      try {
        engine.render(lines, host.id, { dark: true });
      } catch (err) {
        observer.disconnect();
        reject(err);
      }
    }),
  );
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("PlantUML took too long to answer. The diagram may be too large.")),
      RENDER_TIMEOUT_MS,
    );
    promise.then(
      (v) => (clearTimeout(timer), resolve(v)),
      (e) => (clearTimeout(timer), reject(e)),
    );
  });
}

/**
 * PlantUML reports problems by drawing them: the error SVG echoes the source
 * in green and prints the message in red, with "(line N)" in a header line.
 */
export function interpretSvg(svg: string, ms: number): RenderResult {
  if (!svg.includes("[From ") && !svg.includes("Diagram not supported")) {
    return { ok: true, svg, ms };
  }
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const texts = [...doc.querySelectorAll("text")];
  const header = texts.find((t) => /^\[From .*\(line \d+\)/.test(t.textContent ?? ""));
  if (header) {
    const line = Number(header.textContent!.match(/\(line (\d+)\)/)![1]);
    const message =
      texts
        .filter((t) => /^#?(f00|ff0000)$/i.test(t.getAttribute("fill") ?? ""))
        .map((t) => (t.textContent ?? "").trim())
        .filter(Boolean)
        .join(" ") || "Syntax error";
    return { ok: false, line, message: tidyMessage(message), ms };
  }
  if (texts.some((t) => /Diagram not supported by this release/.test(t.textContent ?? ""))) {
    const directive = texts.map((t) => t.textContent ?? "").find((t) => t.includes("@start"))?.match(/@start\w+/)?.[0];
    return {
      ok: false,
      message: directive
        ? `"${directive}" isn't recognised by the in-browser PlantUML engine.`
        : "This diagram type isn't recognised by the in-browser PlantUML engine.",
      ms,
    };
  }
  return { ok: true, svg, ms };
}

function tidyMessage(message: string): string {
  return message.replace(/^Syntax Error\?/, "Syntax error").replace(/\s+/g, " ").trim();
}

function cleanJavaError(message: string): string {
  const text = message.replace(/^(java\.[\w.]+|[\w.]+Exception):\s*/, "");
  if (/Unsupported diagram type/i.test(text)) return "This diagram type isn't available in the in-browser PlantUML engine yet.";
  return text || "PlantUML could not draw this diagram.";
}

/** Opt-in path for the diagram types the browser engine can't draw yet. */
async function renderOnServer(code: string, started: number): Promise<RenderResult> {
  try {
    const encoded = await plantumlEncode(code);
    const res = await fetch(`${PLANTUML_SERVER}/svg/${encoded}`);
    const svg = await res.text();
    if (!svg.includes("<svg")) throw new Error(`The PlantUML server answered with HTTP ${res.status}`);
    const result = interpretSvg(svg, performance.now() - started);
    return result.ok ? { ...result, remote: true } : result;
  } catch (err) {
    return {
      ok: false,
      message: `Couldn't reach the PlantUML server (${err instanceof Error ? err.message : err}).`,
      ms: performance.now() - started,
    };
  }
}

export async function plantumlServerUrl(code: string, format: "svg" | "png"): Promise<string> {
  return `${PLANTUML_SERVER}/${format}/${await plantumlEncode(code)}`;
}
