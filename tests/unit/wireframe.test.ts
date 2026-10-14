import { describe, expect, it } from "vitest";
import { detectEngine } from "../../src/engines/detect";
import { parseWireframe, words, WireframeError } from "../../src/engines/wireframe/model";
import { drawWireframe } from "../../src/engines/wireframe/render";
import { wireframeTemplates } from "../../src/templates/wireframe";

describe("wireframe parsing", () => {
  it("splits texts, the selected one and flags", () => {
    expect(words('"Home" *"Search" "Me" primary 40%')).toEqual({ texts: ["Home", "Search", "Me"], selected: 1, bare: ["primary", "40%"] });
    expect(words('"Say \\"hi\\"" on').texts).toEqual(['Say "hi"']);
  });

  it("reads screens, nested controls and flows", () => {
    const doc = parseWireframe(`wireframe
title "Test"
screen a "First" tablet
  header "Top" back
  row
    button "One"
    button "Two" primary
  card "Box"
    text "Inside"
  table "Name" "Mark"
    row "Ann" "70"
  slider 30
screen b "Second" 400x500
  nav "X" *"Y"
a -> b "go"
`);
    expect(doc.title).toBe("Test");
    expect(doc.screens.map((s) => [s.id, s.title, s.kind, s.width, s.height])).toEqual([
      ["a", "First", "tablet", undefined, undefined],
      ["b", "Second", "phone", 400, 500],
    ]);
    const [header, row, card, table, slider] = doc.screens[0].controls;
    expect(header).toMatchObject({ kind: "header", texts: ["Top"], line: 4 });
    expect(header.flags.has("back")).toBe(true);
    expect(row.children.map((c) => c.texts[0])).toEqual(["One", "Two"]);
    expect(row.children[1].flags.has("primary")).toBe(true);
    expect(card.children[0].kind).toBe("text");
    expect(table.children[0].texts).toEqual(["Ann", "70"]);
    expect(slider.value).toBe(30);
    expect(doc.screens[1].controls[0].selected).toBe(1);
    expect(doc.flows).toEqual([{ from: "a", to: "b", label: "go", line: 15 }]);
  });

  it("explains mistakes with their line", () => {
    const err = (src: string) => {
      try {
        parseWireframe(src);
      } catch (e) {
        return e as WireframeError;
      }
      throw new Error("no error");
    };
    expect(err("screen a")).toMatchObject({ line: 1 });
    expect(err('wireframe\n  button "x"').message).toMatch(/Start a screen first/);
    expect(err('wireframe\nscreen a\n  wibble "x"')).toMatchObject({ line: 3, message: expect.stringMatching(/isn't a control/) });
    expect(err("wireframe\nscreen a huge").message).toMatch(/isn't a screen size/);
    expect(err("wireframe\nscreen a\nscreen a").message).toMatch(/already a screen called a/);
    expect(err("wireframe\nscreen a\na -> z").message).toMatch(/no screen called z/);
    expect(err('wireframe\nscreen a\nbutton "x"').message).toMatch(/Indent the controls/);
  });
});

describe("wireframe drawing", () => {
  it("draws every template clean and sketchy, light and dark", () => {
    for (const t of wireframeTemplates) {
      const doc = parseWireframe(t.code);
      for (const style of ["clean", "sketchy"] as const)
        for (const dark of [false, true]) {
          const svg = drawWireframe(doc, { dark, style });
          expect(svg.startsWith("<svg"), t.id).toBe(true);
          expect(svg).not.toContain("NaN");
          for (const s of doc.screens) expect(svg).toContain(`data-qualified-name="${s.id}"`);
        }
    }
  });

  it("grows a screen to fit its controls", () => {
    const many = Array.from({ length: 30 }, (_, i) => `  button "B${i}"`).join("\n");
    const svg = drawWireframe(parseWireframe(`wireframe\nscreen a phone\n${many}`), { dark: false, style: "clean" });
    expect(Number(svg.match(/height="([\d.]+)"/)![1])).toBeGreaterThan(1400);
  });

  it("is picked up from the first line", () => {
    expect(detectEngine('wireframe\nscreen a "A"')).toBe("wireframe");
  });
});
