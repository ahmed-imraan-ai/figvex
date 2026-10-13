import { beforeAll, describe, expect, it } from "vitest";
import { addDiagram, laneChanges, moveInModel, movingSet, rerouteEdge, writeLanes, writePositions } from "../../src/engines/bpmn/edit";
import { layoutBpmn, needsLayout } from "../../src/engines/bpmn/layout";
import { parseBpmn } from "../../src/engines/bpmn/model";
import type { VizInstance } from "../../src/engines/graphviz";
import { TEMPLATES } from "../../src/templates";

let viz: VizInstance;
beforeAll(async () => {
  // @ts-expect-error: the script ships without type declarations.
  await import("@plantuml/core/viz-global.js");
  viz = await (globalThis as unknown as { Viz: { instance(): Promise<VizInstance> } }).Viz.instance();
});

const template = (id: string) => TEMPLATES.find((t) => t.id === id)!.code;
const SAVED = template("bpmn-saved-layout");

/** Moves `ids` and writes the result back, as a drag in the preview does. */
function drag(source: string, ids: string[], dx: number, dy: number) {
  const model = parseBpmn(source);
  const { shapes, edges, moved } = moveInModel(model, ids, { dx, dy });
  const flows = model.flows.filter((f) => moved.has(f.source) || moved.has(f.target)).map((f) => f.id);
  return writePositions(source, shapes, edges, { shapes: moved, edges: flows });
}

describe("rerouteEdge", () => {
  const line = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];

  it("shifts a whole route when both ends move together", () => {
    expect(rerouteEdge(line, { dx: 5, dy: 7 }, { dx: 5, dy: 7 })).toEqual([
      { x: 5, y: 7 },
      { x: 105, y: 7 },
    ]);
  });

  it("keeps a straight flow straight when the move is along it", () => {
    expect(rerouteEdge(line, null, { dx: 20, dy: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 120, y: 0 },
    ]);
  });

  it("gives a straight flow a dog-leg when one end moves across it", () => {
    expect(rerouteEdge(line, null, { dx: 0, dy: 40 })).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
      { x: 100, y: 40 },
    ]);
  });

  it("keeps the right angle at the bend next to a moved end", () => {
    const elbow = [
      { x: 420, y: 145 },
      { x: 420, y: 230 },
      { x: 502, y: 230 },
    ];
    expect(rerouteEdge(elbow, null, { dx: 10, dy: 30 })).toEqual([
      { x: 420, y: 145 },
      { x: 420, y: 260 },
      { x: 512, y: 260 },
    ]);
    expect(rerouteEdge(elbow, { dx: 15, dy: 0 }, null)).toEqual([
      { x: 435, y: 145 },
      { x: 435, y: 230 },
      { x: 502, y: 230 },
    ]);
  });
});

describe("movingSet", () => {
  it("takes boundary events along with their activity", async () => {
    const model = parseBpmn(template("bpmn-loan"));
    layoutBpmn(model, viz);
    expect(movingSet(model, ["collect"])).toEqual(new Set(["collect", "overdue"]));
  });

  it("takes everything inside a pool along with it", () => {
    const model = parseBpmn(template("bpmn-order"));
    layoutBpmn(model, viz);
    const set = movingSet(model, ["customer"]);
    const inCustomer = [...model.nodes.values()].filter((n) => n.processId === "buying").map((n) => n.id);
    expect(inCustomer.length).toBeGreaterThan(2);
    for (const id of inCustomer) expect(set.has(id)).toBe(true);
    expect(set.has("shop")).toBe(false);
  });
});

describe("writePositions", () => {
  it("rewrites only the moved shape, its label and its flows", () => {
    const out = drag(SAVED, ["review"], 20, 40);
    const after = parseBpmn(out);
    expect(after.shapes.get("review")!.bounds).toMatchObject({ x: 260, y: 120, width: 100, height: 80 });
    expect(after.shapes.get("pay")!.bounds).toMatchObject({ x: 500, y: 80 });
    // f1 ends at review, which moved down: it gets a dog-leg.
    expect(after.edges.get("f1")!.points).toEqual([
      { x: 188, y: 120 },
      { x: 224, y: 120 },
      { x: 224, y: 160 },
      { x: 260, y: 160 },
    ]);
    // Outside the edited tags, nothing changes.
    const strip = (s: string) => s.replace(/<(dc:Bounds|di:waypoint)[^>]*>/g, "");
    expect(strip(out)).toBe(strip(SAVED));
  });

  it("moves a shape's label with it", () => {
    const after = parseBpmn(drag(SAVED, ["submit"], -10, 5));
    expect(after.shapes.get("submit")!.label).toMatchObject({ x: 120, y: 150 });
  });

  it("keeps a flow label with a flow that moves", () => {
    const after = parseBpmn(drag(SAVED, ["rejected"], 0, 20));
    expect(after.edges.get("no")!.points.at(-1)).toEqual({ x: 502, y: 250 });
    expect(after.edges.get("no")!.label).toMatchObject({ x: 428, y: 190 });
  });

  it("round-trips: moving back restores the original numbers", () => {
    const there = drag(SAVED, ["pay"], 0, 0);
    expect(there).toBe(SAVED);
    expect(drag(drag(SAVED, ["approved"], 30, 0), ["approved"], -30, 0)).toBe(SAVED);
  });
});

describe("lanes", () => {
  it("moves a task dropped in another lane into that lane", () => {
    const source = template("bpmn-loan");
    const model = parseBpmn(source);
    layoutBpmn(model, viz);
    const member = model.shapes.get("member")!.bounds;
    const librarian = model.shapes.get("librarian")!.bounds;
    const collect = model.shapes.get("collect")!.bounds;
    // From the Member lane down into the middle of the Librarian lane.
    const dy = librarian.y + librarian.height / 2 - (collect.y + collect.height / 2);
    expect(collect.y).toBeLessThan(member.y + member.height);
    const { shapes, moved } = moveInModel(model, ["collect"], { dx: 0, dy });
    const changes = laneChanges(model, shapes, moved);
    expect(changes.get("collect")).toEqual({ from: ["member"], to: "librarian" });
    // The boundary event went with it and was already a librarian node.
    expect(changes.has("overdue")).toBe(false);
    const after = parseBpmn(writeLanes(source, changes));
    expect(after.nodes.get("member")!.members).not.toContain("collect");
    expect(after.nodes.get("librarian")!.members).toContain("collect");
    // Indented like its neighbours.
    expect(writeLanes(source, changes)).toMatch(/\n {8}<flowNodeRef>returned<\/flowNodeRef>\n {8}<flowNodeRef>collect<\/flowNodeRef>\n {6}<\/lane>/);
  });

  it("leaves lanes alone when a task stays in its lane", () => {
    const model = parseBpmn(template("bpmn-loan"));
    layoutBpmn(model, viz);
    const { shapes, moved } = moveInModel(model, ["check"], { dx: 10, dy: 0 });
    expect(laneChanges(model, shapes, moved).size).toBe(0);
  });
});

describe("addDiagram", () => {
  it("writes a laid-out file's positions so it no longer needs a layout", () => {
    const source = template("bpmn-loan");
    const model = parseBpmn(source);
    expect(needsLayout(model)).toBe(true);
    layoutBpmn(model, viz);
    const { shapes, edges } = moveInModel(model, ["collect"], { dx: 0, dy: 50 });
    const out = addDiagram(source, model, shapes, edges);
    expect(out.startsWith(source.slice(0, source.indexOf("<definitions")))).toBe(true);
    const after = parseBpmn(out);
    expect(needsLayout(after)).toBe(false);
    expect(after.shapes.size).toBe(shapes.size);
    expect(after.edges.size).toBe(edges.size);
    expect(after.shapes.get("collect")!.bounds.y).toBeCloseTo(shapes.get("collect")!.bounds.y, 1);
    expect(out).toMatch(/xmlns:bpmndi="http:\/\/www.omg.org\/spec\/BPMN\/20100524\/DI"/);
    expect(out.trimEnd().endsWith("</definitions>")).toBe(true);
  });

  it("works for pools and lanes too", () => {
    const source = template("bpmn-order");
    const model = parseBpmn(source);
    layoutBpmn(model, viz);
    const after = parseBpmn(addDiagram(source, model, model.shapes, model.edges));
    expect(after.shapes.get("customer")).toMatchObject({ horizontal: true });
    expect(after.shapes.size).toBe(model.shapes.size);
  });

  it("reuses DI prefixes the file already declares", () => {
    const source = SAVED.replace(/\s*<bpmndi:BPMNDiagram[\s\S]*<\/bpmndi:BPMNDiagram>/, "");
    const model = parseBpmn(source);
    layoutBpmn(model, viz);
    const out = addDiagram(source, model, model.shapes, model.edges);
    expect(out.match(/xmlns:bpmndi=/g)).toHaveLength(1);
    expect(out).toContain("<bpmndi:BPMNShape");
    expect(out.trimEnd().endsWith("</bpmn:definitions>")).toBe(true);
    expect(parseBpmn(out).shapes.size).toBe(model.shapes.size);
  });
});
