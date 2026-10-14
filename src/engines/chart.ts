// Data charts, drawn by Apache ECharts. A chart is an ECharts option object
// written as JSON. Comments and trailing commas are allowed, and CSV data can
// follow a line of three dashes:
//
//   { "xAxis": { "type": "category" }, "yAxis": {}, "series": [{ "type": "bar" }] }
//   ---
//   language,students
//   Python,120
//
// This file parses the text. ECharts itself loads on first use from
// chart-runtime.ts, so other diagram types never download it.

import { applyStats, StatError } from "./chart-stats";
import type { ChartStyle, RenderOptions, RenderResult } from "./types";

/** Series types registered in chart-runtime.ts. */
export const SERIES_TYPES = [
  "bar", "line", "pie", "scatter", "radar", "boxplot", "heatmap", "candlestick", "funnel", "gauge",
  "sankey", "graph", "tree", "treemap", "sunburst", "parallel", "themeRiver",
] as const;

export const DEFAULT_SIZE = { width: 720, height: 440 };
const MAX_SIZE = 4000;

/** Okabe and Ito's palette, readable with the common kinds of colour blindness. */
const PALETTES: Record<Exclude<ChartStyle, "default">, string[]> = {
  "colour-blind": ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00", "#F0E442", "#000000"],
  greyscale: ["#1f1f1f", "#7a7a7a", "#b5b5b5", "#4d4d4d", "#9a9a9a", "#d4d4d4"],
};
const PALETTES_DARK: Partial<Record<ChartStyle, string[]>> = {
  "colour-blind": ["#56B4E9", "#E69F00", "#009E73", "#CC79A7", "#F0E442", "#D55E00", "#0072B2", "#ffffff"],
  greyscale: ["#f2f2f2", "#a6a6a6", "#6e6e6e", "#d0d0d0", "#8a8a8a", "#505050"],
};

export class ChartError extends Error {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(message);
  }
}

export interface ParsedChart {
  option: Record<string, unknown>;
  width: number;
  height: number;
}

/**
 * Blank out // and /* *\/ comments and drop trailing commas, keeping every
 * other character where it was so error positions still match the editor.
 */
export function stripJsonc(text: string): string {
  const out = text.split("");
  let i = 0;
  let lastSignificant = -1; // index of the last non-space character kept
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      i++;
      while (i < text.length && text[i] !== '"' && text[i] !== "\n") i += text[i] === "\\" ? 2 : 1;
      lastSignificant = Math.min(i, text.length - 1);
      i++;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") out[i++] = " ";
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end < 0 ? text.length : end + 2;
      for (; i < stop; i++) if (text[i] !== "\n") out[i] = " ";
      continue;
    }
    if ((c === "}" || c === "]") && lastSignificant >= 0 && text[lastSignificant] === ",") {
      out[lastSignificant] = " ";
    }
    if (!/\s/.test(c)) lastSignificant = i;
    i++;
  }
  return out.join("");
}

/** 1-based line of a character offset. */
export function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text[i] === "\n") line++;
  return line;
}

/** Split the source into the JSON part and the CSV after a `---` line. */
export function splitSource(code: string): { json: string; csv: string | null; csvLine: number } {
  const lines = code.split(/\r\n|\r|\n/);
  const sep = lines.findIndex((l) => /^\s*---\s*$/.test(l));
  if (sep < 0) return { json: lines.join("\n"), csv: null, csvLine: 0 };
  return { json: lines.slice(0, sep).join("\n"), csv: lines.slice(sep + 1).join("\n"), csvLine: sep + 2 };
}

/**
 * Parse CSV (or tab-separated) text into rows. Numbers become numbers and
 * empty cells become null, which ECharts treats as missing.
 */
export function parseCsv(text: string): (string | number | null)[][] {
  const body = text.replace(/^\s*\n/, "").replace(/\s+$/, "");
  if (!body) return [];
  const delimiter = body.split("\n", 1)[0].includes("\t") ? "\t" : ",";
  const rows: (string | number | null)[][] = [];
  let row: (string | number | null)[] = [];
  let cell = "";
  let quoted = false;
  let wasQuoted = false;
  const push = () => {
    row.push(convert(cell, wasQuoted));
    cell = "";
    wasQuoted = false;
  };
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quoted) {
      if (c === '"' && body[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cell += c;
      }
    } else if (c === '"' && !cell.trim()) {
      quoted = true;
      wasQuoted = true;
      cell = "";
    } else if (c === delimiter) {
      push();
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && body[i + 1] === "\n") i++;
      push();
      rows.push(row);
      row = [];
    } else {
      cell += c;
    }
  }
  push();
  rows.push(row);
  return rows.filter((r) => r.some((v) => v !== null));
}

function convert(raw: string, quoted: boolean): string | number | null {
  if (quoted) return raw;
  const value = raw.trim();
  if (!value) return null;
  return /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(value) ? Number(value) : value;
}

/** Parse the editor text into an ECharts option, or throw a ChartError. */
export function parseChart(code: string): ParsedChart {
  const { json, csv, csvLine } = splitSource(code);
  const stripped = stripJsonc(json);
  if (!stripped.trim()) throw new ChartError("Write the chart as a JSON object, starting with {.", 1);

  let value: unknown;
  try {
    value = JSON.parse(stripped);
  } catch (err) {
    throw jsonError(err, stripped);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ChartError("The chart must be a JSON object, in braces { }.", firstLine(stripped));
  }
  const option = value as Record<string, unknown>;

  const width = size(option.width, DEFAULT_SIZE.width, "width", json);
  const height = size(option.height, DEFAULT_SIZE.height, "height", json);
  delete option.width;
  delete option.height;

  if (csv !== null) attachCsv(option, csv, csvLine);
  try {
    applyStats(option);
  } catch (err) {
    if (err instanceof StatError) throw new ChartError(err.message, keyLine(json, "type", err.type));
    throw err;
  }
  checkSeries(option, json);
  return { option, width, height };
}

function jsonError(err: unknown, text: string): ChartError {
  const message = err instanceof Error ? err.message : String(err);
  const position = Number(message.match(/position (\d+)/)?.[1]);
  const line = Number.isFinite(position) ? lineAt(text, position) : undefined;
  // V8: "Expected ',' or '}' after property value in JSON at position 45 (line 3 column 5)"
  const reason = message
    .replace(/\s*in JSON at position \d+.*$/s, "")
    .replace(/^JSON\.parse: /, "")
    .replace(/, "[\s\S]*" is not valid JSON$/, "");
  const end = text.trimEnd().length;
  if (/Unexpected end of JSON input/i.test(message) || position >= end) {
    return new ChartError("The JSON ends too early. Check for a missing } or ].", lineAt(text, end));
  }
  if (/Expected (double-quoted )?property name/i.test(message) && /^[A-Za-z_$]/.test(text.slice(position).trimStart())) {
    return new ChartError(`${reason}. Property names need double quotes, like "series".`, line);
  }
  return new ChartError(`${reason.charAt(0).toUpperCase()}${reason.slice(1)}.`.replace(/\.\.$/, "."), line);
}

function firstLine(text: string): number {
  const at = text.search(/\S/);
  return at < 0 ? 1 : lineAt(text, at);
}

function size(value: unknown, fallback: number, name: string, json: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 50 || value > MAX_SIZE) {
    throw new ChartError(`"${name}" must be a number of pixels between 50 and ${MAX_SIZE}.`, keyLine(json, name));
  }
  return Math.round(value);
}

/** Line of the first `"key":` in the source, for error markers. */
function keyLine(json: string, key: string, value?: string): number | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tail = value ? `\\s*"${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"` : "";
  const at = json.search(new RegExp(`"${escaped}"\\s*:${tail}`));
  return at < 0 ? undefined : lineAt(json, at);
}

function attachCsv(option: Record<string, unknown>, csv: string, csvLine: number) {
  const rows = parseCsv(csv);
  if (!rows.length) throw new ChartError("There's a --- line but no CSV data under it.", csvLine - 1);
  const width = rows[0].length;
  const ragged = rows.findIndex((r) => r.length !== width);
  if (ragged >= 0) {
    throw new ChartError(`This CSV row has ${rows[ragged].length} values, but the header has ${width}.`, csvLine + ragged);
  }
  const dataset = option.dataset;
  if (dataset === undefined) option.dataset = { source: rows };
  else if (Array.isArray(dataset)) {
    if (dataset[0] && typeof dataset[0] === "object" && !("source" in dataset[0])) dataset[0].source = rows;
    else dataset.unshift({ source: rows });
  } else if (dataset && typeof dataset === "object" && !("source" in dataset)) {
    (dataset as Record<string, unknown>).source = rows;
  } else {
    throw new ChartError('The chart has CSV data and also "dataset.source". Use one or the other.', csvLine - 1);
  }
}

function checkSeries(option: Record<string, unknown>, json: string) {
  const series = option.series;
  if (series === undefined) {
    throw new ChartError('Add a "series" list saying what to draw, for example "series": [{ "type": "bar" }].', firstLine(json));
  }
  const list = Array.isArray(series) ? series : [series];
  for (const s of list) {
    const type = s && typeof s === "object" ? (s as { type?: unknown }).type : undefined;
    if (typeof type !== "string") {
      throw new ChartError('Each series needs a "type", such as "bar", "line" or "pie".', keyLine(json, "series"));
    }
    if (!(SERIES_TYPES as readonly string[]).includes(type)) {
      throw new ChartError(
        `"${type}" isn't a chart type Figvex includes. Use one of: ${SERIES_TYPES.join(", ")}.`,
        keyLine(json, "type", type),
      );
    }
  }
}

/** Defaults that sit under the user's own settings. */
export function baseOption(options: Pick<RenderOptions, "dark" | "chartStyle">): Record<string, unknown> {
  const base: Record<string, unknown> = { animation: false, backgroundColor: "transparent" };
  if (options.chartStyle !== "default") {
    base.color = (options.dark ? PALETTES_DARK[options.chartStyle] : undefined) ?? PALETTES[options.chartStyle];
  }
  return base;
}

type Runtime = typeof import("./chart-runtime");
let runtimePromise: Promise<Runtime> | undefined;

export function loadCharts(): Promise<Runtime> {
  runtimePromise ??= import("./chart-runtime");
  runtimePromise.catch(() => (runtimePromise = undefined));
  return runtimePromise;
}

export async function renderChart(code: string, options: RenderOptions): Promise<RenderResult> {
  const t0 = performance.now();
  let parsed: ParsedChart;
  try {
    parsed = parseChart(code);
  } catch (err) {
    if (err instanceof ChartError) return { ok: false, message: err.message, line: err.line, ms: performance.now() - t0 };
    throw err;
  }
  const runtime = await loadCharts();
  const t1 = performance.now();
  try {
    const svg = runtime.renderSvg({ ...baseOption(options), ...parsed.option }, parsed.width, parsed.height, options.dark);
    return { ok: true, svg, ms: performance.now() - t1 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `ECharts couldn't draw this chart: ${message}`, ms: performance.now() - t1 };
  }
}
