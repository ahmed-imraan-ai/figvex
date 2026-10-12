import { describe, expect, it } from "vitest";
import { detectEngine, diagramKind } from "../../src/engines/detect";

describe("detectEngine", () => {
  it("recognises PlantUML start tags", () => {
    expect(detectEngine("@startuml\nA -> B\n@enduml")).toBe("plantuml");
    expect(detectEngine("\n\n  @startmindmap\n* a\n@endmindmap")).toBe("plantuml");
    expect(detectEngine("@startgantt\n@endgantt")).toBe("plantuml");
  });

  it("treats a leading PlantUML comment as PlantUML", () => {
    expect(detectEngine("' my notes\n@startuml\n@enduml")).toBe("plantuml");
    expect(detectEngine("/' block\ncomment '/\n")).toBe("plantuml");
  });

  it("recognises Mermaid diagram types", () => {
    expect(detectEngine("flowchart TD\n A --> B")).toBe("mermaid");
    expect(detectEngine("graph LR\n A --> B")).toBe("mermaid");
    expect(detectEngine("sequenceDiagram\n A->>B: hi")).toBe("mermaid");
    expect(detectEngine("stateDiagram-v2\n [*] --> A")).toBe("mermaid");
    expect(detectEngine("xychart-beta\n line [1, 2]")).toBe("mermaid");
    expect(detectEngine("pie title Pets\n \"Dogs\" : 3")).toBe("mermaid");
  });

  it("skips Mermaid front matter, comments and init directives", () => {
    expect(detectEngine("---\ntitle: Hello\n---\nflowchart LR\n A-->B")).toBe("mermaid");
    expect(detectEngine("%% a comment\n%%{init: {'theme':'dark'}}%%\nclassDiagram\n")).toBe("mermaid");
  });

  it("returns null when the text is empty or ambiguous", () => {
    expect(detectEngine("")).toBeNull();
    expect(detectEngine("   \n  ")).toBeNull();
    expect(detectEngine("A -> B : hello")).toBeNull();
    expect(detectEngine("graphical thinking")).toBeNull();
  });
});

describe("diagramKind", () => {
  it("names PlantUML diagram types except plain uml", () => {
    expect(diagramKind("@startgantt\n@endgantt", "plantuml")).toBe("gantt");
    expect(diagramKind("@startuml\n@enduml", "plantuml")).toBe("");
  });

  it("names Mermaid diagram types without beta suffixes", () => {
    expect(diagramKind("---\ntitle: x\n---\nsankey-beta\n", "mermaid")).toBe("sankey");
    expect(diagramKind("stateDiagram-v2\n", "mermaid")).toBe("stateDiagram");
    expect(diagramKind("flowchart TD", "mermaid")).toBe("flowchart");
  });
});
