// Reads BPMN 2.0 XML into a small model: the elements, the flows between
// them and, when the file has one, the diagram interchange (DI) layout that
// modellers such as Camunda and bpmn.io save alongside.
//
// Element names are matched by local name, ignoring namespaces, so files
// written by hand without the full set of xmlns declarations still work.

export type Kind =
  | "event"
  | "task"
  | "subProcess"
  | "callActivity"
  | "gateway"
  | "dataObject"
  | "dataStore"
  | "textAnnotation"
  | "group"
  | "participant"
  | "lane";

export type FlowKind = "sequence" | "message" | "association" | "data";

export interface BpmnNode {
  id: string;
  /** XML element name, e.g. "userTask" or "exclusiveGateway". */
  type: string;
  kind: Kind;
  name: string;
  /** 1-based line of the element in the source. */
  line?: number;
  /** For events: "start", "end", "intermediate" or "boundary". */
  position?: "start" | "end" | "intermediate" | "boundary";
  /** For events: message, timer, error, signal and so on. */
  definition?: string;
  throwing?: boolean;
  interrupting?: boolean;
  attachedTo?: string;
  loop?: "standard" | "parallel" | "sequential";
  /** The process this node belongs to. */
  processId?: string;
  /** For participants: the process drawn inside the pool. */
  processRef?: string;
  /** Lanes: ids of the flow nodes in the lane. */
  members?: string[];
  /** Annotation text. */
  text?: string;
  /** Default flow of a gateway or activity. */
  defaultFlow?: string;
}

export interface BpmnFlow {
  id: string;
  kind: FlowKind;
  source: string;
  target: string;
  name: string;
  line?: number;
  conditional?: boolean;
  directed?: boolean;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ShapeDi {
  bounds: Bounds;
  label?: Bounds;
  horizontal?: boolean;
  expanded?: boolean;
  markerVisible?: boolean;
  fill?: string;
  stroke?: string;
}

export interface EdgeDi {
  points: { x: number; y: number }[];
  label?: Bounds;
  stroke?: string;
}

export interface BpmnModel {
  nodes: Map<string, BpmnNode>;
  flows: BpmnFlow[];
  /** Process ids in document order. */
  processes: string[];
  shapes: Map<string, ShapeDi>;
  edges: Map<string, EdgeDi>;
}

export class BpmnError extends Error {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(message);
  }
}

const EVENT_TYPES: Record<string, BpmnNode["position"]> = {
  startEvent: "start",
  endEvent: "end",
  intermediateCatchEvent: "intermediate",
  intermediateThrowEvent: "intermediate",
  boundaryEvent: "boundary",
};

const TASK_TYPES = new Set([
  "task", "userTask", "serviceTask", "scriptTask", "sendTask", "receiveTask", "manualTask", "businessRuleTask",
]);

const GATEWAY_TYPES = new Set(["exclusiveGateway", "parallelGateway", "inclusiveGateway", "eventBasedGateway", "complexGateway"]);

const SUBPROCESS_TYPES = new Set(["subProcess", "transaction", "adHocSubProcess"]);

function kindOf(type: string): Kind | undefined {
  if (type in EVENT_TYPES) return "event";
  if (TASK_TYPES.has(type)) return "task";
  if (GATEWAY_TYPES.has(type)) return "gateway";
  if (SUBPROCESS_TYPES.has(type)) return "subProcess";
  if (type === "callActivity") return "callActivity";
  if (type === "dataObjectReference" || type === "dataObject") return "dataObject";
  if (type === "dataStoreReference") return "dataStore";
  if (type === "textAnnotation") return "textAnnotation";
  if (type === "group") return "group";
  if (type === "participant") return "participant";
  if (type === "lane") return "lane";
  return undefined;
}

/** Line of `id="..."` in the source, for errors and click-to-source. */
export function lineIndex(source: string): (id: string) => number | undefined {
  const lines = new Map<string, number>();
  const re = /\bid\s*=\s*["']([^"']+)["']/g;
  let line = 1;
  let last = 0;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    for (let i = last; i < m.index; i++) if (source.charCodeAt(i) === 10) line++;
    last = m.index;
    if (!lines.has(m[1])) lines.set(m[1], line);
  }
  return (id) => lines.get(id);
}

function parseXml(source: string): Document {
  const doc = new DOMParser().parseFromString(source, "application/xml");
  const error = doc.getElementsByTagName("parsererror")[0];
  if (error) {
    const text = error.textContent ?? "";
    // Chrome: "error on line 3 at column 5: Opening and ending tag mismatch ..."
    // Firefox: "XML Parsing Error: mismatched tag ... Line Number 3, Column 5:"
    const chrome = text.match(/line (\d+) at column \d+:\s*([^\n]+)/i);
    const firefox = text.match(/Line Number (\d+)/i);
    const reason = chrome?.[2] ?? text.match(/XML Parsing Error:\s*([^\n]+)/i)?.[1] ?? "The XML isn't well formed.";
    const line = Number(chrome?.[1] ?? firefox?.[1]) || undefined;
    throw new BpmnError(`${reason.trim().replace(/\.?$/, ".")}`, line);
  }
  return doc;
}

const local = (el: Element) => el.localName;
const children = (el: Element, name?: string) => [...el.children].filter((c) => !name || local(c) === name);

/** Attribute by local name, so bioc:fill and color:background-color both match. */
function attrByLocal(el: Element, ...names: string[]): string | undefined {
  for (const a of el.attributes) if (names.includes(a.localName) || names.includes(a.name.split(":").pop()!)) return a.value;
  return undefined;
}

function num(el: Element, name: string): number {
  return Number(el.getAttribute(name) ?? NaN);
}

function readBounds(el: Element | undefined): Bounds | undefined {
  if (!el) return undefined;
  const b = { x: num(el, "x"), y: num(el, "y"), width: num(el, "width"), height: num(el, "height") };
  return Object.values(b).every(Number.isFinite) ? b : undefined;
}

export function parseBpmn(source: string): BpmnModel {
  const doc = parseXml(source);
  const root = doc.documentElement;
  if (local(root) !== "definitions") {
    throw new BpmnError("A BPMN file starts with a <definitions> element (usually bpmn:definitions).", 1);
  }
  const lineOf = lineIndex(source);
  const model: BpmnModel = { nodes: new Map(), flows: [], processes: [], shapes: new Map(), edges: new Map() };

  const addNode = (el: Element, kind: Kind, processId?: string): BpmnNode => {
    const id = el.getAttribute("id") ?? `${local(el)}_${model.nodes.size + 1}`;
    const node: BpmnNode = { id, type: local(el), kind, name: el.getAttribute("name") ?? "", line: lineOf(id), processId };
    model.nodes.set(id, node);
    return node;
  };

  const visitContainer = (container: Element, processId: string) => {
    for (const el of children(container)) {
      const type = local(el);
      const kind = kindOf(type);
      if (type === "sequenceFlow") {
        model.flows.push({
          id: el.getAttribute("id") ?? `flow_${model.flows.length + 1}`,
          kind: "sequence",
          source: el.getAttribute("sourceRef") ?? "",
          target: el.getAttribute("targetRef") ?? "",
          name: el.getAttribute("name") ?? "",
          line: lineOf(el.getAttribute("id") ?? ""),
          conditional: children(el, "conditionExpression").length > 0,
        });
        continue;
      }
      if (type === "association") {
        model.flows.push(associationOf(el, lineOf));
        continue;
      }
      if (type === "laneSet") {
        visitLanes(el, processId);
        continue;
      }
      if (!kind || kind === "participant" || kind === "lane") continue;
      if (type === "dataObject") continue; // only references are drawn
      const node = addNode(el, kind, processId);
      if (kind === "event") describeEvent(el, node);
      if (kind === "textAnnotation") node.text = children(el, "text")[0]?.textContent?.trim() ?? "";
      if (kind === "task" || kind === "subProcess" || kind === "callActivity") {
        const loop = children(el).find((c) => /LoopCharacteristics$/.test(local(c)));
        if (loop) {
          node.loop = local(loop) === "standardLoopCharacteristics" ? "standard" : loop.getAttribute("isSequential") === "true" ? "sequential" : "parallel";
        }
        for (const assoc of children(el)) {
          const t = local(assoc);
          if (t !== "dataInputAssociation" && t !== "dataOutputAssociation") continue;
          const ref = (name: string) => children(assoc, name)[0]?.textContent?.trim() ?? "";
          const input = t === "dataInputAssociation";
          const other = input ? ref("sourceRef") : ref("targetRef");
          if (!other) continue;
          model.flows.push({
            id: assoc.getAttribute("id") ?? `${node.id}_${t}_${other}`,
            kind: "data",
            source: input ? other : node.id,
            target: input ? node.id : other,
            name: "",
            line: lineOf(assoc.getAttribute("id") ?? "") ?? node.line,
            directed: true,
          });
        }
      }
      const dflt = el.getAttribute("default");
      if (dflt) node.defaultFlow = dflt;
      if (kind === "subProcess") visitContainer(el, processId);
    }
  };

  const visitLanes = (laneSet: Element, processId: string) => {
    for (const lane of children(laneSet, "lane")) {
      const node = addNode(lane, "lane", processId);
      node.members = children(lane, "flowNodeRef").map((r) => r.textContent?.trim() ?? "").filter(Boolean);
      for (const child of children(lane, "childLaneSet")) visitLanes(child, processId);
    }
  };

  for (const el of children(root)) {
    const type = local(el);
    if (type === "process") {
      const id = el.getAttribute("id") ?? `process_${model.processes.length + 1}`;
      model.processes.push(id);
      visitContainer(el, id);
    } else if (type === "collaboration") {
      for (const c of children(el)) {
        const t = local(c);
        if (t === "participant") {
          addNode(c, "participant").processRef = c.getAttribute("processRef") ?? undefined;
        } else if (t === "messageFlow") {
          model.flows.push({
            id: c.getAttribute("id") ?? `message_${model.flows.length + 1}`,
            kind: "message",
            source: c.getAttribute("sourceRef") ?? "",
            target: c.getAttribute("targetRef") ?? "",
            name: c.getAttribute("name") ?? "",
            line: lineOf(c.getAttribute("id") ?? ""),
          });
        } else if (t === "association") {
          model.flows.push(associationOf(c, lineOf));
        } else if (t === "textAnnotation" || t === "group") {
          const node = addNode(c, kindOf(t)!);
          if (t === "textAnnotation") node.text = children(c, "text")[0]?.textContent?.trim() ?? "";
        }
      }
    }
  }

  readDi(root, model);
  validate(model);
  return model;
}

/** True when the flow is a gateway's or activity's default (drawn with a slash). */
export function isDefaultFlow(model: BpmnModel, flowId: string): boolean {
  for (const node of model.nodes.values()) if (node.defaultFlow === flowId) return true;
  return false;
}

function associationOf(el: Element, lineOf: (id: string) => number | undefined): BpmnFlow {
  const id = el.getAttribute("id") ?? "association";
  return {
    id,
    kind: "association",
    source: el.getAttribute("sourceRef") ?? "",
    target: el.getAttribute("targetRef") ?? "",
    name: "",
    line: lineOf(id),
    directed: (el.getAttribute("associationDirection") ?? "None") !== "None",
  };
}

const DEFINITIONS = [
  "message", "timer", "error", "signal", "escalation", "conditional", "link", "compensate", "cancel", "terminate",
];

function describeEvent(el: Element, node: BpmnNode) {
  node.position = EVENT_TYPES[node.type];
  node.throwing = node.type === "endEvent" || node.type === "intermediateThrowEvent";
  const defs = children(el).filter((c) => /EventDefinition$/.test(local(c)));
  const names = defs.map((d) => local(d).replace(/EventDefinition$/, ""));
  node.definition = names.length > 1 ? "multiple" : names.find((n) => DEFINITIONS.includes(n));
  if (node.type === "boundaryEvent") {
    node.attachedTo = el.getAttribute("attachedToRef") ?? undefined;
    node.interrupting = el.getAttribute("cancelActivity") !== "false";
  } else if (node.type === "startEvent") {
    node.interrupting = el.getAttribute("isInterrupting") !== "false";
  }
}

function readDi(root: Element, model: BpmnModel) {
  for (const el of root.getElementsByTagName("*")) {
    const type = local(el);
    if (type !== "BPMNShape" && type !== "BPMNEdge") continue;
    const ref = el.getAttribute("bpmnElement");
    if (!ref) continue;
    const label = readBounds(children(el, "BPMNLabel").flatMap((l) => children(l, "Bounds"))[0]);
    if (type === "BPMNShape") {
      const bounds = readBounds(children(el, "Bounds")[0]);
      if (!bounds) continue;
      model.shapes.set(ref, {
        bounds,
        label,
        horizontal: el.getAttribute("isHorizontal") !== "false",
        expanded: el.hasAttribute("isExpanded") ? el.getAttribute("isExpanded") === "true" : undefined,
        markerVisible: el.getAttribute("isMarkerVisible") === "true",
        fill: attrByLocal(el, "fill", "background-color"),
        stroke: attrByLocal(el, "stroke", "border-color"),
      });
    } else {
      const points = children(el, "waypoint")
        .map((w) => ({ x: num(w, "x"), y: num(w, "y") }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      if (points.length >= 2) model.edges.set(ref, { points, label, stroke: attrByLocal(el, "stroke", "border-color") });
    }
  }
}

function validate(model: BpmnModel) {
  const drawable = [...model.nodes.values()].filter((n) => n.kind !== "lane");
  if (!drawable.length) {
    throw new BpmnError("There's nothing to draw yet. Add a <process> with events, tasks and sequence flows.", 1);
  }
  for (const flow of model.flows) {
    for (const [end, ref] of [["source", flow.source], ["target", flow.target]] as const) {
      if (!ref) throw new BpmnError(`The flow "${flow.id}" has no ${end}Ref.`, flow.line);
      if (!model.nodes.has(ref)) throw new BpmnError(`The flow "${flow.id}" points to "${ref}", which doesn't exist.`, flow.line);
    }
  }
  for (const node of model.nodes.values()) {
    if (node.attachedTo && !model.nodes.has(node.attachedTo)) {
      throw new BpmnError(`The boundary event "${node.id}" is attached to "${node.attachedTo}", which doesn't exist.`, node.line);
    }
  }
}
