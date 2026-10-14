// Statistics for charts drawn from raw data: quartiles and box plots,
// histogram bins, kernel density and least-squares regression. Pure
// functions, no dependencies.

export const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
export const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Sample standard deviation (n - 1). */
export function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Quantile by linear interpolation between order statistics (R type 7, Excel QUARTILE.INC). */
export function quantile(sortedXs: number[], p: number): number {
  if (!sortedXs.length) return NaN;
  const h = (sortedXs.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sortedXs[lo] + (h - lo) * (sortedXs[hi] - sortedXs[lo]);
}

export interface BoxSummary {
  low: number;
  q1: number;
  median: number;
  q3: number;
  high: number;
  outliers: number[];
  n: number;
}

/** Five-number summary. With "tukey", whiskers stop at the last point within 1.5 IQR and the rest are outliers. */
export function boxSummary(xs: number[], whiskers: "tukey" | "minmax" = "tukey"): BoxSummary {
  const s = sorted(xs);
  const q1 = quantile(s, 0.25);
  const median = quantile(s, 0.5);
  const q3 = quantile(s, 0.75);
  if (whiskers === "minmax") return { low: s[0], q1, median, q3, high: s[s.length - 1], outliers: [], n: s.length };
  const iqr = q3 - q1;
  const inside = s.filter((x) => x >= q1 - 1.5 * iqr && x <= q3 + 1.5 * iqr);
  return {
    low: inside[0] ?? q1,
    q1,
    median,
    q3,
    high: inside[inside.length - 1] ?? q3,
    outliers: s.filter((x) => x < q1 - 1.5 * iqr || x > q3 + 1.5 * iqr),
    n: s.length,
  };
}

/** A round step near the target: 1, 2, 2.5 or 5 times a power of ten. */
export function niceStep(target: number): number {
  if (!(target > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(target));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= target) return m * p;
  return 10 * p;
}

export interface Bin {
  from: number;
  to: number;
  count: number;
}

/**
 * Histogram bins. Give a bin width, a number of bins, or neither for
 * Sturges' rule. Bins include their lower edge; the last includes both.
 */
export function histogram(xs: number[], opts: { bins?: number; width?: number; start?: number } = {}): Bin[] {
  if (!xs.length) return [];
  const s = sorted(xs);
  const min = s[0];
  const max = s[s.length - 1];
  const count = opts.bins ?? Math.ceil(Math.log2(s.length) + 1);
  const width = opts.width ?? (max > min ? niceStep((max - min) / count) : 1);
  const start = opts.start ?? Math.floor(min / width) * width;
  // The largest value lands in the last bin even when it's on its upper edge.
  const n = Math.max(1, Math.ceil((max - start) / width - 1e-9));
  const bins: Bin[] = [...Array(n)].map((_, i) => ({ from: start + i * width, to: start + (i + 1) * width, count: 0 }));
  for (const x of s) {
    let i = Math.floor((x - start) / width + 1e-9);
    if (i >= n) i = n - 1;
    if (i >= 0) bins[i].count++;
  }
  return bins;
}

/** Gaussian kernel density, with Silverman's rule for the bandwidth unless one is given. */
export function density(xs: number[], opts: { bandwidth?: number; points?: number } = {}): [number, number][] {
  const s = sorted(xs);
  const n = s.length;
  if (!n) return [];
  const spread = Math.min(sd(s), (quantile(s, 0.75) - quantile(s, 0.25)) / 1.34) || sd(s) || 1;
  const h = opts.bandwidth ?? 0.9 * spread * n ** -0.2;
  const lo = s[0] - 3 * h;
  const hi = s[n - 1] + 3 * h;
  const points = opts.points ?? 100;
  const out: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const x = lo + ((hi - lo) * i) / points;
    let sum = 0;
    for (const v of s) sum += Math.exp(-0.5 * ((x - v) / h) ** 2);
    out.push([x, sum / (n * h * Math.sqrt(2 * Math.PI))]);
  }
  return out;
}

export type RegressionMethod = "linear" | "polynomial" | "exponential" | "logarithmic" | "power";

export interface Regression {
  method: RegressionMethod;
  /** Coefficients: linear [a, b] for a + bx; polynomial [c0, c1, ...]; exponential [a, b] for a·e^(bx); logarithmic [a, b] for a + b ln x; power [a, b] for a·x^b. */
  coef: number[];
  r2: number;
  predict: (x: number) => number;
  equation: string;
}

/** Solves A x = b by Gaussian elimination with partial pivoting. */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    [m[c], m[p]] = [m[p], m[c]];
    if (Math.abs(m[c][c]) < 1e-12) throw new Error("The points don't determine a curve of this order.");
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

function polyFit(xs: number[], ys: number[], order: number): number[] {
  const k = order + 1;
  const a = [...Array(k)].map((_, i) => [...Array(k)].map((_, j) => xs.reduce((s, x) => s + x ** (i + j), 0)));
  const b = [...Array(k)].map((_, i) => xs.reduce((s, x, t) => s + x ** i * ys[t], 0));
  return solve(a, b);
}

/** A number to three significant figures, without trailing zeros. */
export function sig(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return String(v);
  if (v === 0) return "0";
  const text = Number(v.toPrecision(digits)).toString();
  return text.replace("-", "−");
}

const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
const sup = (n: number) => String(n).replace(/\d/g, (d) => SUP[d]);

/** "+ 3x" or "− 3x" for terms after the first. */
const term = (v: number, tail: string, first: boolean) => {
  const mag = sig(Math.abs(v));
  const coefText = tail && mag === "1" ? "" : mag;
  if (first) return `${v < 0 ? "−" : ""}${coefText}${tail}`;
  return ` ${v < 0 ? "−" : "+"} ${coefText}${tail}`;
};

export function regression(xs: number[], ys: number[], method: RegressionMethod = "linear", order = 2): Regression {
  if (xs.length !== ys.length || xs.length < 2) throw new Error("A trend line needs at least two points.");
  let coef: number[];
  let predict: (x: number) => number;
  let equation: string;
  switch (method) {
    case "linear":
    case "polynomial": {
      const k = method === "linear" ? 1 : order;
      if (xs.length <= k) throw new Error(`A curve of order ${k} needs at least ${k + 1} points.`);
      coef = polyFit(xs, ys, k);
      predict = (x) => coef.reduce((s, c, i) => s + c * x ** i, 0);
      const parts: string[] = [];
      for (let i = coef.length - 1; i >= 0; i--) {
        if (Math.abs(coef[i]) < 1e-12 && coef.length > 1) continue;
        const tail = i === 0 ? "" : i === 1 ? "x" : `x${sup(i)}`;
        parts.push(term(coef[i], tail, parts.length === 0));
      }
      equation = `y = ${parts.join("") || "0"}`;
      break;
    }
    case "exponential": {
      if (ys.some((y) => y <= 0)) throw new Error("An exponential trend needs every y above zero.");
      const [lnA, b] = polyFit(xs, ys.map(Math.log), 1);
      coef = [Math.exp(lnA), b];
      predict = (x) => coef[0] * Math.exp(coef[1] * x);
      equation = `y = ${sig(coef[0])}e^(${sig(b)}x)`;
      break;
    }
    case "logarithmic": {
      if (xs.some((x) => x <= 0)) throw new Error("A logarithmic trend needs every x above zero.");
      coef = polyFit(xs.map(Math.log), ys, 1);
      predict = (x) => coef[0] + coef[1] * Math.log(x);
      equation = `y = ${sig(coef[0])}${term(coef[1], " ln x", false)}`;
      break;
    }
    case "power": {
      if (xs.some((x) => x <= 0) || ys.some((y) => y <= 0)) throw new Error("A power trend needs every x and y above zero.");
      const [lnA, b] = polyFit(xs.map(Math.log), ys.map(Math.log), 1);
      coef = [Math.exp(lnA), b];
      predict = (x) => coef[0] * x ** coef[1];
      equation = `y = ${sig(coef[0])}x^${sig(b)}`;
      break;
    }
  }
  const my = mean(ys);
  const ssTot = ys.reduce((s, y) => s + (y - my) ** 2, 0);
  const ssRes = ys.reduce((s, y, i) => s + (y - predict(xs[i])) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  return { method, coef, r2, predict, equation };
}
