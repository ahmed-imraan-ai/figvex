import { describe, expect, it, vi } from "vitest";
import {
  baseOption,
  ChartError,
  DEFAULT_SIZE,
  lineAt,
  parseChart,
  parseCsv,
  SERIES_TYPES,
  splitSource,
  stripJsonc,
} from "../../src/engines/chart";
import { renderSvg } from "../../src/engines/chart-runtime";
import { TEMPLATES } from "../../src/templates";

const errorOf = (code: string): ChartError => {
  try {
    parseChart(code);
  } catch (err) {
    if (err instanceof ChartError) return err;
    throw err;
  }
  throw new Error("expected a ChartError");
};

describe("stripJsonc", () => {
  it("blanks comments and trailing commas without moving anything", () => {
    const src = '{\n  // note\n  "a": [1, 2,], /* x */\n  "b": "// not a comment",\n}';
    const out = stripJsonc(src);
    expect(out).toHaveLength(src.length);
    expect(JSON.parse(out)).toEqual({ a: [1, 2], b: "// not a comment" });
    expect(out.split("\n")).toHaveLength(src.split("\n").length);
  });

  it("keeps escaped quotes inside strings", () => {
    expect(JSON.parse(stripJsonc('{ "a": "say \\"hi\\", // ok", }'))).toEqual({ a: 'say "hi", // ok' });
  });
});

describe("parseCsv", () => {
  it("reads numbers, text, quotes and empty cells", () => {
    expect(parseCsv('name,score\n"Smith, J",72\nLee,\n"He said ""hi""",9.5\n')).toEqual([
      ["name", "score"],
      ["Smith, J", 72],
      ["Lee", null],
      ['He said "hi"', 9.5],
    ]);
  });

  it("detects tab-separated data and skips blank lines", () => {
    expect(parseCsv("\nx\ty\n1\t2\n\n3\t4\n")).toEqual([
      ["x", "y"],
      [1, 2],
      [3, 4],
    ]);
  });

  it("keeps quoted numbers as text", () => {
    expect(parseCsv('id\n"007"')).toEqual([["id"], ["007"]]);
  });
});

describe("splitSource", () => {
  it("splits at the first --- line and records where the CSV starts", () => {
    expect(splitSource('{"series": []}\n---\na,b\n1,2')).toEqual({ json: '{"series": []}', csv: "a,b\n1,2", csvLine: 3 });
    expect(splitSource("{}").csv).toBeNull();
  });
});

describe("parseChart", () => {
  it("returns the option, default size and CSV as the dataset", () => {
    const parsed = parseChart('{ "xAxis": {"type": "category"}, "yAxis": {}, "series": [{ "type": "bar" }], }\n---\nk,v\na,1');
    expect(parsed.width).toBe(DEFAULT_SIZE.width);
    expect(parsed.option.dataset).toEqual({ source: [["k", "v"], ["a", 1]] });
  });

  it("takes width and height from the root and removes them", () => {
    const parsed = parseChart('{ "width": 400, "height": 300, "series": { "type": "pie" } }');
    expect([parsed.width, parsed.height]).toEqual([400, 300]);
    expect(parsed.option).not.toHaveProperty("width");
  });

  it("fills a dataset that has no source yet", () => {
    const parsed = parseChart('{ "dataset": { "dimensions": ["k", "v"] }, "series": [{ "type": "line" }] }\n---\nk,v\na,1');
    expect(parsed.option.dataset).toEqual({ dimensions: ["k", "v"], source: [["k", "v"], ["a", 1]] });
  });

  it("points JSON syntax errors at the right line", () => {
    const err = errorOf('{\n  "series": [\n    { "type": "bar" }\n    { "type": "line" }\n  ]\n}');
    expect(err.line).toBe(4);
  });

  it("explains an unfinished object", () => {
    expect(errorOf('{\n  "series": [{ "type": "bar" }]\n').message).toMatch(/ends too early/);
  });

  it("explains property names without quotes", () => {
    expect(errorOf('{\n  series: []\n}').message).toMatch(/double quotes/);
  });

  it("rejects unknown series types and points at them", () => {
    const err = errorOf('{\n  "title": { "text": "x" },\n  "series": [{ "type": "barr" }]\n}');
    expect(err.message).toContain('"barr"');
    expect(err.line).toBe(3);
  });

  it("asks for a series list and a type", () => {
    expect(errorOf('{ "title": { "text": "x" } }').message).toMatch(/"series"/);
    expect(errorOf('{ "series": [{ "data": [1] }] }').message).toMatch(/needs a "type"/);
  });

  it("checks CSV rows against the header", () => {
    const err = errorOf('{ "series": [{ "type": "bar" }] }\n---\na,b\n1,2\n3');
    expect(err.line).toBe(5);
  });

  it("refuses CSV and dataset.source together", () => {
    expect(errorOf('{ "dataset": { "source": [] }, "series": [{ "type": "bar" }] }\n---\na\n1').message).toMatch(/one or the other/);
  });

  it("rejects silly sizes", () => {
    expect(errorOf('{\n  "width": 99999,\n  "series": [{ "type": "bar" }]\n}').line).toBe(2);
  });
});

describe("baseOption", () => {
  it("turns animation off, keeps the background clear and sets the palette", () => {
    expect(baseOption({ dark: false, chartStyle: "default" })).toEqual({ animation: false, backgroundColor: "transparent" });
    expect(baseOption({ dark: false, chartStyle: "colour-blind" }).color).toContain("#0072B2");
    expect(baseOption({ dark: true, chartStyle: "greyscale" }).color).toContain("#f2f2f2");
  });
});

describe("lineAt", () => {
  it("counts lines up to an offset", () => {
    expect(lineAt("a\nb\nc", 0)).toBe(1);
    expect(lineAt("a\nb\nc", 4)).toBe(3);
  });
});

describe("ECharts runtime", () => {
  it.each(SERIES_TYPES.map((t) => [t]))("has the %s series registered", (type) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    // Without axes or data most series can't draw; only the registration matters here.
    try {
      renderSvg({ animation: false, series: [{ type, data: [] }] }, 300, 200, false);
    } catch {
      // expected for some types
    }
    const logged = [...warn.mock.calls, ...error.mock.calls].map((c) => c.join(" ")).join("\n");
    expect(logged).not.toMatch(/not imported|Unknown series/);
  });

  const charts = TEMPLATES.filter((t) => t.engine === "echarts");

  it("has templates", () => {
    expect(charts.length).toBeGreaterThan(5);
  });

  it.each(charts.map((t) => [t.id, t] as const))("draws the %s template in light and dark", (_id, t) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const dark of [false, true]) {
      const { option, width, height } = parseChart(t.code);
      const svg = renderSvg({ ...baseOption({ dark, chartStyle: "default" }), ...option }, width, height, dark);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain(`width="${width}"`);
    }
    expect(warn).not.toHaveBeenCalled();
  });
});
