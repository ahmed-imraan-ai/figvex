import { describe, expect, it } from "vitest";
import { detectEngine } from "../../src/engines/detect";
import { nextId, parseSketch, serializeSketch, SketchError, tokenize, type LinkEl, type ShapeEl } from "../../src/engines/sketch/model";
import { drawSketch, edgePoint, inkOn, linkEnds, linkPath, shapeMap } from "../../src/engines/sketch/render";
import { align, alignSnap, distribute, edgeSnap } from "../../src/engines/sketch/snap";
import { TEMPLATES } from "../../src/templates";
import { simplify } from "../../src/ui/sketch-canvas";

const errorOf = (code: string): SketchError => {
  try {
    parseSketch(code);
  } catch (err) {
    if (err instanceof SketchError) return err;
    throw err;
  }
  throw new Error("expected a SketchError");
};

const SAMPLE = `sketch
# a login flow
box login 40 40 160 80 "Login page" round fill=#fde68a
ellipse user 260 60 120 60 "User"
text note 40 160 "Notes \\"here\\"" size=18
arrow user -> login "signs in" dashed
line 40,300 -> 200,300.5 both
pen 10,10 12,14 18,20 stroke=red width=3
`;

describe("tokenize", () => {
  it("keeps quoted strings together and unescapes them", () => {
    expect(tokenize('box a 1 2 "two words \\"q\\"" round')).toEqual(["box", "a", "1", "2", '"two words "q"', "round"]);
    expect(tokenize('text t 0 0 "line one\\nline two"')).toEqual(["text", "t", "0", "0", '"line one\nline two']);
  });
});

describe("parseSketch", () => {
  it("reads every kind of element with its options", () => {
    const { elements } = parseSketch(SAMPLE);
    expect(elements.map((e) => e.type)).toEqual(["comment", "shape", "shape", "shape", "link", "link", "pen"]);
    expect(elements[1]).toMatchObject({ kind: "box", id: "login", x: 40, y: 40, w: 160, h: 80, label: "Login page", style: { round: true, fill: "#fde68a" }, line: 3 });
    expect(elements[3]).toMatchObject({ kind: "text", label: 'Notes "here"', style: { size: 18 } });
    expect(elements[4]).toMatchObject({ kind: "arrow", from: { id: "user" }, to: { id: "login" }, label: "signs in", heads: "end", style: { dashed: true } });
    expect(elements[5]).toMatchObject({ kind: "line", from: { x: 40, y: 300 }, to: { x: 200, y: 300.5 }, heads: "both" });
    expect(elements[6]).toMatchObject({ type: "pen", style: { stroke: "red", width: 3 } });
  });

  it("round-trips through the text form", () => {
    const once = serializeSketch(parseSketch(SAMPLE));
    expect(serializeSketch(parseSketch(once))).toBe(once);
    expect(once).toContain('box login 40 40 160 80 "Login page" round fill=#fde68a');
    expect(once).toContain('text note 40 160 "Notes \\"here\\"" size=18');
    expect(once).toContain("line 40,300 -> 200,300.5 both");
  });

  it("allows shapes without ids", () => {
    const { elements } = parseSketch('sketch\nbox 0 0 10 10 "x"\n');
    expect(serializeSketch({ elements })).toBe('sketch\nbox 0 0 10 10 "x"\n');
  });

  it("explains mistakes with the line", () => {
    expect(errorOf("box a 1 2 3 4").message).toMatch(/starts with the word "sketch"/);
    expect(errorOf("sketch\ncircle a 1 2 3 4")).toMatchObject({ line: 2, message: expect.stringMatching(/isn't a sketch element/) });
    expect(errorOf("sketch\nbox a 1 2")).toMatchObject({ line: 2, message: expect.stringMatching(/box id x y width height/) });
    expect(errorOf("sketch\nbox a 1 2 3 4 colour=red").message).toMatch(/isn't an option/);
    expect(errorOf("sketch\nbox a 1 2 3 4 fill=#zz").message).toMatch(/isn't a colour/);
    expect(errorOf("sketch\narrow a -> b")).toMatchObject({ line: 2, message: expect.stringMatching(/no shape called "a"/) });
    expect(errorOf("sketch\nbox a 0 0 9 9\nbox a 1 1 9 9")).toMatchObject({ line: 3, message: expect.stringMatching(/Two shapes/) });
    expect(errorOf("sketch\narrow a b").message).toMatch(/from -> to/);
  });
});

describe("nextId", () => {
  it("finds a free id", () => {
    expect(nextId(parseSketch("sketch\nbox box1 0 0 9 9\nbox box3 0 0 9 9"), "box")).toBe("box2");
  });
});

describe("geometry", () => {
  const shape = (kind: ShapeEl["kind"]): ShapeEl => ({ type: "shape", kind, id: "s", x: 0, y: 0, w: 100, h: 50, label: "", style: {} });

  it("clips lines to boxes, ellipses and diamonds, with a small gap", () => {
    expect(edgePoint(shape("box"), { x: 500, y: 25 }).x).toBeCloseTo(104, 0);
    expect(edgePoint(shape("ellipse"), { x: 50, y: 500 }).y).toBeCloseTo(54, 0);
    const d = edgePoint(shape("diamond"), { x: 500, y: 25 });
    expect(d.x).toBeCloseTo(104, 0);
  });

  it("joins linked shapes edge to edge", () => {
    const sketch = parseSketch("sketch\nbox a 0 0 100 50\nbox b 300 0 100 50\narrow a -> b");
    const [from, to] = linkEnds(sketch.elements[2] as never, shapeMap(sketch));
    expect(from.x).toBeGreaterThan(100);
    expect(to.x).toBeLessThan(300);
  });
});

describe("drawSketch", () => {
  it("draws clean and hand-drawn, light and dark, as valid SVG", () => {
    const sketch = parseSketch(SAMPLE);
    for (const style of ["clean", "hand-drawn"] as const) {
      for (const dark of [false, true]) {
        const svg = drawSketch(sketch, { dark, style });
        expect(new DOMParser().parseFromString(svg, "image/svg+xml").getElementsByTagName("parsererror")).toHaveLength(0);
        expect(svg).toContain('data-source-line="2"');
      }
    }
  });

  it("draws the same hand-drawn picture every time", () => {
    const sketch = parseSketch(SAMPLE);
    expect(drawSketch(sketch, { dark: false, style: "hand-drawn" })).toBe(drawSketch(sketch, { dark: false, style: "hand-drawn" }));
  });

  it("adds the grid and selection handles only on the canvas", () => {
    const sketch = parseSketch(SAMPLE);
    const exported = drawSketch(sketch, { dark: false, style: "clean" });
    const canvas = drawSketch(sketch, { dark: false, style: "clean", interactive: true, selected: new Set(["login"]) });
    expect(exported).not.toContain("sk-grid");
    expect(exported).not.toContain("data-sketch-handle");
    expect(canvas).toContain("sk-grid");
    expect(canvas.match(/data-sketch-handle/g)).toHaveLength(4);
  });
});

describe("inkOn", () => {
  it("picks text that reads on the fill", () => {
    expect(inkOn("#1d1d1b", "#000")).toBe("#ffffff");
    expect(inkOn("#fde68a", "#eee")).toBe("#1d1d1b");
    expect(inkOn("#fff", "#eee")).toBe("#1d1d1b");
    expect(inkOn(undefined, "#abc")).toBe("#abc");
    expect(inkOn("red", "#abc")).toBe("#abc");
  });
});

describe("simplify", () => {
  it("drops points on a straight stroke and keeps the corners", () => {
    const line = Array.from({ length: 20 }, (_, i) => ({ x: i * 5, y: 0 }));
    expect(simplify(line)).toEqual([{ x: 0, y: 0 }, { x: 95, y: 0 }]);
    const corner = [...line, ...Array.from({ length: 10 }, (_, i) => ({ x: 95, y: (i + 1) * 5 }))];
    expect(simplify(corner)).toEqual([{ x: 0, y: 0 }, { x: 95, y: 0 }, { x: 95, y: 50 }]);
  });
});

describe("templates and detection", () => {
  it("detects sketches", () => {
    expect(detectEngine("sketch\nbox a 0 0 9 9")).toBe("sketch");
    expect(detectEngine("sketches are fun")).toBeNull();
  });

  it.each(TEMPLATES.filter((t) => t.engine === "sketch").map((t) => [t.id, t] as const))("%s parses and draws", (_id, t) => {
    const svg = drawSketch(parseSketch(t.code), { dark: false, style: "hand-drawn" });
    expect(svg.startsWith("<svg")).toBe(true);
  });
});

describe("sides and elbow connectors", () => {
  it("parses and writes pinned sides and the elbow option", () => {
    const sketch = parseSketch("sketch\nbox a 0 0 100 50\nbox b 0 200 100 50\narrow a.bottom -> b.top elbow");
    expect(sketch.elements[2]).toMatchObject({ from: { id: "a", side: "bottom" }, to: { id: "b", side: "top" }, route: "elbow" });
    expect(serializeSketch(sketch)).toContain("arrow a.bottom -> b.top elbow");
    expect(errorOf("sketch\nbox a 0 0 9 9\narrow a.middle -> a").message).toMatch(/from -> to/);
  });

  it("routes an org chart line down, across and down", () => {
    const sketch = parseSketch("sketch\nbox boss 100 0 100 50\nbox dev 0 200 100 50\narrow boss -> dev elbow");
    const path = linkPath(sketch.elements[2] as LinkEl, shapeMap(sketch));
    expect(path).toEqual([
      { x: 150, y: 54 },
      { x: 150, y: 125 },
      { x: 50, y: 125 },
      { x: 50, y: 196 },
    ]);
  });

  it("goes straight when the boxes line up, and turns once between a bottom and a side", () => {
    const aligned = parseSketch("sketch\nbox a 0 0 100 50\nbox b 0 200 100 50\narrow a -> b elbow");
    expect(linkPath(aligned.elements[2] as LinkEl, shapeMap(aligned))).toHaveLength(2);
    const corner = parseSketch("sketch\nbox a 0 0 100 50\nbox b 300 200 100 50\narrow a.bottom -> b.left elbow");
    expect(linkPath(corner.elements[2] as LinkEl, shapeMap(corner))).toEqual([
      { x: 50, y: 54 },
      { x: 50, y: 225 },
      { x: 296, y: 225 },
    ]);
  });
});

describe("snapping and arranging", () => {
  const others = [{ x: 100, y: 100, w: 100, h: 50 }];

  it("lines a moving box up with another's edge or centre", () => {
    const left = alignSnap({ x: 104, y: 300, w: 60, h: 40 }, others, 6);
    expect(left).toMatchObject({ dx: -4, dy: 0, guides: { x: [100], y: [] } });
    const centre = alignSnap({ x: 400, y: 103, w: 60, h: 40 }, others, 6);
    expect(centre.dy).toBe(2); // centres at 125
    expect(alignSnap({ x: 130, y: 300, w: 60, h: 40 }, others, 6).guides.x).toEqual([]);
  });

  it("snaps a dragged edge", () => {
    expect(edgeSnap(197, others, "x", 6)).toEqual({ value: 200, guide: 200 });
    expect(edgeSnap(170, others, "x", 6)).toEqual({ value: 170 });
  });

  it("aligns and distributes boxes", () => {
    const boxes = [
      { x: 0, y: 0, w: 50, h: 20 },
      { x: 100, y: 40, w: 30, h: 20 },
      { x: 300, y: 10, w: 50, h: 20 },
    ];
    expect(align(boxes, "left").map((b) => b.x)).toEqual([0, 0, 0]);
    expect(align(boxes, "right").map((b) => b.x + b.w)).toEqual([350, 350, 350]);
    expect(align(boxes, "middle").map((b) => b.y + b.h / 2)).toEqual([30, 30, 30]);
    const spread = distribute(boxes, "x");
    expect(spread[1].x - (spread[0].x + spread[0].w)).toBeCloseTo(spread[2].x - (spread[1].x + spread[1].w));
    expect(spread[0].x).toBe(0);
    expect(spread[2].x).toBe(300);
  });
});
