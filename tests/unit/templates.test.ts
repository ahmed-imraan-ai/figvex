import { describe, expect, it } from "vitest";
import { detectEngine } from "../../src/engines/detect";
import { unsupportedFeature } from "../../src/engines/plantuml";
import { CATEGORIES, TEMPLATES, WELCOME_CODE } from "../../src/templates";

describe("templates", () => {
  it("have unique ids and titles within each engine", () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const engine of ["plantuml", "mermaid"]) {
      const titles = TEMPLATES.filter((t) => t.engine === engine).map((t) => t.title);
      expect(new Set(titles).size).toBe(titles.length);
    }
  });

  it("use known categories", () => {
    for (const t of TEMPLATES) expect(CATEGORIES).toContain(t.category);
  });

  it("are listed in category order", () => {
    const order = TEMPLATES.map((t) => CATEGORIES.indexOf(t.category as (typeof CATEGORIES)[number]));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it.each(TEMPLATES.map((t) => [t.id, t] as const))("%s is detected as its own engine", (_id, t) => {
    expect(detectEngine(t.code)).toBe(t.engine);
  });

  it("only use PlantUML features the browser engine supports", () => {
    for (const t of TEMPLATES.filter((t) => t.engine === "plantuml")) {
      expect(unsupportedFeature(t.code), t.id).toBeUndefined();
    }
  });

  it("include a welcome diagram in PlantUML", () => {
    expect(detectEngine(WELCOME_CODE)).toBe("plantuml");
  });
});
