// Moving BPMN shapes: works out what moves with what, reroutes the flows
// attached to them, and writes the new positions back into the XML text.
//
// The text is edited in place (only the numbers in the affected Bounds and
// waypoint tags change), so comments, formatting and anything we don't
// model are kept exactly as they were.

import type { BpmnModel, Bounds, EdgeDi, ShapeDi } from "./model";

export interface Delta {
  dx: number;
  dy: number;
}

interface Point {
  x: number;
  y: number;
}

const inside = (inner: Bounds, outer: Bounds) =>
  inner.x >= outer.x - 0.5 &&
  inner.y >= outer.y - 0.5 &&
  inner.x + inner.width <= outer.x + outer.width + 0.5 &&
  inner.y + inner.height <= outer.y + outer.height + 0.5;

/**
 * Everything that moves when `ids` are dragged: boundary events with their
 * activity, and whatever sits inside a moved pool, lane or expanded
 * subprocess.
 */
export function movingSet(model: BpmnModel, ids: Iterable<string>): Set<string> {
  const out = new Set<string>();
  const queue = [...ids].filter((id) => model.shapes.has(id));
  while (queue.length) {
    const id = queue.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    const node = model.nodes.get(id);
    const box = model.shapes.get(id)!.bounds;
    for (const other of model.nodes.values()) {
      if (out.has(other.id) || !model.shapes.has(other.id)) continue;
      if (other.attachedTo === id) queue.push(other.id);
      else if (node && (node.kind === "participant" || node.kind === "lane" || (node.kind === "subProcess" && model.shapes.get(id)!.expanded !== false))) {
        if (other.kind !== "participant" && inside(model.shapes.get(other.id)!.bounds, box)) queue.push(other.id);
      }
    }
  }
  return out;
}

/**
 * A flow's new route when one or both of its ends move. If both move by
 * the same amount the route just shifts. Otherwise the moved end goes with
 * its shape and the next bend keeps its right angle; a straight two-point
 * flow gets a dog-leg in the middle.
 */
export function rerouteEdge(points: Point[], start: Delta | null, end: Delta | null): Point[] {
  const shift = (p: Point, d: Delta) => ({ x: p.x + d.dx, y: p.y + d.dy });
  if (start && end && start.dx === end.dx && start.dy === end.dy) return points.map((p) => shift(p, start));
  let pts = points.map((p) => ({ ...p }));
  if (!start && !end) return pts;
  if (pts.length === 2) {
    const [a, b] = pts;
    const na = start ? shift(a, start) : a;
    const nb = end ? shift(b, end) : b;
    if (Math.abs(na.x - nb.x) < 0.5 || Math.abs(na.y - nb.y) < 0.5) return [na, nb];
    // Keep the flow's original direction for its first and last legs.
    if (Math.abs(a.y - b.y) <= Math.abs(a.x - b.x)) {
      const mx = Math.round((na.x + nb.x) / 2);
      pts = [na, { x: mx, y: na.y }, { x: mx, y: nb.y }, nb];
    } else {
      const my = Math.round((na.y + nb.y) / 2);
      pts = [na, { x: na.x, y: my }, { x: nb.x, y: my }, nb];
    }
    return pts;
  }
  const moveEnd = (i: number, j: number, d: Delta) => {
    const was = { ...pts[i] };
    pts[i] = shift(pts[i], d);
    // The neighbouring bend follows on the axis that kept the leg straight.
    if (Math.abs(was.x - pts[j].x) < 0.5) pts[j].x = pts[i].x;
    else if (Math.abs(was.y - pts[j].y) < 0.5) pts[j].y = pts[i].y;
  };
  if (start) moveEnd(0, 1, start);
  if (end) moveEnd(pts.length - 1, pts.length - 2, end);
  return pts;
}

/**
 * A right-angled route between two boxes: out of the side that faces the
 * other box along the axis with the bigger gap, with the turn halfway.
 * Overlapping boxes get a straight line between their edges.
 */
export function routeBetween(a: Bounds, b: Bounds): Point[] {
  const ca = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const cb = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const gapX = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width));
  const gapY = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height));
  const round = (p: Point) => ({ x: Math.round(p.x), y: Math.round(p.y) });
  if (gapX <= 0 && gapY <= 0) {
    // Overlapping: a straight line from edge to edge through the centres.
    const edge = (box: Bounds, c: Point, to: Point) => {
      const dx = to.x - c.x;
      const dy = to.y - c.y;
      const t = Math.min(dx ? box.width / 2 / Math.abs(dx) : Infinity, dy ? box.height / 2 / Math.abs(dy) : Infinity);
      return Number.isFinite(t) ? { x: c.x + dx * t, y: c.y + dy * t } : c;
    };
    return [round(edge(a, ca, cb)), round(edge(b, cb, ca))];
  }
  if (gapX >= gapY) {
    const right = cb.x > ca.x;
    const p0 = { x: right ? a.x + a.width : a.x, y: ca.y };
    const p1 = { x: right ? b.x : b.x + b.width, y: cb.y };
    if (Math.abs(p0.y - p1.y) < 0.5) return [round(p0), round(p1)];
    const mx = (p0.x + p1.x) / 2;
    return [p0, { x: mx, y: p0.y }, { x: mx, y: p1.y }, p1].map(round);
  }
  const down = cb.y > ca.y;
  const p0 = { x: ca.x, y: down ? a.y + a.height : a.y };
  const p1 = { x: cb.x, y: down ? b.y : b.y + b.height };
  if (Math.abs(p0.x - p1.x) < 0.5) return [round(p0), round(p1)];
  const my = (p0.y + p1.y) / 2;
  return [p0, { x: p0.x, y: my }, { x: p1.x, y: my }, p1].map(round);
}

/** Shapes and flows with `ids` (and what moves with them) shifted by `d`. */
export function moveInModel(model: BpmnModel, ids: Iterable<string>, d: Delta): { shapes: Map<string, ShapeDi>; edges: Map<string, EdgeDi>; moved: Set<string> } {
  const moved = movingSet(model, ids);
  const shiftBox = (b: Bounds): Bounds => ({ ...b, x: b.x + d.dx, y: b.y + d.dy });
  const shapes = new Map(model.shapes);
  for (const id of moved) {
    const s = shapes.get(id)!;
    shapes.set(id, { ...s, bounds: shiftBox(s.bounds), label: s.label && shiftBox(s.label) });
  }
  const edges = new Map(model.edges);
  for (const flow of model.flows) {
    const e = edges.get(flow.id);
    if (!e) continue;
    const start = moved.has(flow.source) ? d : null;
    const end = moved.has(flow.target) ? d : null;
    if (!start && !end) continue;
    // A straight flow with one end moving is routed afresh between the two
    // shapes; a flow with bends of its own keeps them where it can.
    const fresh = !(start && end) && e.points.length === 2 && shapes.has(flow.source) && shapes.has(flow.target);
    const points = fresh ? routeBetween(shapes.get(flow.source)!.bounds, shapes.get(flow.target)!.bounds) : rerouteEdge(e.points, start, end);
    // A flow's label goes all the way with a moved route, half way otherwise.
    const k = start && end ? 1 : 0.5;
    const label = e.label && { ...e.label, x: e.label.x + d.dx * k, y: e.label.y + d.dy * k };
    edges.set(flow.id, { ...e, points, label });
  }
  return { shapes, edges, moved };
}

// ---------------------------------------------------------------------------
// Writing back to the XML
// ---------------------------------------------------------------------------

const r = (v: number) => String(Math.round(v * 100) / 100);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function setAttr(tag: string, name: string, value: string): string {
  const re = new RegExp(`(\\s${name}\\s*=\\s*)(["'])[^"']*\\2`);
  return re.test(tag) ? tag.replace(re, `$1$2${value}$2`) : tag.replace(/\s*(\/?>)$/, ` ${name}="${value}"$1`);
}

/** Start and end offsets of the DI element (BPMNShape or BPMNEdge) for an id. */
function findDi(source: string, type: "BPMNShape" | "BPMNEdge", id: string): { start: number; end: number } | null {
  const open = new RegExp(`<([\\w.-]+:)?${type}\\b[^>]*\\bbpmnElement\\s*=\\s*["']${escapeRe(id)}["'][^>]*?(/?)>`, "g");
  const m = open.exec(source);
  if (!m) return null;
  if (m[2] === "/") return { start: m.index, end: m.index + m[0].length };
  const close = new RegExp(`</${escapeRe(m[1] ?? "")}${type}\\s*>`, "g");
  close.lastIndex = m.index + m[0].length;
  const c = close.exec(source);
  return c ? { start: m.index, end: c.index + c[0].length } : null;
}

/** Rewrites a shape's Bounds (and its label's) to the given boxes. */
function writeShape(source: string, id: string, di: ShapeDi): string {
  const at = findDi(source, "BPMNShape", id);
  if (!at) return source;
  let block = source.slice(at.start, at.end);
  const label = block.match(/<([\w.-]+:)?BPMNLabel\b[\s\S]*?(<\/([\w.-]+:)?BPMNLabel\s*>|\/>)/);
  const labelStart = label?.index ?? -1;
  const labelEnd = label ? labelStart + label[0].length : -1;
  block = block.replace(/<([\w.-]+:)?Bounds\b[^>]*>/g, (tag, _p, offset: number) => {
    const inLabel = offset > labelStart && offset < labelEnd;
    const b = inLabel ? di.label : di.bounds;
    if (!b) return tag;
    return setAttr(setAttr(tag, "x", r(b.x)), "y", r(b.y));
  });
  return source.slice(0, at.start) + block + source.slice(at.end);
}

/** Rewrites an edge's waypoints, adding or removing waypoint tags as needed. */
function writeEdge(source: string, id: string, di: EdgeDi): string {
  const at = findDi(source, "BPMNEdge", id);
  if (!at) return source;
  let block = source.slice(at.start, at.end);
  const tags = [...block.matchAll(/<([\w.-]+:)?waypoint\b[^>]*?\/?>(\s*<\/([\w.-]+:)?waypoint\s*>)?/g)];
  if (tags.length) {
    const first = tags[0];
    const last = tags[tags.length - 1];
    const from = first.index!;
    const to = last.index! + last[0].length;
    const gap = tags.length > 1 ? block.slice(first.index! + first[0].length, tags[1].index!) : `\n${(block.slice(0, from).match(/[ \t]*$/) ?? [""])[0]}`;
    const prefix = first[1] ?? "";
    const tagFor = (p: Point, i: number) => {
      const original = tags[i]?.[0].replace(/(\s*<\/([\w.-]+:)?waypoint\s*>)$/, "");
      const base = original ?? `<${prefix}waypoint x="0" y="0" />`;
      return setAttr(setAttr(base, "x", r(p.x)), "y", r(p.y));
    };
    block = block.slice(0, from) + di.points.map(tagFor).join(gap) + block.slice(to);
  }
  if (di.label) {
    block = block.replace(/(<([\w.-]+:)?BPMNLabel\b[\s\S]*?)(<([\w.-]+:)?Bounds\b[^>]*>)/, (_m, head: string, _p, tag: string) => head + setAttr(setAttr(tag, "x", r(di.label!.x)), "y", r(di.label!.y)));
  }
  return source.slice(0, at.start) + block + source.slice(at.end);
}

/** The source with the given shapes and edges written into their DI tags. */
export function writePositions(source: string, shapes: Map<string, ShapeDi>, edges: Map<string, EdgeDi>, ids: { shapes: Iterable<string>; edges: Iterable<string> }): string {
  let out = source;
  for (const id of ids.shapes) {
    const s = shapes.get(id);
    if (s) out = writeShape(out, id, s);
  }
  for (const id of ids.edges) {
    const e = edges.get(id);
    if (e) out = writeEdge(out, id, e);
  }
  return out;
}

/**
 * Lane changes after a move: each moved flow node belongs to the innermost
 * lane its centre is now in. Returns node id to [old lanes, new lane].
 */
export function laneChanges(model: BpmnModel, shapes: Map<string, ShapeDi>, moved: Iterable<string>): Map<string, { from: string[]; to: string }> {
  const lanes = [...model.nodes.values()].filter((n) => n.kind === "lane" && shapes.has(n.id));
  const out = new Map<string, { from: string[]; to: string }>();
  if (!lanes.length) return out;
  for (const id of moved) {
    const node = model.nodes.get(id);
    if (!node || node.kind === "lane" || node.kind === "participant" || node.kind === "textAnnotation" || node.kind === "group") continue;
    const b = shapes.get(id)!.bounds;
    const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    const containing = lanes.filter((l) => {
      const lb = shapes.get(l.id)!.bounds;
      return l.processId === node.processId && c.x >= lb.x && c.x <= lb.x + lb.width && c.y >= lb.y && c.y <= lb.y + lb.height;
    });
    if (!containing.length) continue;
    // Innermost: the smallest lane that holds the centre.
    const area = (l: { id: string }) => shapes.get(l.id)!.bounds.width * shapes.get(l.id)!.bounds.height;
    const target = containing.reduce((a, l) => (area(l) < area(a) ? l : a));
    const from = lanes.filter((l) => l.members?.includes(id)).map((l) => l.id);
    if (from.length === 1 && from[0] === target.id) continue;
    if (from.includes(target.id) && from.length > 1) continue; // nested lanes already list it
    out.set(id, { from, to: target.id });
  }
  return out;
}

/** Moves flowNodeRef entries between lanes in the XML. */
export function writeLanes(source: string, changes: Map<string, { from: string[]; to: string }>): string {
  let out = source;
  for (const [id, { from, to }] of changes) {
    for (const lane of from) {
      const at = findElement(out, "lane", lane);
      if (!at) continue;
      const block = out.slice(at.start, at.end).replace(new RegExp(`\\n?[ \\t]*<([\\w.-]+:)?flowNodeRef>\\s*${escapeRe(id)}\\s*</([\\w.-]+:)?flowNodeRef>`), "");
      out = out.slice(0, at.start) + block + out.slice(at.end);
    }
    const at = findElement(out, "lane", to);
    if (!at || out.slice(at.end - 2, at.end) === "/>") continue;
    const block = out.slice(at.start, at.end);
    const prefix = block.match(/^<([\w.-]+:)?lane\b/)?.[1] ?? "";
    // After the lane's last flowNodeRef, or else straight after its start tag.
    const before = block.search(/<([\w.-]+:)?childLaneSet\b|<\/([\w.-]+:)?lane\s*>$/);
    const refs = [...block.slice(0, before).matchAll(/<\/([\w.-]+:)?flowNodeRef\s*>/g)];
    const lastRef = refs[refs.length - 1];
    const insertAt = lastRef ? lastRef.index! + lastRef[0].length : block.indexOf(">") + 1;
    const lineStart = out.lastIndexOf("\n", at.start + (lastRef ? lastRef.index! : 0)) + 1;
    const indent = (out.slice(lineStart).match(/^[ \t]*/) ?? [""])[0] + (lastRef ? "" : "  ");
    const entry = `\n${indent}<${prefix}flowNodeRef>${id}</${prefix}flowNodeRef>`;
    out = out.slice(0, at.start) + block.slice(0, insertAt) + entry + block.slice(insertAt) + out.slice(at.end);
  }
  return out;
}

/** Start and end offsets of a model element such as <lane id="...">. */
function findElement(source: string, type: string, id: string): { start: number; end: number } | null {
  const open = new RegExp(`<([\\w.-]+:)?${type}\\b[^>]*\\bid\\s*=\\s*["']${escapeRe(id)}["'][^>]*?(/?)>`, "g");
  const m = open.exec(source);
  if (!m) return null;
  if (m[2] === "/") return { start: m.index, end: m.index + m[0].length };
  // Lanes nest, so count opening and closing tags to find the matching one.
  const tags = new RegExp(`<(/?)${escapeRe(m[1] ?? "")}${type}\\b[^>]*?(/?)>`, "g");
  tags.lastIndex = m.index + m[0].length;
  let depth = 1;
  for (let t = tags.exec(source); t; t = tags.exec(source)) {
    if (t[1]) depth--;
    else if (!t[2]) depth++;
    if (depth === 0) return { start: m.index, end: t.index + t[0].length };
  }
  return null;
}

/**
 * Adds a diagram (BPMNDiagram) with every shape and flow to a file that has
 * none, so a layout made by hand is kept. Namespace prefixes already
 * declared for DI are reused; missing ones are declared on <definitions>.
 */
export function addDiagram(source: string, model: BpmnModel, shapes: Map<string, ShapeDi>, edges: Map<string, EdgeDi>): string {
  const rootTag = source.match(/<([\w.-]+:)?definitions\b[^>]*>/);
  if (!rootTag) return source;
  const NS = {
    bpmndi: "http://www.omg.org/spec/BPMN/20100524/DI",
    dc: "http://www.omg.org/spec/DD/20100524/DC",
    di: "http://www.omg.org/spec/DD/20100524/DI",
  };
  let root = rootTag[0];
  const prefixFor = (key: keyof typeof NS) => {
    const m = root.match(new RegExp(`xmlns:([\\w.-]+)\\s*=\\s*["']${escapeRe(NS[key])}["']`));
    if (m) return m[1];
    let name: string = key;
    while (new RegExp(`xmlns:${name}\\s*=`).test(root)) name += "x";
    root = root.replace(/\s*(\/?>)$/, ` xmlns:${name}="${NS[key]}"$1`);
    return name;
  };
  const [bpmndi, dc, di] = [prefixFor("bpmndi"), prefixFor("dc"), prefixFor("di")];
  const collaboration = source.match(/<([\w.-]+:)?collaboration\b[^>]*\bid\s*=\s*["']([^"']+)["']/)?.[2];
  const plane = collaboration ?? model.processes[0] ?? "";
  const lines: string[] = [`  <${bpmndi}:BPMNDiagram id="${plane}_di_diagram">`, `    <${bpmndi}:BPMNPlane id="${plane}_di_plane" bpmnElement="${plane}">`];
  const box = (b: Bounds) => `x="${r(b.x)}" y="${r(b.y)}" width="${r(b.width)}" height="${r(b.height)}"`;
  for (const [id, s] of shapes) {
    const node = model.nodes.get(id);
    const horizontal = node?.kind === "participant" || node?.kind === "lane" ? ' isHorizontal="true"' : "";
    lines.push(`      <${bpmndi}:BPMNShape id="${id}_di" bpmnElement="${id}"${horizontal}>`, `        <${dc}:Bounds ${box(s.bounds)} />`);
    if (s.label) lines.push(`        <${bpmndi}:BPMNLabel>`, `          <${dc}:Bounds ${box(s.label)} />`, `        </${bpmndi}:BPMNLabel>`);
    lines.push(`      </${bpmndi}:BPMNShape>`);
  }
  for (const [id, e] of edges) {
    lines.push(`      <${bpmndi}:BPMNEdge id="${id}_di" bpmnElement="${id}">`);
    for (const p of e.points) lines.push(`        <${di}:waypoint x="${r(p.x)}" y="${r(p.y)}" />`);
    lines.push(`      </${bpmndi}:BPMNEdge>`);
  }
  lines.push(`    </${bpmndi}:BPMNPlane>`, `  </${bpmndi}:BPMNDiagram>`);
  const withRoot = source.slice(0, rootTag.index) + root + source.slice(rootTag.index! + rootTag[0].length);
  const close = withRoot.match(/<\/([\w.-]+:)?definitions\s*>\s*$/);
  if (!close) return source;
  return `${withRoot.slice(0, close.index).replace(/\s*$/, "\n")}${lines.join("\n")}\n${close[0].trim()}\n`;
}
