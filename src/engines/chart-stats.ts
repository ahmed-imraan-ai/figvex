// Statistical transforms for charts. A dataset entry like
//
//   { "transform": { "type": "stat:histogram", "config": { "dimension": "mark", "width": 10 } } }
//
// is replaced by the computed table before ECharts sees the option, so raw
// data from the CSV can be summarised without working the numbers out by
// hand. "{equation}" and "{r2}" in a series' text show its trend line.

import { boxSummary, density, histogram, regression, sig, type RegressionMethod } from "./stats";

type Row = unknown[];
type Table = { header: string[]; rows: Row[] };

export const STAT_TRANSFORMS = ["stat:histogram", "stat:boxplot", "stat:regression", "stat:density"] as const;

export class StatError extends Error {
  constructor(
    message: string,
    readonly type: string,
  ) {
    super(message);
  }
}

function readTable(source: unknown, type: string): Table {
  if (!Array.isArray(source) || !source.length) throw new StatError(`${type} needs data: CSV under a --- line, or a "source" in the dataset it reads.`, type);
  if (Array.isArray(source[0])) {
    const first = source[0] as unknown[];
    const hasHeader = first.every((v) => typeof v === "string") && source.length > 1;
    return hasHeader ? { header: first.map(String), rows: source.slice(1) as Row[] } : { header: first.map((_, i) => String(i)), rows: source as Row[] };
  }
  if (typeof source[0] === "object" && source[0]) {
    const header = Object.keys(source[0] as object);
    return { header, rows: (source as Record<string, unknown>[]).map((o) => header.map((h) => o[h])) };
  }
  throw new StatError(`${type} reads a table: rows of values, or objects.`, type);
}

function column(t: Table, dim: unknown, type: string, what: string): number {
  if (typeof dim === "number" && dim >= 0 && dim < t.header.length) return dim;
  if (typeof dim === "string") {
    const i = t.header.indexOf(dim);
    if (i >= 0) return i;
  }
  throw new StatError(`${type}: there's no column ${JSON.stringify(dim)} for ${what}. The columns are ${t.header.map((h) => JSON.stringify(h)).join(", ")}.`, type);
}

const toNumber = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
const numbers = (t: Table, c: number) => t.rows.map((r) => toNumber(r[c])).filter((x) => Number.isFinite(x));

/** The first column that holds numbers, when none is named. */
function firstNumeric(t: Table): number {
  const i = t.header.findIndex((_, c) => numbers(t, c).length > 0);
  return i < 0 ? 0 : i;
}

const range = (from: number, to: number) => `${sig(from, 4)}–${sig(to, 4)}`;

interface Fit {
  equation: string;
  r2: string;
}

export function applyStats(option: Record<string, unknown>): void {
  const ds = option.dataset;
  if (!Array.isArray(ds)) {
    const t = (ds as { transform?: { type?: unknown } } | undefined)?.transform;
    if (t && typeof t.type === "string" && t.type.startsWith("stat:")) throw new StatError(`${t.type} reads another dataset. Make "dataset" a list: the data first, then this transform.`, t.type);
    return;
  }
  const fits = new Map<number, Fit>();
  const extra: Record<string, unknown>[] = [];
  ds.forEach((d: Record<string, unknown>, i: number) => {
    const t = d?.transform as { type?: unknown; config?: Record<string, unknown> } | undefined;
    if (!t || typeof t.type !== "string" || !t.type.startsWith("stat:")) return;
    const type = t.type;
    if (!(STAT_TRANSFORMS as readonly string[]).includes(type)) throw new StatError(`"${type}" isn't a statistics transform. Use ${STAT_TRANSFORMS.join(", ")}.`, type);
    const fromId = d.fromDatasetId;
    const fromIndex = typeof fromId === "string" ? ds.findIndex((o: Record<string, unknown>) => o?.id === fromId) : typeof d.fromDatasetIndex === "number" ? d.fromDatasetIndex : 0;
    if (fromIndex < 0 || fromIndex >= i) throw new StatError(`${type} reads a dataset that comes before it in the list.`, type);
    const table = readTable(ds[fromIndex].source, type);
    const cfg = t.config ?? {};
    const id = typeof d.id === "string" ? d.id : undefined;
    let source: unknown[][];

    switch (type) {
      case "stat:histogram": {
        const c = cfg.dimension === undefined ? firstNumeric(table) : column(table, cfg.dimension, type, "the values");
        const xs = numbers(table, c);
        const bins = histogram(xs, {
          bins: typeof cfg.bins === "number" ? cfg.bins : undefined,
          width: typeof cfg.width === "number" ? cfg.width : undefined,
          start: typeof cfg.start === "number" ? cfg.start : undefined,
        });
        const w = bins.length ? bins[0].to - bins[0].from : 1;
        source = [["bin", "count", "percent", "density", "from", "to"], ...bins.map((b) => [range(b.from, b.to), b.count, (100 * b.count) / xs.length, b.count / (xs.length * w), b.from, b.to])];
        break;
      }
      case "stat:boxplot": {
        const whiskers = cfg.whiskers === "minmax" ? "minmax" : "tukey";
        const groups: [string, number[]][] = [];
        if (cfg.group !== undefined) {
          const g = column(table, cfg.group, type, "the groups");
          const v = column(table, cfg.value ?? firstNumeric(table), type, "the values");
          const by = new Map<string, number[]>();
          for (const r of table.rows) {
            const x = toNumber(r[v]);
            if (!Number.isFinite(x)) continue;
            const key = String(r[g]);
            if (!by.has(key)) by.set(key, []);
            by.get(key)!.push(x);
          }
          groups.push(...by.entries());
        } else {
          const dims = Array.isArray(cfg.dimensions) ? cfg.dimensions : table.header.map((_, c) => c).filter((c) => numbers(table, c).length);
          for (const dim of dims) {
            const c = column(table, dim, type, "a group");
            groups.push([table.header[c], numbers(table, c)]);
          }
        }
        const empty = groups.find(([, xs]) => !xs.length);
        if (empty) throw new StatError(`${type}: "${empty[0]}" has no numbers.`, type);
        const sums = groups.map(([name, xs]) => [name, boxSummary(xs, whiskers)] as const);
        source = [["group", "low", "q1", "median", "q3", "high", "n"], ...sums.map(([name, s]) => [name, s.low, s.q1, s.median, s.q3, s.high, s.n])];
        // Outliers go in their own dataset for a scatter series.
        extra.push({ id: `${id ?? `stat${i}`}-outliers`, source: [["group", "value"], ...sums.flatMap(([name, s]) => s.outliers.map((o) => [name, o]))] });
        break;
      }
      case "stat:regression": {
        const xc = column(table, cfg.x ?? 0, type, "x");
        const yc = column(table, cfg.y ?? 1, type, "y");
        const pairs = table.rows.map((r) => [toNumber(r[xc]), toNumber(r[yc])]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
        const method = (typeof cfg.method === "string" ? cfg.method : "linear") as RegressionMethod;
        if (!["linear", "polynomial", "exponential", "logarithmic", "power"].includes(method)) throw new StatError(`${type}: "method" is linear, polynomial, exponential, logarithmic or power.`, type);
        let fit;
        try {
          fit = regression(pairs.map((p) => p[0]), pairs.map((p) => p[1]), method, typeof cfg.order === "number" ? cfg.order : 2);
        } catch (err) {
          throw new StatError(`${type}: ${err instanceof Error ? err.message : String(err)}`, type);
        }
        const xs = pairs.map((p) => p[0]);
        const lo = Math.min(...xs);
        const hi = Math.max(...xs);
        const points = typeof cfg.points === "number" ? cfg.points : method === "linear" ? 2 : 60;
        source = [["x", "y"], ...[...Array(points)].map((_, k) => {
          const x = lo + ((hi - lo) * k) / Math.max(1, points - 1);
          return [x, fit.predict(x)];
        })];
        fits.set(i, { equation: fit.equation, r2: fit.r2.toFixed(3) });
        break;
      }
      case "stat:density": {
        const c = cfg.dimension === undefined ? firstNumeric(table) : column(table, cfg.dimension, type, "the values");
        const xs = numbers(table, c);
        if (xs.length < 2) throw new StatError(`${type} needs at least two values.`, type);
        source = [["x", "density"], ...density(xs, { bandwidth: typeof cfg.bandwidth === "number" ? cfg.bandwidth : undefined, points: typeof cfg.points === "number" ? cfg.points : undefined })];
        break;
      }
      default:
        return;
    }
    ds[i] = { ...(id ? { id } : {}), source };
  });
  ds.push(...extra);
  if (fits.size) fillEquations(option, ds, fits);
}

/** Replaces {equation} and {r2} in each series with its own trend line's, and elsewhere with the first. */
function fillEquations(option: Record<string, unknown>, ds: Record<string, unknown>[], fits: Map<number, Fit>) {
  const fill = (value: unknown, fit: Fit): unknown => {
    if (typeof value === "string") return value.replace(/\{equation\}/g, fit.equation).replace(/\{r2\}/g, fit.r2);
    if (Array.isArray(value)) return value.map((v) => fill(v, fit));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, fit)]));
    return value;
  };
  const first = [...fits.values()][0];
  const series = option.series;
  const list = Array.isArray(series) ? series : series ? [series] : [];
  const filled = list.map((s: Record<string, unknown>) => {
    const index = typeof s.datasetId === "string" ? ds.findIndex((d) => d.id === s.datasetId) : typeof s.datasetIndex === "number" ? s.datasetIndex : -1;
    return fill(s, fits.get(index) ?? first);
  });
  for (const key of Object.keys(option)) if (key !== "series") option[key] = fill(option[key], first);
  option.series = Array.isArray(series) ? filled : filled[0];
}
