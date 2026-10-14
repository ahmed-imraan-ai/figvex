import { describe, expect, it } from "vitest";
import { applyStyle } from "../../src/engines/plantuml";
import { distance, lintPlantUml } from "../../src/engines/plantuml-lint";
import { TEMPLATES, WELCOME_CODE } from "../../src/templates";

const lines = (code: string) => lintPlantUml(code).map((w) => [w.line, w.message]);

describe("PlantUML modelling checks", () => {
  it("measures edit distance", () => {
    expect(distance("Studnet", "Student")).toBe(1);
    expect(distance("Book", "book")).toBe(0);
  });

  it("finds inheritance that goes round in a circle", () => {
    const w = lintPlantUml("@startuml\nclass A\nclass B extends A\nA --|> C\nC --|> B\n@enduml");
    expect(w).toHaveLength(1);
    expect(w[0].message).toMatch(/goes round in a circle: .*A.*→/);
  });

  it("checks multiplicities", () => {
    expect(lines('@startuml\nclass A\nclass B\nA "1" -- "5..2" B\nA "1...*" -- "1" B\n@enduml')).toEqual([
      [4, 'In "5..2" the lower bound is bigger than the upper one.'],
      [5, '"1...*" isn\'t a multiplicity. Use forms like 1, 0..1, 1..* or *.'],
    ]);
    expect(lintPlantUml('@startuml\nclass A\nclass B\nA "0..1" -- "1..*" B : has\nA "*" o-- "1" B\n@enduml')).toEqual([]);
  });

  it("spots class names that look like typos, and duplicates", () => {
    expect(lines("@startuml\nclass Student\nclass Course\nStudnet --> Course\n@enduml")).toEqual([
      [4, "Studnet isn't declared, so PlantUML adds a new class for it. Did you mean Student?"],
    ]);
    expect(lines("@startuml\nclass Book\nclass Book\n@enduml")).toEqual([[3, "Book is declared twice (first on line 2)."]]);
  });

  it("flags attributes in interfaces but not constants or methods", () => {
    const code = "@startuml\ninterface Shape {\n  area() : double\n  MAX_SIDES : int\n  name : String\n}\n@enduml";
    expect(lines(code)).toEqual([[5, "Shape is an interface, so it shouldn't hold attributes like this one. Use a method, or a constant written in capitals."]]);
  });

  it("checks sequence participants and activations", () => {
    const code = "@startuml\nparticipant Browser\nparticipant Server\nBrowser -> Sever : GET /\nactivate Server\nServer --> Browser : 200\ndeactivate Browser\n@enduml";
    expect(lines(code)).toEqual([
      [4, "Sever isn't declared, so PlantUML adds a new participant. Did you mean Server?"],
      [7, "Browser is deactivated here but wasn't active."],
      [5, 'Server is activated here and never deactivated. Add "deactivate Server" where its work ends.'],
    ]);
    expect(lintPlantUml("@startuml\nA -> B ++ : call\nB --> A -- : done\n@enduml")).toEqual([]);
  });

  it("finds states that can't be reached", () => {
    expect(lines("@startuml\n[*] --> Idle\nIdle --> Busy\nBusy --> Idle\nOrphan --> Idle\nIdle --> [*]\n@enduml")).toEqual([[5, "Orphan can't be reached from the start state."]]);
  });

  it("stays quiet on every template and the welcome diagram", () => {
    for (const t of TEMPLATES.filter((x) => x.engine === "plantuml")) expect(lintPlantUml(t.code), t.id).toEqual([]);
    expect(lintPlantUml(WELCOME_CODE)).toEqual([]);
  });

  it("reports lines the app can map back through the inserted theme line", () => {
    const code = "@startuml\nclass A\nclass A\n@enduml";
    const styled = applyStyle(code, "plain");
    const toStyled = (line: number) => [line, line + 1].find((s) => styled.mapLine(s) === line) ?? line;
    expect(styled.mapLine(toStyled(3))).toBe(3);
    expect(styled.mapLine(toStyled(1))).toBe(1);
  });
});
