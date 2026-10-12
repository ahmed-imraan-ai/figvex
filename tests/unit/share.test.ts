import { describe, expect, it } from "vitest";
import { hasSharedDiagram, markdownBlock, readSharedDiagram, shareUrl } from "../../src/share";

describe("share links", () => {
  it("round-trips a diagram through the URL fragment", async () => {
    const diagram = { engine: "mermaid" as const, title: "Sprint plan", code: "gantt\n  title Sprint 4\n" };
    const url = new URL(await shareUrl(diagram));
    expect(url.search).toBe("");
    expect(hasSharedDiagram(url.hash)).toBe(true);
    expect(await readSharedDiagram(url.hash)).toEqual(diagram);
  });

  it("keeps large diagrams reasonably short", async () => {
    const code = "@startuml\n" + "Alice -> Bob : message number\n".repeat(400) + "@enduml";
    const url = await shareUrl({ engine: "plantuml", title: "Big", code });
    expect(url.length).toBeLessThan(code.length / 4);
  });

  it("rejects damaged or foreign fragments", async () => {
    expect(hasSharedDiagram("#something-else")).toBe(false);
    expect(await readSharedDiagram("#something-else")).toBeNull();
    expect(await readSharedDiagram("#u1:not-valid-data")).toBeNull();
  });

  it("falls back to PlantUML and a default title for odd payloads", async () => {
    const url = new URL(await shareUrl({ engine: "plantuml", title: "   ", code: "@startuml\n@enduml" }));
    const read = await readSharedDiagram(url.hash);
    expect(read?.title).toBe("Shared diagram");
    expect(read?.engine).toBe("plantuml");
  });
});

describe("markdownBlock", () => {
  it("wraps code in a fence named after the engine", () => {
    expect(markdownBlock("plantuml", "@startuml\nA -> B\n@enduml\n\n")).toBe("```plantuml\n@startuml\nA -> B\n@enduml\n```\n");
    expect(markdownBlock("mermaid", "flowchart TD")).toBe("```mermaid\nflowchart TD\n```\n");
  });
});
