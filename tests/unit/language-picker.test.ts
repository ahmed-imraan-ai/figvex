import { describe, expect, it } from "vitest";
import { ENGINES } from "../../src/engines/types";
import { filterLanguages } from "../../src/ui/language-picker";

describe("filterLanguages", () => {
  it("lists every language for an empty query", () => {
    expect(filterLanguages("")).toEqual([...ENGINES]);
    expect(filterLanguages("  ")).toEqual([...ENGINES]);
  });

  it("finds languages by name, tag, file extension and kind of diagram", () => {
    expect(filterLanguages("org")[0]).toBe("orgchart");
    expect(filterLanguages("dot")[0]).toBe("graphviz");
    expect(filterLanguages("csv")).toEqual(["echarts"]);
    expect(filterLanguages("Gantt")).toContain("mermaid");
    expect(filterLanguages("whiteboard")).toEqual(["sketch"]);
    expect(filterLanguages("workflow")).toEqual(["bpmn"]);
  });

  it("puts name matches before word matches", () => {
    const hits = filterLanguages("graph");
    expect(hits[0]).toBe("graphviz");
    expect(hits).toContain("echarts");
  });

  it("returns nothing for an unknown word", () => {
    expect(filterLanguages("zzz")).toEqual([]);
  });
});
