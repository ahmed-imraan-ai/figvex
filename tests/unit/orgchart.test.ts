import { describe, expect, it } from "vitest";
import { detectEngine } from "../../src/engines/detect";
import { everyone, headcount, initials, OrgError, parseOrgChart } from "../../src/engines/orgchart/model";
import { departmentOf, drawOrgChart, layoutOrgChart, type OrgStyle } from "../../src/engines/orgchart/render";
import { TEMPLATES } from "../../src/templates";

const errorOf = (code: string): OrgError => {
  try {
    parseOrgChart(code);
  } catch (err) {
    if (err instanceof OrgError) return err;
    throw err;
  }
  throw new Error("expected an OrgError");
};

const SAMPLE = `orgchart
title "Acme: the people"
counts
compact
Jane Smith: Chief Executive [Exec]
  + Lee Park: Assistant
  Ravi Patel: CTO [Engineering]
    Ana Lopez #ana: Manager
      Tom Reed: Developer
      ?: Developer
  Mia Chen: CFO [Finance]
ana .. Mia Chen "budget"
`;

describe("parseOrgChart", () => {
  it("reads settings, people, assistants, vacancies and dotted lines", () => {
    const chart = parseOrgChart(SAMPLE);
    expect(chart).toMatchObject({ title: "Acme: the people", counts: true, compact: true, direction: "down", departments: ["Exec", "Engineering", "Finance"] });
    const [jane] = chart.roots;
    expect(jane).toMatchObject({ name: "Jane Smith", title: "Chief Executive", department: "Exec", line: 5 });
    expect(jane.assistants.map((p) => p.name)).toEqual(["Lee Park"]);
    expect(jane.children.map((p) => p.name)).toEqual(["Ravi Patel", "Mia Chen"]);
    const ana = jane.children[0].children[0];
    expect(ana).toMatchObject({ key: "ana", name: "Ana Lopez", title: "Manager" });
    expect(ana.children[1]).toMatchObject({ vacant: true, name: "Vacant", title: "Developer" });
    expect(chart.dotted).toEqual([expect.objectContaining({ label: "budget", line: 12 })]);
    expect(chart.dotted[0].from).toBe(ana);
    expect(chart.dotted[0].to.name).toBe("Mia Chen");
  });

  it("counts reports and works out departments down the tree", () => {
    const chart = parseOrgChart(SAMPLE);
    const [jane] = chart.roots;
    expect(headcount(jane)).toBe(5);
    expect(departmentOf(jane.children[0].children[0].children[0])).toBe("Engineering");
    expect(everyone(chart)).toHaveLength(7);
  });

  it("allows several top-level people, tabs and comments", () => {
    const chart = parseOrgChart("orgchart\n# board\nA: Chair\n\tB: Member\nC: Treasurer # elected\n");
    expect(chart.roots.map((p) => p.name)).toEqual(["A", "C"]);
    expect(chart.roots[0].children[0].name).toBe("B");
    expect(chart.roots[1].title).toBe("Treasurer");
  });

  it("explains mistakes with the line", () => {
    expect(errorOf("Jane: CEO").message).toMatch(/starts with the word "orgchart"/);
    expect(errorOf("orgchart\nA\nB\nA")).toMatchObject({ line: 4, message: expect.stringMatching(/two people called "A"/) });
    expect(errorOf("orgchart\n+ A: Assistant")).toMatchObject({ line: 2, message: expect.stringMatching(/needs a manager/) });
    expect(errorOf("orgchart\nA\nB .. C")).toMatchObject({ line: 3, message: expect.stringMatching(/nobody called "B"/) });
    expect(errorOf("orgchart\nA\ncompact")).toMatchObject({ line: 3, message: expect.stringMatching(/before the first person/) });
    expect(errorOf("orgchart\ndirection up\nA")).toMatchObject({ line: 2 });
    expect(errorOf("orgchart\n")).toMatchObject({ message: expect.stringMatching(/Add a person/) });
  });

  it("treats words like title as names unless they are settings", () => {
    expect(parseOrgChart("orgchart\nTitle Smith: Editor").roots[0].name).toBe("Title Smith");
  });
});

describe("initials", () => {
  it("uses first and last names", () => {
    expect(initials("Ana Maria Lopez")).toBe("AL");
    expect(initials("Cher")).toBe("CH");
  });
});

describe("layout", () => {
  const overlaps = (boxes: { x: number; y: number; w: number; h: number }[]) => {
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return true;
      }
    }
    return false;
  };

  it.each(["cards", "minimal", "bold"] as OrgStyle[])("never overlaps cards (%s, both directions, compact or not)", (style) => {
    for (const extra of ["", "direction right\n", "compact\n", "compact\ndirection right\n"]) {
      const chart = parseOrgChart(SAMPLE.replace("compact\n", "").replace("counts\n", `counts\n${extra}`));
      const { boxes } = layoutOrgChart(chart, style);
      expect(boxes.every((b) => Number.isFinite(b.x) && Number.isFinite(b.y))).toBe(true);
      expect(overlaps(boxes)).toBe(false);
    }
  });

  it("centres a manager over the reports", () => {
    const { boxes } = layoutOrgChart(parseOrgChart("orgchart\nBoss\n  A\n  B\n  C"), "cards");
    const [boss, a, , c] = boxes;
    expect(boss.x + boss.w / 2).toBeCloseTo((a.x + c.x + c.w) / 2);
    expect(a.y).toBeGreaterThan(boss.y + boss.h);
  });
});

describe("drawOrgChart", () => {
  it("draws valid SVG in every style, light and dark, with click-to-source lines", () => {
    const chart = parseOrgChart(SAMPLE);
    for (const style of ["cards", "minimal", "bold"] as OrgStyle[]) {
      for (const dark of [false, true]) {
        const svg = drawOrgChart(chart, { dark, style });
        expect(new DOMParser().parseFromString(svg, "image/svg+xml").getElementsByTagName("parsererror")).toHaveLength(0);
        expect(svg).toContain('data-source-line="4"');
        expect(svg).toContain("Acme: the people");
      }
    }
  });
});

describe("templates and detection", () => {
  it("detects org charts", () => {
    expect(detectEngine("orgchart\nA")).toBe("orgchart");
  });

  it.each(TEMPLATES.filter((t) => t.engine === "orgchart").map((t) => [t.id, t] as const))("%s parses and draws", (_id, t) => {
    expect(drawOrgChart(parseOrgChart(t.code), { dark: false, style: "cards" }).startsWith("<svg")).toBe(true);
  });
});
