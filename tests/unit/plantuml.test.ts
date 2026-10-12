import { describe, expect, it } from "vitest";
import { applyStyle, interpretSvg, isEmptyDiagram, unsupportedFeature } from "../../src/engines/plantuml";

// Shape of the error image the browser engine draws (trimmed).
const errorSvg = (line: number, message: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="140">
  <text fill="#33FF02">PlantUML version $version$ / $git.commit.id$ [Unknown compile time]</text>
  <text fill="#000000">[From textarea (line ${line}) ]</text>
  <text fill="#33FF02">@startuml</text>
  <text fill="#33FF02">class A</text>
  <text fill="#33FF02">this is not valid :::</text>
  <text fill="#FF0000"> ${message}</text>
</svg>`;

describe("interpretSvg", () => {
  it("passes ordinary diagrams through", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>Alice</text></svg>';
    expect(interpretSvg(svg, 12)).toEqual({ ok: true, svg, ms: 12 });
  });

  it("turns PlantUML's error image into a message and line number", () => {
    const result = interpretSvg(errorSvg(4, "Syntax Error? (Assumed diagram type: class)"), 5);
    expect(result).toMatchObject({ ok: false, line: 4, message: "Syntax error (Assumed diagram type: class)" });
  });

  it("keeps other error messages as written", () => {
    const result = interpretSvg(errorSvg(3, "Cannot load theme nosuchtheme"), 5);
    expect(result).toMatchObject({ ok: false, line: 3, message: "Cannot load theme nosuchtheme" });
  });

  it("explains unrecognised @start directives", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><text>Diagram not supported by this release of PlantUML</text>
      <text>Sorry, but the following directive @startfoo is not recognized.</text></svg>`;
    const result = interpretSvg(svg, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("@startfoo");
  });
});

describe("unsupportedFeature", () => {
  it("flags diagram types missing from the browser build", () => {
    expect(unsupportedFeature("@startsalt\n{\n}\n@endsalt")).toBe("Salt wireframes");
    expect(unsupportedFeature("@startditaa\n+--+\n@endditaa")).toBe("Ditaa");
    expect(unsupportedFeature("@startmath\nx^2\n@endmath")).toBe("Math and LaTeX formulas");
    expect(unsupportedFeature("@startuml\nnwdiag {\n}\n@enduml")).toBe("Network diagrams (nwdiag)");
    expect(unsupportedFeature("@startuml\n!include https://example.com/a.puml\n@enduml")).toBe("Including files from a URL");
  });

  it("leaves supported diagrams alone", () => {
    expect(unsupportedFeature("@startuml\nA -> B\n@enduml")).toBeUndefined();
    expect(unsupportedFeature("@startuml\n!include <C4/C4_Context>\n@enduml")).toBeUndefined();
    expect(unsupportedFeature("@startuml\nnote: salt is tasty\n@enduml")).toBeUndefined();
  });
});

describe("applyStyle", () => {
  const code = "@startuml\nA -> B\nB -> C\n@enduml";

  it("inserts the theme after the @start line", () => {
    expect(applyStyle(code, "plain").code).toBe("@startuml\n!theme plain\nA -> B\nB -> C\n@enduml");
  });

  it("maps rendered line numbers back to the editor", () => {
    const { mapLine } = applyStyle(code, "plain");
    expect(mapLine(1)).toBe(1); // @startuml
    expect(mapLine(2)).toBe(1); // the inserted !theme line
    expect(mapLine(3)).toBe(2); // A -> B
    expect(mapLine(5)).toBe(4); // @enduml
  });

  it("leaves diagrams that choose their own theme alone", () => {
    const own = "@startuml\n!theme cerulean\nA -> B\n@enduml";
    expect(applyStyle(own, "plain").code).toBe(own);
    expect(applyStyle(code, "default").code).toBe(code);
  });

  it("handles leading comments before @start", () => {
    const styled = applyStyle("' notes\n@startmindmap\n* a\n@endmindmap", "plain");
    expect(styled.code).toBe("' notes\n@startmindmap\n!theme plain\n* a\n@endmindmap");
    expect(styled.mapLine(4)).toBe(3);
  });
});

describe("isEmptyDiagram", () => {
  it("is true when only start, end and comments are present", () => {
    expect(isEmptyDiagram("@startuml\n\n@enduml\n")).toBe(true);
    expect(isEmptyDiagram("@startuml\n' just a note\n@enduml")).toBe(true);
  });

  it("is false once there is content", () => {
    expect(isEmptyDiagram("@startuml\nA -> B\n@enduml")).toBe(false);
  });
});
