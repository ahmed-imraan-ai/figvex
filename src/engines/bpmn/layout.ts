// Automatic layout for BPMN files that carry no diagram interchange (DI).
// Graphviz orders the flow nodes left to right; pools and lanes are then
// stacked as horizontal bands, the way BPMN tools draw them. The result is
// written into the model as if it had come from the file's own DI.

import type { VizInstance } from "../graphviz";
import type { BpmnModel, BpmnNode, Bounds } from "./model";

const SIZE: Partial<Record<BpmnNode["kind"], { width: number; height: number }>> = {
  event: { width: 36, height: 36 },
  task: { width: 100, height: 80 },
  subProcess: { width: 100, height: 80 },
  callActivity: { width: 100, height: 80 },
  gateway: { width: 50, height: 50 },
  dataObject: { width: 36, height: 50 },
  dataStore: { width: 50, height: 50 },
  textAnnotation: { width: 110, height: 40 },
};

const POOL_HEADER = 30;
const LANE_HEADER = 30;
const PAD = 30;
const ROW = 110;
const POOL_GAP = 50;

type Point = { x: number; y: number };

const center = (b: Bounds): Point => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

export function needsLayout(model: BpmnModel): boolean {
  return model.shapes.size === 0;
}

export function layoutBpmn(model: BpmnModel, viz: VizInstance) {
  const nodes = [...model.nodes.values()];
  const participants = nodes.filter((n) => n.kind === "participant");
  const pooled = new Set(participants.map((p) => p.processRef).filter(Boolean));

  // Annotations outside a process join the process of what they annotate.
  for (const flow of model.flows) {
    if (flow.kind !== "association") continue;
    const [a, b] = [model.nodes.get(flow.source)!, model.nodes.get(flow.target)!];
    if (a.kind === "textAnnotation" && !a.processId) a.processId = b.processId;
    if (b.kind === "textAnnotation" && !b.processId) b.processId = a.processId;
  }

  // Each process becomes one block; pools without a process are empty bands.
  const blocks: { participant?: BpmnNode; processId?: string; width: number; height: number; place: (x: number, y: number, width: number) => void }[] = [];
  for (const p of participants) blocks.push(processBlock(model, viz, p.processRef, p));
  for (const pid of model.processes) if (!pooled.has(pid)) blocks.push(processBlock(model, viz, pid));

  const width = Math.max(600, ...blocks.map((b) => b.width));
  let y = 0;
  for (const block of blocks) {
    block.place(0, y, width);
    y += block.height + POOL_GAP;
  }
  routeFlows(model);
}

function processBlock(model: BpmnModel, viz: VizInstance, processId: string | undefined, participant?: BpmnNode) {
  const members = [...model.nodes.values()].filter(
    (n) => processId && n.processId === processId && SIZE[n.kind] && n.position !== "boundary",
  );
  const lanes = [...model.nodes.values()].filter((n) => n.kind === "lane" && n.processId === processId);
  const boundaryOf = new Map<string, string>(); // boundary event -> activity
  for (const n of model.nodes.values()) if (n.attachedTo && n.processId === processId) boundaryOf.set(n.id, n.attachedTo);

  if (members.every((m) => m.kind === "textAnnotation")) {
    // A black-box pool, or an empty process.
    const height = participant ? 60 : 0;
    return {
      participant,
      processId,
      width: 600,
      height,
      place: (x: number, y: number, width: number) => {
        if (participant) model.shapes.set(participant.id, { bounds: { x, y, width, height }, horizontal: true });
      },
    };
  }

  // Graphviz picks the order: left to right, flows as edges. Notes are placed
  // afterwards, next to what they annotate, so they stay out of the flow.
  const notes = members.filter((m) => m.kind === "textAnnotation");
  const laid = members.filter((m) => m.kind !== "textAnnotation");
  const ids = new Set(laid.map((m) => m.id));
  const quote = (s: string) => `"${s.replace(/["\\]/g, "\\$&")}"`;
  const lines = ['digraph { rankdir=LR; nodesep=0.7; ranksep=0.55; node [shape=box, fixedsize=true, label=""];'];
  for (const m of laid) {
    const size = SIZE[m.kind]!;
    lines.push(`${quote(m.id)} [width=${size.width / 72}, height=${size.height / 72}];`);
  }
  for (const f of model.flows) {
    const source = boundaryOf.get(f.source) ?? f.source;
    const target = boundaryOf.get(f.target) ?? f.target;
    if (!ids.has(source) || !ids.has(target) || source === target) continue;
    if (f.kind === "sequence") {
      lines.push(`${quote(source)} -> ${quote(target)};`);
      continue;
    }
    // Data sits in the same column as the step that reads or writes it.
    lines.push(`${quote(source)} -> ${quote(target)} [minlen=0];`);
  }
  lines.push("}");
  const result = viz.render(lines.join("\n"), { format: "json" });
  if (result.status !== "success" || !result.output) throw new Error("Graphviz couldn't lay out this process.");
  const json = JSON.parse(result.output) as { bb: string; objects?: { name: string; pos?: string }[] };
  const [, , , bbHeight] = json.bb.split(",").map(Number);
  const pos = new Map<string, Point>();
  for (const o of json.objects ?? []) {
    const [px, py] = (o.pos ?? "0,0").split(",").map(Number);
    pos.set(o.name, { x: px, y: bbHeight - py });
  }

  const left = (participant ? POOL_HEADER : 0) + (lanes.length ? LANE_HEADER : 0) + PAD;
  const contentWidth = Math.max(...laid.map((m) => pos.get(m.id)!.x + SIZE[m.kind]!.width / 2)) + PAD;

  // Assign every node to a lane: the last lane that lists it, so nested
  // lanes win over their parents. Lanes left empty are dropped.
  const laneOf = new Map<string, BpmnNode>();
  for (const lane of lanes) for (const id of lane.members ?? []) laneOf.set(id, lane);
  const usedLanes = lanes.filter((l) => [...laneOf.values()].includes(l));
  if (lanes.length && !usedLanes.length) usedLanes.push(lanes[0]);
  for (const m of members) if (usedLanes.length && !laneOf.has(m.id)) laneOf.set(m.id, usedLanes[0]);

  const placed = new Map<string, Point>(); // centres, relative to the block
  const bands: { lane: BpmnNode; top: number; height: number }[] = [];
  let height: number;
  if (usedLanes.length) {
    let top = 0;
    for (const lane of usedLanes) {
      // Left to right, top first within a column, packed into as few rows
      // as possible so nodes that share a column don't overlap.
      const inLane = laid
        .filter((m) => laneOf.get(m.id) === lane)
        .sort((a, b) => pos.get(a.id)!.x - pos.get(b.id)!.x || pos.get(a.id)!.y - pos.get(b.id)!.y);
      const rows: number[] = [];
      for (const m of inLane) {
        const p = pos.get(m.id)!;
        const half = SIZE[m.kind]!.width / 2;
        let row = rows.findIndex((end) => end < p.x - half - 20);
        if (row < 0) row = rows.push(-Infinity) - 1;
        rows[row] = p.x + half;
        placed.set(m.id, { x: left + p.x, y: top + PAD / 2 + row * ROW + ROW / 2 });
      }
      const laneHeight = Math.max(1, rows.length) * ROW + PAD;
      bands.push({ lane, top, height: laneHeight });
      top += laneHeight;
    }
    height = top;
  } else {
    // Room above for notes.
    const top = notes.length ? PAD + 50 : PAD;
    for (const m of laid) {
      const p = pos.get(m.id)!;
      placed.set(m.id, { x: left + p.x, y: top + p.y });
    }
    height = bbHeight + top + PAD;
  }

  return {
    participant,
    processId,
    width: left + contentWidth,
    height,
    place: (x: number, y: number, width: number) => {
      if (participant) model.shapes.set(participant.id, { bounds: { x, y, width, height }, horizontal: true });
      const laneX = x + (participant ? POOL_HEADER : 0);
      for (const band of bands) {
        model.shapes.set(band.lane.id, { bounds: { x: laneX, y: y + band.top, width: width - (laneX - x), height: band.height }, horizontal: true });
      }
      for (const m of laid) {
        const c = placed.get(m.id)!;
        const size = SIZE[m.kind]!;
        model.shapes.set(m.id, {
          bounds: { x: x + c.x - size.width / 2, y: y + c.y - size.height / 2, ...size },
          markerVisible: true,
          expanded: m.kind === "subProcess" ? false : undefined,
        });
      }
      // Notes go above and to the right of what they annotate, or below it
      // when that would leave its lane.
      for (const note of notes) {
        const link = model.flows.find((f) => f.kind === "association" && (f.source === note.id || f.target === note.id));
        const partnerId = link && (link.source === note.id ? link.target : link.source);
        const partner = partnerId ? model.shapes.get(partnerId)?.bounds : undefined;
        const size = SIZE.textAnnotation!;
        let nx = x + left;
        let ny = y + PAD / 2;
        if (partner) {
          nx = partner.x + partner.width * 0.6;
          ny = partner.y - size.height - 20;
          const band = bands.find((b) => b.lane === laneOf.get(partnerId!));
          if (band && ny < y + band.top + 4) ny = partner.y + partner.height + 20;
        }
        model.shapes.set(note.id, { bounds: { x: nx, y: ny, ...size } });
      }
      // Boundary events sit on the bottom edge of their activity.
      const count = new Map<string, number>();
      for (const [eventId, activityId] of boundaryOf) {
        const host = model.shapes.get(activityId)?.bounds;
        if (!host) continue;
        const i = count.get(activityId) ?? 0;
        count.set(activityId, i + 1);
        model.shapes.set(eventId, { bounds: { x: host.x + host.width - 36 - 8 - i * 40, y: host.y + host.height - 18, width: 36, height: 36 } });
      }
    },
  };
}

/** Orthogonal routes for sequence and message flows; straight lines for the rest. */
function routeFlows(model: BpmnModel) {
  // Message flows that meet the same shape are spread along its edge.
  const messageEnds = new Map<string, string[]>();
  for (const f of model.flows) {
    if (f.kind !== "message") continue;
    for (const id of [f.source, f.target]) messageEnds.set(id, [...(messageEnds.get(id) ?? []), f.id]);
  }
  const offset = (nodeId: string, flowId: string) => {
    const list = messageEnds.get(nodeId) ?? [];
    return (list.indexOf(flowId) - (list.length - 1) / 2) * 20;
  };

  for (const flow of model.flows) {
    const s = model.shapes.get(flow.source)?.bounds;
    const t = model.shapes.get(flow.target)?.bounds;
    if (!s || !t) continue;
    const source = model.nodes.get(flow.source)!;
    const target = model.nodes.get(flow.target)!;
    let points: Point[];
    if (flow.kind === "sequence") points = sequenceRoute(s, t, source, target);
    else if (flow.kind === "message") points = messageRoute(s, t, source, target, offset(source.id, flow.id), offset(target.id, flow.id));
    else points = [clip(s, center(t), source), clip(t, center(s), target)];
    model.edges.set(flow.id, { points });
  }
}

function sequenceRoute(s: Bounds, t: Bounds, source: BpmnNode, target: BpmnNode): Point[] {
  const sc = center(s);
  const tc = center(t);
  if (source.position === "boundary") {
    const down = { x: sc.x, y: s.y + s.height };
    return tc.x > sc.x ? [down, { x: sc.x, y: tc.y }, { x: t.x, y: tc.y }] : [down, { x: sc.x, y: t.y + t.height + 20 }, { x: tc.x, y: t.y + t.height + 20 }, { x: tc.x, y: t.y + t.height }];
  }
  if (tc.x <= sc.x) {
    // Backwards: loop round underneath both shapes.
    const below = Math.max(s.y + s.height, t.y + t.height) + 25;
    return [{ x: sc.x, y: s.y + s.height }, { x: sc.x, y: below }, { x: tc.x, y: below }, { x: tc.x, y: t.y + t.height }];
  }
  if (Math.abs(sc.y - tc.y) < 1) return [{ x: s.x + s.width, y: sc.y }, { x: t.x, y: tc.y }];
  if (source.kind === "gateway") {
    const out = { x: sc.x, y: tc.y < sc.y ? s.y : s.y + s.height };
    return [out, { x: sc.x, y: tc.y }, { x: t.x, y: tc.y }];
  }
  if (target.kind === "gateway") {
    const into = { x: tc.x, y: sc.y < tc.y ? t.y : t.y + t.height };
    return [{ x: s.x + s.width, y: sc.y }, { x: tc.x, y: sc.y }, into];
  }
  const mid = (s.x + s.width + t.x) / 2;
  return [{ x: s.x + s.width, y: sc.y }, { x: mid, y: sc.y }, { x: mid, y: tc.y }, { x: t.x, y: tc.y }];
}

function messageRoute(s: Bounds, t: Bounds, source: BpmnNode, target: BpmnNode, sOffset: number, tOffset: number): Point[] {
  // A pool end attaches above or below the other end.
  const sx = source.kind === "participant" ? center(t).x + tOffset : center(s).x + sOffset;
  const tx = target.kind === "participant" ? center(s).x + sOffset : center(t).x + tOffset;
  const down = center(t).y > center(s).y;
  const start = { x: sx, y: down ? s.y + s.height : s.y };
  const end = { x: tx, y: down ? t.y : t.y + t.height };
  if (Math.abs(sx - tx) < 1) return [start, end];
  const midY = (start.y + end.y) / 2;
  return [start, { x: sx, y: midY }, { x: tx, y: midY }, end];
}

/** Where the line from the shape's centre towards `to` leaves the shape. */
export function clip(b: Bounds, to: Point, node: BpmnNode): Point {
  const c = center(b);
  const dx = to.x - c.x;
  const dy = to.y - c.y;
  if (!dx && !dy) return c;
  if (node.kind === "event") {
    const r = b.width / 2;
    const len = Math.hypot(dx, dy);
    return { x: c.x + (dx / len) * r, y: c.y + (dy / len) * r };
  }
  const scale = Math.min(Math.abs(b.width / 2 / (dx || 1e-9)), Math.abs(b.height / 2 / (dy || 1e-9)));
  return { x: c.x + dx * scale, y: c.y + dy * scale };
}
