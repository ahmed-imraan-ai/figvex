// Draws a BPMN model as SVG, following the notation in the BPMN 2.0
// specification (OMG formal/2013-12-09, chapter 7 and the shape tables in
// chapter 10). Shapes and lines come from the DI bounds and waypoints.

import { isDefaultFlow, type BpmnFlow, type BpmnModel, type BpmnNode, type ShapeDi } from "./model";

export interface DrawStyle {
  dark: boolean;
  /** "plain" draws black on white; "colour" tints events, tasks and gateways. */
  style: "plain" | "colour";
}

interface Palette {
  ink: string;
  paper: string;
  muted: string;
  header: string;
  tint: Partial<Record<string, string>>;
}

const LIGHT: Palette = {
  ink: "#1d1d1b",
  paper: "#ffffff",
  muted: "#8a877f",
  header: "#f4f2ed",
  tint: { start: "#e3f1e6", end: "#f9e1de", intermediate: "#fdf0d5", boundary: "#fdf0d5", task: "#fffaf0", gateway: "#fdf0d5", data: "#eef2f8" },
};

const DARK: Palette = {
  ink: "#e6e3dc",
  paper: "#1b1b1a",
  muted: "#7d7a73",
  header: "#252523",
  tint: { start: "#1f3427", end: "#3d2523", intermediate: "#3a3220", boundary: "#3a3220", task: "#26251f", gateway: "#3a3220", data: "#222a35" },
};

const FONT = 'font-family="Helvetica, Arial, sans-serif"';
const FONT_SIZE = 12;
const CHAR = FONT_SIZE * 0.52;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: number) => Math.round(v * 100) / 100;

/** Split text into lines that fit `width` pixels at the label font size. */
export function wrap(text: string, width: number): string[] {
  const max = Math.max(4, Math.floor(width / CHAR));
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (!line) line = word;
      else if ((line + " " + word).length <= max) line += " " + word;
      else {
        out.push(line);
        line = word;
      }
      while (line.length > max) {
        out.push(line.slice(0, max - 1) + "-");
        line = line.slice(max - 1);
      }
    }
    if (line || !para) out.push(line);
  }
  return out;
}

function textBlock(lines: string[], cx: number, top: number, anchor: "middle" | "start", ink: string): string {
  const x = n(cx);
  return lines
    .map((l, i) => `<text x="${x}" y="${n(top + FONT_SIZE + i * (FONT_SIZE + 2))}" text-anchor="${anchor}" ${FONT} font-size="${FONT_SIZE}" fill="${ink}">${esc(l)}</text>`)
    .join("");
}

const blockHeight = (lines: number) => lines * (FONT_SIZE + 2);

export function drawBpmn(model: BpmnModel, opts: DrawStyle): string {
  const pal = opts.dark ? DARK : LIGHT;
  const tint = (key: string, di: ShapeDi) => di.fill ?? (opts.style === "colour" ? pal.tint[key] ?? pal.paper : pal.paper);
  const parts: { layer: number; svg: string }[] = [];
  const extent = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const grow = (x: number, y: number, w = 0, h = 0) => {
    extent.minX = Math.min(extent.minX, x);
    extent.minY = Math.min(extent.minY, y);
    extent.maxX = Math.max(extent.maxX, x + w);
    extent.maxY = Math.max(extent.maxY, y + h);
  };
  const group = (node: { line?: number; id: string }, body: string) =>
    `<g${node.line ? ` data-source-line="${node.line - 1}"` : ""} data-element-id="${esc(node.id)}">${body}</g>`;

  for (const node of model.nodes.values()) {
    const di = model.shapes.get(node.id);
    if (!di) continue;
    const b = di.bounds;
    grow(b.x, b.y, b.width, b.height);
    const stroke = di.stroke ?? pal.ink;
    const { svg, label, layer } = drawShape(node, di, stroke, pal, tint);
    let body = svg;
    if (label) {
      body += label;
    } else if (node.name && ["event", "gateway", "dataObject", "dataStore"].includes(node.kind)) {
      // Saved label boxes were measured with the modeller's font; allow a little more.
      const width = di.label ? Math.max(di.label.width + 20, 70) : 100;
      const lines = wrap(node.name, width);
      if (!di.label && node.position === "boundary") {
        // Beside the event, below the edge of the activity it sits on.
        const lx = b.x + b.width + 4;
        const top = b.y + b.height / 2;
        body += textBlock(lines, lx, top, "start", pal.ink);
        grow(lx, top, width, blockHeight(lines.length) + 4);
      } else {
        const cx = di.label ? di.label.x + di.label.width / 2 : b.x + b.width / 2;
        // Below the shape, unless a flow leaves or enters through the bottom.
        const above = !di.label && usesBottom(model, b);
        const top = di.label ? di.label.y - 2 : above ? b.y - 6 - blockHeight(lines.length) : b.y + b.height + 4;
        body += textBlock(lines, cx, top, "middle", pal.ink);
        grow(cx - width / 2, top, width, blockHeight(lines.length) + 4);
      }
    }
    parts.push({ layer, svg: group(node, body) });
  }

  for (const flow of model.flows) {
    const di = model.edges.get(flow.id);
    if (!di) continue;
    for (const p of di.points) grow(p.x, p.y);
    let body = drawFlow(flow, di.points, di.stroke ?? pal.ink, model);
    if (flow.name) {
      const lines = wrap(flow.name, 110);
      let cx: number;
      let top: number;
      if (di.label) {
        cx = di.label.x + di.label.width / 2;
        top = di.label.y - 2;
      } else {
        const [a, c] = longestSegment(di.points);
        cx = (a.x + c.x) / 2 + (a.x === c.x ? 6 + (lines[0].length * CHAR) / 2 : 0);
        top = (a.y + c.y) / 2 - blockHeight(lines.length) - (a.y === c.y ? 2 : -blockHeight(lines.length) / 2);
      }
      body += textBlock(lines, cx, top, "middle", pal.ink);
      grow(cx - 55, top, 110, blockHeight(lines.length) + 4);
    }
    parts.push({ layer: 3, svg: group(flow, body) });
  }

  if (!Number.isFinite(extent.minX)) {
    extent.minX = extent.minY = 0;
    extent.maxX = extent.maxY = 100;
  }
  const m = 12;
  const x = extent.minX - m;
  const y = extent.minY - m;
  const w = Math.ceil(extent.maxX - extent.minX + m * 2);
  const h = Math.ceil(extent.maxY - extent.minY + m * 2);
  const body = parts
    .sort((a, b) => a.layer - b.layer)
    .map((p) => p.svg)
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${n(x)} ${n(y)} ${w} ${h}">` +
    defs(pal) +
    body +
    "</svg>"
  );
}

function usesBottom(model: BpmnModel, b: { x: number; y: number; width: number; height: number }): boolean {
  const cx = b.x + b.width / 2;
  const bottom = b.y + b.height;
  for (const edge of model.edges.values()) {
    for (const p of [edge.points[0], edge.points[edge.points.length - 1]]) {
      if (Math.abs(p.x - cx) < 2 && Math.abs(p.y - bottom) < 2) return true;
    }
  }
  return false;
}

function longestSegment(points: { x: number; y: number }[]) {
  let best: [{ x: number; y: number }, { x: number; y: number }] = [points[0], points[1]];
  let len = -1;
  for (let i = 1; i < points.length; i++) {
    const l = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (l > len) {
      len = l;
      best = [points[i - 1], points[i]];
    }
  }
  return best;
}

function defs(pal: Palette): string {
  const ink = pal.ink;
  return (
    "<defs>" +
    `<marker id="bpmn-seq" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0L10 5L0 10z" fill="${ink}"/></marker>` +
    `<marker id="bpmn-msg-end" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M1 1L11 6L1 11z" fill="${pal.paper}" stroke="${ink}" stroke-width="1.2"/></marker>` +
    `<marker id="bpmn-msg-start" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><circle cx="5" cy="5" r="4" fill="${pal.paper}" stroke="${ink}" stroke-width="1.2"/></marker>` +
    `<marker id="bpmn-open" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M1 1L11 6L1 11" fill="none" stroke="${ink}" stroke-width="1.2"/></marker>` +
    `<marker id="bpmn-cond" viewBox="0 0 20 12" refX="0" refY="6" markerWidth="20" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M1 6L10 1L19 6L10 11z" fill="${pal.paper}" stroke="${ink}" stroke-width="1.2"/></marker>` +
    "</defs>"
  );
}

function drawFlow(flow: BpmnFlow, points: { x: number; y: number }[], stroke: string, model: BpmnModel): string {
  const d = points.map((p, i) => `${i ? "L" : "M"}${n(p.x)} ${n(p.y)}`).join("");
  const base = `fill="none" stroke="${stroke}" stroke-linejoin="round"`;
  if (flow.kind === "message") {
    return `<path d="${d}" ${base} stroke-width="1.5" stroke-dasharray="6 4" marker-start="url(#bpmn-msg-start)" marker-end="url(#bpmn-msg-end)"/>`;
  }
  if (flow.kind === "association" || flow.kind === "data") {
    const end = flow.kind === "data" || flow.directed ? ' marker-end="url(#bpmn-open)"' : "";
    return `<path d="${d}" ${base} stroke-width="1.2" stroke-dasharray="2 4" stroke-linecap="round"${end}/>`;
  }
  const source = model.nodes.get(flow.source);
  const conditional = flow.conditional && source && source.kind !== "gateway" ? ' marker-start="url(#bpmn-cond)"' : "";
  let slash = "";
  if (isDefaultFlow(model, flow.id) && points.length >= 2) {
    // A short slash across the line near its start.
    const [a, b] = points;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const cx = a.x + ux * 12;
    const cy = a.y + uy * 12;
    const px = -uy;
    const py = ux;
    slash = `<path d="M${n(cx + (px - ux) * 6)} ${n(cy + (py - uy) * 6)}L${n(cx - (px - ux) * 6)} ${n(cy - (py - uy) * 6)}" stroke="${stroke}" stroke-width="1.5"/>`;
  }
  return `<path d="${d}" ${base} stroke-width="1.5" marker-end="url(#bpmn-seq)"${conditional}/>${slash}`;
}

type Tint = (key: string, di: ShapeDi) => string;

function drawShape(node: BpmnNode, di: ShapeDi, stroke: string, pal: Palette, tint: Tint): { svg: string; label?: string; layer: number } {
  const b = di.bounds;
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  switch (node.kind) {
    case "participant":
    case "lane": {
      const horizontal = di.horizontal !== false;
      const header = 30;
      const fill = node.kind === "participant" ? (di.fill ?? pal.paper) : "none";
      let svg = `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.width)}" height="${n(b.height)}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
      if (horizontal) {
        svg += `<path d="M${n(b.x + header)} ${n(b.y)}V${n(b.y + b.height)}" stroke="${stroke}" stroke-width="1.5"/>`;
        const lines = wrap(node.name, b.height - 10);
        const tx = b.x + header / 2;
        const ty = cy;
        const text = lines
          .map((l, i) => {
            const offset = (i - (lines.length - 1) / 2) * (FONT_SIZE + 2);
            return `<text x="${n(tx + offset + 4)}" y="${n(ty)}" text-anchor="middle" ${FONT} font-size="${FONT_SIZE}" fill="${pal.ink}" transform="rotate(-90 ${n(tx + offset + 4)} ${n(ty)})">${esc(l)}</text>`;
          })
          .join("");
        svg += text;
      } else {
        svg += `<path d="M${n(b.x)} ${n(b.y + header)}H${n(b.x + b.width)}" stroke="${stroke}" stroke-width="1.5"/>`;
        svg += textBlock(wrap(node.name, b.width - 10), cx, b.y + 4, "middle", pal.ink);
      }
      return { svg, label: "", layer: node.kind === "participant" ? 0 : 1 };
    }
    case "group":
      return {
        svg:
          `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.width)}" height="${n(b.height)}" rx="10" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="8 4 2 4"/>` +
          textBlock(wrap(node.name, b.width - 10), cx, b.y + 2, "middle", pal.ink),
        label: "",
        layer: 2,
      };
    case "textAnnotation": {
      const svg = `<path d="M${n(b.x + 12)} ${n(b.y)}H${n(b.x)}V${n(b.y + b.height)}H${n(b.x + 12)}" fill="none" stroke="${stroke}" stroke-width="1.5"/>`;
      const lines = wrap(node.text ?? "", b.width - 10);
      return { svg: svg + textBlock(lines, b.x + 6, cy - blockHeight(lines.length) / 2 - 2, "start", pal.ink), label: "", layer: 4 };
    }
    case "dataObject": {
      const f = 12;
      const svg = `<path d="M${n(b.x)} ${n(b.y)}H${n(b.x + b.width - f)}L${n(b.x + b.width)} ${n(b.y + f)}V${n(b.y + b.height)}H${n(b.x)}Z" fill="${tint("data", di)}" stroke="${stroke}" stroke-width="1.5"/><path d="M${n(b.x + b.width - f)} ${n(b.y)}V${n(b.y + f)}H${n(b.x + b.width)}" fill="none" stroke="${stroke}" stroke-width="1.5"/>`;
      return { svg, layer: 4 };
    }
    case "dataStore": {
      const ry = Math.min(8, b.height / 6);
      const fill = tint("data", di);
      const svg =
        `<path d="M${n(b.x)} ${n(b.y + ry)}A${n(b.width / 2)} ${n(ry)} 0 0 1 ${n(b.x + b.width)} ${n(b.y + ry)}V${n(b.y + b.height - ry)}A${n(b.width / 2)} ${n(ry)} 0 0 1 ${n(b.x)} ${n(b.y + b.height - ry)}Z" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>` +
        [0, 1, 2]
          .map((i) => `<path d="M${n(b.x)} ${n(b.y + ry + i * 5)}A${n(b.width / 2)} ${n(ry)} 0 0 0 ${n(b.x + b.width)} ${n(b.y + ry + i * 5)}" fill="none" stroke="${stroke}" stroke-width="1.5"/>`)
          .join("");
      return { svg, layer: 4 };
    }
    case "gateway": {
      const svg = `<path d="M${n(cx)} ${n(b.y)}L${n(b.x + b.width)} ${n(cy)}L${n(cx)} ${n(b.y + b.height)}L${n(b.x)} ${n(cy)}Z" fill="${tint("gateway", di)}" stroke="${stroke}" stroke-width="1.5"/>`;
      return { svg: svg + gatewayMarker(node, di, cx, cy, b.width, stroke), layer: 4 };
    }
    case "event": {
      const r = Math.min(b.width, b.height) / 2;
      const key = node.position ?? "start";
      const fill = tint(key, di);
      const dash = node.interrupting === false ? ' stroke-dasharray="5 3"' : "";
      let svg: string;
      if (node.position === "end") {
        svg = `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r - 1.5)}" fill="${fill}" stroke="${stroke}" stroke-width="4"/>`;
      } else if (node.position === "start") {
        svg = `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"${dash}/>`;
      } else {
        svg =
          `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"${dash}/>` +
          `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r - 3)}" fill="none" stroke="${stroke}" stroke-width="1.5"${dash}/>`;
      }
      svg += eventMarker(node.definition, !!node.throwing, cx, cy, r, stroke, fill);
      return { svg, layer: node.position === "boundary" ? 6 : 4 };
    }
    default: {
      // Tasks, sub-processes and call activities.
      const expanded = node.kind === "subProcess" && di.expanded === true;
      const strokeWidth = node.kind === "callActivity" ? 4 : 1.5;
      let svg = `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.width)}" height="${n(b.height)}" rx="10" fill="${expanded ? "none" : tint("task", di)}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      if (node.type === "transaction") {
        svg += `<rect x="${n(b.x + 3)}" y="${n(b.y + 3)}" width="${n(b.width - 6)}" height="${n(b.height - 6)}" rx="8" fill="none" stroke="${stroke}" stroke-width="1.2"/>`;
      }
      svg += taskIcon(node.type, b.x + 6, b.y + 6, stroke, tint("task", di));
      const markers: string[] = [];
      if (node.loop) markers.push(node.loop);
      if (node.type === "adHocSubProcess") markers.push("adhoc");
      if ((node.kind === "subProcess" || node.kind === "callActivity") && !expanded && node.kind !== "callActivity") markers.push("collapsed");
      svg += activityMarkers(markers, cx, b.y + b.height - 8, stroke);
      let label: string;
      if (expanded) {
        label = textBlock(wrap(node.name, b.width - 20), b.x + 10, b.y + 2, "start", pal.ink);
      } else {
        const iconPad = TASK_ICONS.has(node.type) ? 10 : 0;
        const lines = wrap(node.name, b.width - 12);
        const top = cy - blockHeight(lines.length) / 2 - 2 + iconPad / 2 - (markers.length ? 4 : 0);
        label = textBlock(lines, cx, top, "middle", pal.ink);
      }
      return { svg, label, layer: expanded ? 2 : 5 };
    }
  }
}

const TASK_ICONS = new Set(["userTask", "serviceTask", "scriptTask", "sendTask", "receiveTask", "manualTask", "businessRuleTask"]);

function taskIcon(type: string, x: number, y: number, stroke: string, fill: string): string {
  const s = `stroke="${stroke}" stroke-width="1.2" fill="none"`;
  switch (type) {
    case "userTask":
      return `<circle cx="${n(x + 8)}" cy="${n(y + 5)}" r="3.5" ${s}/><path d="M${n(x + 1)} ${n(y + 16)}C${n(x + 1)} ${n(y + 10)} ${n(x + 15)} ${n(y + 10)} ${n(x + 15)} ${n(y + 16)}Z" ${s}/>`;
    case "serviceTask": {
      const cx = x + 8;
      const cy = y + 8;
      let teeth = "";
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        teeth += `M${n(cx + Math.cos(a) * 5)} ${n(cy + Math.sin(a) * 5)}L${n(cx + Math.cos(a) * 7.5)} ${n(cy + Math.sin(a) * 7.5)}`;
      }
      return `<circle cx="${n(cx)}" cy="${n(cy)}" r="5" ${s}/><circle cx="${n(cx)}" cy="${n(cy)}" r="2" ${s}/><path d="${teeth}" stroke="${stroke}" stroke-width="2.2"/>`;
    }
    case "scriptTask":
      return `<path d="M${n(x + 4)} ${n(y)}H${n(x + 15)}C${n(x + 11)} ${n(y + 5)} ${n(x + 15)} ${n(y + 11)} ${n(x + 11)} ${n(y + 16)}H${n(x)}C${n(x + 4)} ${n(y + 11)} ${n(x)} ${n(y + 5)} ${n(x + 4)} ${n(y)}Z" ${s}/><path d="M${n(x + 4)} ${n(y + 5)}H${n(x + 11)}M${n(x + 4.5)} ${n(y + 8)}H${n(x + 11.5)}M${n(x + 4)} ${n(y + 11)}H${n(x + 11)}" ${s}/>`;
    case "sendTask":
      return envelope(x, y + 2, 16, 11, stroke, true, fill);
    case "receiveTask":
      return envelope(x, y + 2, 16, 11, stroke, false, fill);
    case "manualTask":
      return `<path d="M${n(x)} ${n(y + 8)}H${n(x + 4)}L${n(x + 7)} ${n(y + 4)}H${n(x + 15)}M${n(x + 7)} ${n(y + 7)}H${n(x + 16)}M${n(x + 7)} ${n(y + 10)}H${n(x + 15)}M${n(x + 6)} ${n(y + 13)}H${n(x + 13)}M${n(x)} ${n(y + 13)}H${n(x + 3)}V${n(y + 8)}" ${s}/>`;
    case "businessRuleTask":
      return `<rect x="${n(x)}" y="${n(y + 2)}" width="16" height="12" ${s}/><path d="M${n(x)} ${n(y + 2)}h16v3h-16z" fill="${stroke}"/><path d="M${n(x)} ${n(y + 9)}H${n(x + 16)}M${n(x + 5)} ${n(y + 5)}V${n(y + 14)}" ${s}/>`;
    default:
      return "";
  }
}

function envelope(x: number, y: number, w: number, h: number, stroke: string, filled: boolean, paper: string): string {
  const body = `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${filled ? stroke : "none"}" stroke="${stroke}" stroke-width="1.2"/>`;
  return body + `<path d="M${n(x)} ${n(y)}L${n(x + w / 2)} ${n(y + h * 0.55)}L${n(x + w)} ${n(y)}" fill="none" stroke="${filled ? paper : stroke}" stroke-width="1.2"/>`;
}

function activityMarkers(markers: string[], cx: number, bottom: number, stroke: string): string {
  const size = 12;
  const gap = 4;
  const total = markers.length * size + (markers.length - 1) * gap;
  let x = cx - total / 2;
  let out = "";
  for (const m of markers) {
    const y = bottom - size;
    const s = `stroke="${stroke}" stroke-width="1.5" fill="none"`;
    if (m === "collapsed") out += `<rect x="${n(x)}" y="${n(y)}" width="${size}" height="${size}" ${s}/><path d="M${n(x + 6)} ${n(y + 3)}V${n(y + 9)}M${n(x + 3)} ${n(y + 6)}H${n(x + 9)}" ${s}/>`;
    if (m === "parallel") out += `<path d="M${n(x + 2)} ${n(y)}V${n(y + size)}M${n(x + 6)} ${n(y)}V${n(y + size)}M${n(x + 10)} ${n(y)}V${n(y + size)}" ${s}/>`;
    if (m === "sequential") out += `<path d="M${n(x)} ${n(y + 2)}H${n(x + size)}M${n(x)} ${n(y + 6)}H${n(x + size)}M${n(x)} ${n(y + 10)}H${n(x + size)}" ${s}/>`;
    if (m === "standard") out += `<path d="M${n(x + 3)} ${n(y + 10)}A5 5 0 1 1 ${n(x + 9)} ${n(y + 10)}M${n(x + 9)} ${n(y + 10)}l-1 -4M${n(x + 9)} ${n(y + 10)}l3.5 -1.5" ${s}/>`;
    if (m === "adhoc") out += `<path d="M${n(x)} ${n(y + 7)}c2 -4 4 -4 6 0s4 4 6 0" ${s}/>`;
    x += size + gap;
  }
  return out;
}

function gatewayMarker(node: BpmnNode, di: ShapeDi, cx: number, cy: number, size: number, stroke: string): string {
  const k = size / 50;
  const thick = `stroke="${stroke}" stroke-width="${n(4 * k)}" fill="none"`;
  switch (node.type) {
    case "exclusiveGateway":
      if (!di.markerVisible) return "";
      return `<path d="M${n(cx - 8 * k)} ${n(cy - 8 * k)}L${n(cx + 8 * k)} ${n(cy + 8 * k)}M${n(cx + 8 * k)} ${n(cy - 8 * k)}L${n(cx - 8 * k)} ${n(cy + 8 * k)}" ${thick}/>`;
    case "parallelGateway":
      return `<path d="M${n(cx)} ${n(cy - 11 * k)}V${n(cy + 11 * k)}M${n(cx - 11 * k)} ${n(cy)}H${n(cx + 11 * k)}" ${thick}/>`;
    case "inclusiveGateway":
      return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(10 * k)}" ${`stroke="${stroke}" stroke-width="${n(2.5 * k)}" fill="none"`}/>`;
    case "complexGateway":
      return `<path d="M${n(cx)} ${n(cy - 11 * k)}V${n(cy + 11 * k)}M${n(cx - 11 * k)} ${n(cy)}H${n(cx + 11 * k)}M${n(cx - 8 * k)} ${n(cy - 8 * k)}L${n(cx + 8 * k)} ${n(cy + 8 * k)}M${n(cx + 8 * k)} ${n(cy - 8 * k)}L${n(cx - 8 * k)} ${n(cy + 8 * k)}" ${thick}/>`;
    case "eventBasedGateway": {
      const thin = `stroke="${stroke}" stroke-width="1.2" fill="none"`;
      return (
        `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(12 * k)}" ${thin}/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(9.5 * k)}" ${thin}/>` +
        polygon(5, cx, cy + k, 6 * k, `stroke="${stroke}" stroke-width="1.2" fill="none"`)
      );
    }
    default:
      return "";
  }
}

function polygon(sides: number, cx: number, cy: number, r: number, attrs: string): string {
  const pts = Array.from({ length: sides }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    return `${n(cx + Math.cos(a) * r)},${n(cy + Math.sin(a) * r)}`;
  });
  return `<polygon points="${pts.join(" ")}" ${attrs}/>`;
}

function eventMarker(definition: string | undefined, throwing: boolean, cx: number, cy: number, r: number, stroke: string, paper: string): string {
  if (!definition) return "";
  const k = r / 18;
  const fill = throwing ? stroke : "none";
  const s = `stroke="${stroke}" stroke-width="1.3"`;
  switch (definition) {
    case "message":
      return envelope(cx - 9 * k, cy - 6 * k, 18 * k, 12 * k, stroke, throwing, paper);
    case "timer": {
      let ticks = "";
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        ticks += `M${n(cx + Math.cos(a) * 8 * k)} ${n(cy + Math.sin(a) * 8 * k)}L${n(cx + Math.cos(a) * 10 * k)} ${n(cy + Math.sin(a) * 10 * k)}`;
      }
      return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(11 * k)}" fill="none" ${s}/><path d="${ticks}M${n(cx)} ${n(cy)}L${n(cx + 1 * k)} ${n(cy - 7 * k)}M${n(cx)} ${n(cy)}L${n(cx + 6 * k)} ${n(cy + 1 * k)}" fill="none" ${s}/>`;
    }
    case "error":
      return `<path d="M${n(cx - 9 * k)} ${n(cy + 8 * k)}L${n(cx - 4 * k)} ${n(cy - 8 * k)}L${n(cx + 2 * k)} ${n(cy + 2 * k)}L${n(cx + 5 * k)} ${n(cy - 6 * k)}L${n(cx + 9 * k)} ${n(cy + 8 * k)}L${n(cx + 3 * k)} ${n(cy - 2 * k)}Z" fill="${fill}" ${s}/>`;
    case "signal":
      return polygon(3, cx, cy + 1.5 * k, 10 * k, `fill="${fill}" ${s}`);
    case "multiple":
      return polygon(5, cx, cy + 1 * k, 9 * k, `fill="${fill}" ${s}`);
    case "escalation":
      return `<path d="M${n(cx)} ${n(cy - 9 * k)}L${n(cx + 7 * k)} ${n(cy + 9 * k)}L${n(cx)} ${n(cy + 3 * k)}L${n(cx - 7 * k)} ${n(cy + 9 * k)}Z" fill="${fill}" ${s}/>`;
    case "conditional":
      return `<rect x="${n(cx - 7 * k)}" y="${n(cy - 9 * k)}" width="${n(14 * k)}" height="${n(18 * k)}" fill="none" ${s}/><path d="M${n(cx - 4 * k)} ${n(cy - 5 * k)}h${n(8 * k)}M${n(cx - 4 * k)} ${n(cy - 1 * k)}h${n(8 * k)}M${n(cx - 4 * k)} ${n(cy + 3 * k)}h${n(8 * k)}M${n(cx - 4 * k)} ${n(cy + 6 * k)}h${n(8 * k)}" ${s}/>`;
    case "link":
      return `<path d="M${n(cx - 8 * k)} ${n(cy - 3 * k)}H${n(cx + 1 * k)}V${n(cy - 8 * k)}L${n(cx + 9 * k)} ${n(cy)}L${n(cx + 1 * k)} ${n(cy + 8 * k)}V${n(cy + 3 * k)}H${n(cx - 8 * k)}Z" fill="${fill}" ${s}/>`;
    case "compensate":
      return `<path d="M${n(cx - 9 * k)} ${n(cy)}L${n(cx - 1 * k)} ${n(cy - 6 * k)}V${n(cy + 6 * k)}ZM${n(cx - 1 * k)} ${n(cy)}L${n(cx + 7 * k)} ${n(cy - 6 * k)}V${n(cy + 6 * k)}Z" fill="${fill}" ${s}/>`;
    case "cancel":
      return `<path d="M${n(cx - 7 * k)} ${n(cy - 7 * k)}L${n(cx + 7 * k)} ${n(cy + 7 * k)}M${n(cx + 7 * k)} ${n(cy - 7 * k)}L${n(cx - 7 * k)} ${n(cy + 7 * k)}" stroke="${stroke}" stroke-width="${n(4 * k)}"/>`;
    case "terminate":
      return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(9 * k)}" fill="${stroke}"/>`;
    default:
      return "";
  }
}
