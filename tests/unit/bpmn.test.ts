import { beforeAll, describe, expect, it } from "vitest";
import type { VizInstance } from "../../src/engines/graphviz";
import { layoutBpmn, needsLayout } from "../../src/engines/bpmn/layout";
import { BpmnError, isDefaultFlow, lineIndex, parseBpmn } from "../../src/engines/bpmn/model";
import { drawBpmn, wrap } from "../../src/engines/bpmn/render";
import { detectEngine } from "../../src/engines/detect";
import { TEMPLATES } from "../../src/templates";

const doc = (body: string) =>
  `<?xml version="1.0"?>\n<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d">\n${body}\n</definitions>`;

const errorOf = (source: string): BpmnError => {
  try {
    parseBpmn(source);
  } catch (err) {
    if (err instanceof BpmnError) return err;
    throw err;
  }
  throw new Error("expected a BpmnError");
};

let viz: VizInstance;
beforeAll(async () => {
  // @ts-expect-error: the script ships without type declarations.
  await import("@plantuml/core/viz-global.js");
  viz = await (globalThis as unknown as { Viz: { instance(): Promise<VizInstance> } }).Viz.instance();
});

describe("parseBpmn", () => {
  it("reads elements, flows and lines, with or without a namespace prefix", () => {
    for (const prefix of ["", "bpmn:"]) {
      const src = `<${prefix}definitions xmlns${prefix ? ":bpmn" : ""}="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <${prefix}process id="p">
    <${prefix}startEvent id="s" name="Go" />
    <${prefix}userTask id="t" name="Do it" />
    <${prefix}sequenceFlow id="f" sourceRef="s" targetRef="t" />
  </${prefix}process>
</${prefix}definitions>`;
      const model = parseBpmn(src);
      expect(model.processes).toEqual(["p"]);
      expect(model.nodes.get("s")).toMatchObject({ kind: "event", position: "start", name: "Go", line: 3 });
      expect(model.nodes.get("t")).toMatchObject({ kind: "task", type: "userTask", processId: "p" });
      expect(model.flows).toEqual([expect.objectContaining({ id: "f", kind: "sequence", source: "s", target: "t", line: 5 })]);
    }
  });

  it("reads event definitions, boundary events, loops, lanes and data associations", () => {
    const model = parseBpmn(
      doc(`<process id="p">
  <laneSet><lane id="L" name="Staff"><flowNodeRef>t</flowNodeRef></lane></laneSet>
  <task id="t"><multiInstanceLoopCharacteristics isSequential="true" />
    <dataInputAssociation id="di"><sourceRef>d</sourceRef><targetRef>x</targetRef></dataInputAssociation>
  </task>
  <dataObjectReference id="d" name="Form" />
  <boundaryEvent id="b" attachedToRef="t" cancelActivity="false"><timerEventDefinition /></boundaryEvent>
  <endEvent id="e"><messageEventDefinition /></endEvent>
</process>`),
    );
    expect(model.nodes.get("L")?.members).toEqual(["t"]);
    expect(model.nodes.get("t")?.loop).toBe("sequential");
    expect(model.nodes.get("b")).toMatchObject({ position: "boundary", definition: "timer", interrupting: false, attachedTo: "t" });
    expect(model.nodes.get("e")).toMatchObject({ definition: "message", throwing: true });
    expect(model.flows).toContainEqual(expect.objectContaining({ kind: "data", source: "d", target: "t" }));
  });

  it("reads pools, message flows and default flows", () => {
    const model = parseBpmn(
      doc(`<collaboration id="c">
  <participant id="A" name="Shop" processRef="p" />
  <participant id="B" name="Bank" />
  <messageFlow id="m" sourceRef="t" targetRef="B" />
</collaboration>
<process id="p"><exclusiveGateway id="g" default="f2" /><task id="t" />
  <sequenceFlow id="f1" sourceRef="g" targetRef="t" /><sequenceFlow id="f2" sourceRef="g" targetRef="t" /></process>`),
    );
    expect(model.nodes.get("A")).toMatchObject({ kind: "participant", processRef: "p" });
    expect(model.flows.find((f) => f.id === "m")?.kind).toBe("message");
    expect(isDefaultFlow(model, "f2")).toBe(true);
    expect(isDefaultFlow(model, "f1")).toBe(false);
  });

  it("reads diagram interchange bounds, waypoints and colours", () => {
    const model = parseBpmn(`<definitions xmlns:bioc="http://bpmn.io/schema/bpmn/biocolor/1.0">
<process id="p"><task id="t" /><task id="u" /><sequenceFlow id="f" sourceRef="t" targetRef="u" /></process>
<BPMNDiagram><BPMNPlane bpmnElement="p">
  <BPMNShape bpmnElement="t" bioc:fill="#ffcc00"><Bounds x="10" y="20" width="100" height="80" /></BPMNShape>
  <BPMNEdge bpmnElement="f"><waypoint x="110" y="60" /><waypoint x="200" y="60" /></BPMNEdge>
</BPMNPlane></BPMNDiagram></definitions>`);
    expect(model.shapes.get("t")).toMatchObject({ bounds: { x: 10, y: 20, width: 100, height: 80 }, fill: "#ffcc00" });
    expect(model.edges.get("f")?.points).toEqual([{ x: 110, y: 60 }, { x: 200, y: 60 }]);
    expect(needsLayout(model)).toBe(false);
  });

  it("explains missing roots, empty files and broken references", () => {
    expect(errorOf("<process id='p' />").message).toMatch(/<definitions>/);
    expect(errorOf(doc("")).message).toMatch(/nothing to draw/);
    const err = errorOf(doc(`<process id="p">\n<task id="t" />\n<sequenceFlow id="f" sourceRef="t" targetRef="nope" />\n</process>`));
    expect(err.message).toContain('"nope"');
    expect(err.line).toBe(5);
  });
});

describe("lineIndex", () => {
  it("finds the first line that declares each id", () => {
    const at = lineIndex('<a id="x"/>\n<b\n  id="y"/>\n<c id="x"/>');
    expect([at("x"), at("y"), at("z")]).toEqual([1, 3, undefined]);
  });
});

describe("wrap", () => {
  it("breaks text into lines that fit and splits very long words", () => {
    expect(wrap("Check the availability of the book", 90)).toEqual(["Check the", "availability", "of the book"]);
    const pieces = wrap("Supercalifragilistic", 50);
    expect(pieces.length).toBeGreaterThan(2);
    expect(pieces.every((l) => l.length <= 8)).toBe(true);
  });
});

describe("detectEngine", () => {
  it("recognises BPMN XML, with or without a prolog", () => {
    expect(detectEngine(doc(""))).toBe("bpmn");
    expect(detectEngine('<bpmn:definitions xmlns:bpmn="x">')).toBe("bpmn");
    expect(detectEngine("<html><body></body></html>")).toBeNull();
  });
});

describe("layout and drawing", () => {
  const templates = TEMPLATES.filter((t) => t.engine === "bpmn");

  it("has templates, including one with a saved layout", () => {
    expect(templates.length).toBeGreaterThan(3);
    expect(templates.some((t) => !needsLayout(parseBpmn(t.code)))).toBe(true);
  });

  it.each(templates.map((t) => [t.id, t] as const))("lays out and draws %s", (_id, t) => {
    const model = parseBpmn(t.code);
    if (needsLayout(model)) layoutBpmn(model, viz);
    for (const node of model.nodes.values()) {
      if (node.kind === "lane" && !node.members?.length) continue;
      expect(model.shapes.has(node.id), node.id).toBe(true);
    }
    for (const flow of model.flows) expect(model.edges.get(flow.id)?.points.length, flow.id).toBeGreaterThanOrEqual(2);
    for (const dark of [false, true]) {
      const svg = drawBpmn(model, { dark, style: "colour" });
      const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
      expect(parsed.getElementsByTagName("parsererror")).toHaveLength(0);
      expect(svg).toContain("data-source-line");
    }
  });

  it("keeps shapes from overlapping inside a lane", () => {
    const model = parseBpmn(TEMPLATES.find((t) => t.id === "bpmn-loan")!.code);
    layoutBpmn(model, viz);
    const boxes = [...model.nodes.values()]
      .filter((n) => !["lane", "participant"].includes(n.kind) && n.position !== "boundary")
      .map((n) => model.shapes.get(n.id)!.bounds);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlap).toBe(false);
      }
    }
  });
});
