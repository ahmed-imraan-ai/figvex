import { describe, expect, it } from "vitest";
import { parseChart } from "../../src/engines/chart";
import { boxSummary, density, histogram, niceStep, quantile, regression, sig, sorted } from "../../src/engines/stats";
import { TEMPLATES } from "../../src/templates";

describe("statistics", () => {
  it("finds quartiles by linear interpolation", () => {
    const s = sorted([7, 1, 3, 5, 9, 11]);
    expect(quantile(s, 0.5)).toBe(6);
    expect(quantile(s, 0.25)).toBe(3.5);
    expect(quantile(s, 0.75)).toBe(8.5);
  });

  it("summarises a box plot with Tukey whiskers and outliers", () => {
    const b = boxSummary([12, 55, 58, 62, 64, 66, 69, 71, 74, 80]);
    expect(b.median).toBe(65);
    expect(b.outliers).toEqual([12]);
    expect(b.low).toBe(55);
    expect(b.high).toBe(80);
    expect(boxSummary([1, 2, 100], "minmax")).toMatchObject({ low: 1, high: 100, outliers: [] });
  });

  it("bins values with round edges, counting every value once", () => {
    const xs = [12, 18, 21, 25, 30, 30, 35, 58];
    const bins = histogram(xs, { width: 10 });
    expect(bins.map((b) => [b.from, b.to, b.count])).toEqual([[10, 20, 2], [20, 30, 2], [30, 40, 3], [40, 50, 0], [50, 60, 1]]);
    expect(histogram([0, 10, 20, 30, 40, 50, 60, 70]).reduce((s, b) => s + b.count, 0)).toBe(8);
    // The top value on a bin edge goes in the last bin.
    expect(histogram([0, 5, 10], { width: 5 }).map((b) => b.count)).toEqual([1, 2]);
    expect(niceStep(7.3)).toBe(10);
    expect(niceStep(0.023)).toBe(0.025);
  });

  it("estimates a density that integrates to about one", () => {
    const d = density([1, 2, 2, 3, 3, 3, 4, 4, 5], { points: 400 });
    const area = d.slice(1).reduce((s, [x, y], i) => s + (x - d[i][0]) * (y + d[i][1]) / 2, 0);
    expect(area).toBeCloseTo(1, 2);
  });

  it("fits lines and curves, with R² and a readable equation", () => {
    const xs = [1, 2, 3, 4, 5];
    const lin = regression(xs, xs.map((x) => 2 * x + 1));
    expect(lin.coef[0]).toBeCloseTo(1);
    expect(lin.coef[1]).toBeCloseTo(2);
    expect(lin.r2).toBeCloseTo(1);
    expect(lin.equation).toBe("y = 2x + 1");
    const quad = regression(xs, xs.map((x) => x * x - 3 * x), "polynomial", 2);
    expect(quad.equation).toBe("y = x² − 3x");
    const exp = regression(xs, xs.map((x) => 3 * Math.exp(0.5 * x)), "exponential");
    expect(exp.equation).toBe("y = 3e^(0.5x)");
    expect(regression(xs, xs.map((x) => 4 * x ** 1.5), "power").equation).toBe("y = 4x^1.5");
    expect(regression(xs, xs.map((x) => 1 - 2 * Math.log(x)), "logarithmic").equation).toBe("y = 1 − 2 ln x");
    expect(() => regression([1, 2], [0, 1], "exponential")).toThrow(/above zero/);
    expect(sig(-0.000123456)).toBe("−0.000123");
  });
});

describe("statistics in charts", () => {
  const chart = (json: string, csv: string) => parseChart(`${json}\n---\n${csv}`).option as { dataset: { id?: string; source: unknown[][] }[]; series: { name?: string }[] };

  it("replaces a stat:histogram dataset with its bins", () => {
    const o = chart('{ "dataset": [{}, { "transform": { "type": "stat:histogram", "config": { "dimension": "t", "width": 10 } } }], "series": [{ "type": "bar", "datasetIndex": 1 }] }', "t\n1\n5\n12\n25");
    expect(o.dataset[1].source).toEqual([
      ["bin", "count", "percent", "density", "from", "to"],
      ["0–10", 2, 50, 0.05, 0, 10],
      ["10–20", 1, 25, 0.025, 10, 20],
      ["20–30", 1, 25, 0.025, 20, 30],
    ]);
  });

  it("summarises groups for a box plot, with outliers in their own dataset", () => {
    const o = chart('{ "dataset": [{}, { "id": "b", "transform": { "type": "stat:boxplot", "config": { "group": "g", "value": "v" } } }], "series": [{ "type": "boxplot", "datasetId": "b" }] }', "g,v\na,1\na,2\na,3\na,4\na,100\nb,5\nb,6");
    expect(o.dataset[1].source[1]).toEqual(["a", 1, 2, 3, 4, 4, 5]);
    expect(o.dataset[2]).toEqual({ id: "b-outliers", source: [["group", "value"], ["a", 100]] });
  });

  it("fills in {equation} and {r2} from the trend line a series draws", () => {
    const o = chart('{ "title": { "text": "{equation}" }, "dataset": [{}, { "transform": { "type": "stat:regression", "config": { "x": "x", "y": "y" } } }], "series": [{ "type": "scatter" }, { "type": "line", "datasetIndex": 1, "name": "{equation}, R² = {r2}" }] }', "x,y\n0,1\n1,3\n2,5");
    expect(o.series[1].name).toBe("y = 2x + 1, R² = 1.000");
    expect((o as unknown as { title: { text: string } }).title.text).toBe("y = 2x + 1");
  });

  it("points at the transform when a column is missing", () => {
    expect(() => parseChart('{\n "dataset": [{},\n { "transform": { "type": "stat:density", "config": { "dimension": "nope" } } }],\n "series": [{ "type": "line" }] }\n---\nx\n1\n2')).toThrow(/no column "nope"/);
    try {
      parseChart('{\n "dataset": [{},\n { "transform": { "type": "stat:density", "config": { "dimension": "nope" } } }],\n "series": [{ "type": "line" }] }\n---\nx\n1\n2');
    } catch (err) {
      expect((err as { line?: number }).line).toBe(3);
    }
  });

  it("works for every statistics template", () => {
    for (const t of TEMPLATES.filter((x) => x.id.startsWith("chart-stat-"))) expect(() => parseChart(t.code), t.id).not.toThrow();
  });
});
