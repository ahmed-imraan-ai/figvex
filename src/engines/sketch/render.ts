// Draws a sketch as SVG. "clean" uses straight lines; "hand-drawn" wobbles
// them with a seeded random so the same sketch always looks the same.

import type { End, LinkEl, Point, ShapeEl, Sketch, SketchEl } from "./model";

export interface SketchDraw {
  dark: boolean;
  style: "clean" | "hand-drawn";
  /** Canvas mode: adds hit areas, the selection and a grid. Off for export. */
  interactive?: boolean;
  /** Ids of selected elements (shape ids, or "#n" for the n-th element). */
  selected?: Set<string>;
}

const FONT = "Helvetica, Arial, sans-serif";
const HAND_FONT = '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
const MIN_CANVAS = { width: 960, height: 600 };
const n = (v: number) => Math.round(v * 10) / 10;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Width estimate for a line of text, close enough for layout. */
export function textWidth(text: string, size: number): number {
  return Math.max(...text.split("\n").map((l) => l.length), 1) * size * 0.55;
}

/** Bounds of a text element, which takes its size from its words. */
export function textBounds(el: ShapeEl): { w: number; h: number } {
  const size = el.style.size ?? 16;
  const lines = Math.max(1, el.label.split("\n").length);
  return { w: Math.max(20, textWidth(el.label || " ", size) + 4), h: lines * size * 1.25 + 4 };
}

export function shapeBox(el: ShapeEl): { x: number; y: number; w: number; h: number } {
  if (el.kind !== "text") return { x: el.x, y: el.y, w: el.w, h: el.h };
  const { w, h } = textBounds(el);
  return { x: el.x, y: el.y, w, h };
}

/** Element key used for selection: the shape id, or "#index" for the rest. */
export function keyOf(el: SketchEl, index: number): string {
  return el.type === "shape" ? el.id : `#${index}`;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A slightly bowed line, drawn twice, like a pen stroke. */
function roughLine(a: Point, b: Point, rand: () => number): string {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const wob = Math.min(2.5, len / 40);
  let d = "";
  for (let pass = 0; pass < 2; pass++) {
    const j = () => (rand() - 0.5) * wob * 2;
    const mx = (a.x + b.x) / 2 + j() * 1.5;
    const my = (a.y + b.y) / 2 + j() * 1.5;
    d += `M${n(a.x + j())} ${n(a.y + j())}Q${n(mx)} ${n(my)} ${n(b.x + j())} ${n(b.y + j())}`;
  }
  return d;
}

function roughPolygon(points: Point[], rand: () => number): string {
  return points.map((p, i) => roughLine(p, points[(i + 1) % points.length], rand)).join("");
}

function roughEllipse(cx: number, cy: number, rx: number, ry: number, rand: () => number): string {
  let d = "";
  for (let pass = 0; pass < 2; pass++) {
    const steps = 18;
    const start = rand() * Math.PI * 2;
    const pts: Point[] = [];
    for (let i = 0; i <= steps + 1; i++) {
      const a = start + (i / steps) * Math.PI * 2;
      const k = 1 + (rand() - 0.5) * 0.05;
      pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
    }
    d += `M${n(pts[0].x)} ${n(pts[0].y)}` + pts.slice(1).map((p, i) => {
      const prev = pts[i];
      return `Q${n(prev.x)} ${n(prev.y)} ${n((prev.x + p.x) / 2)} ${n((prev.y + p.y) / 2)}`;
    }).join("");
  }
  return d;
}

/** Where a line from the shape's centre towards `to` crosses its outline. */
export function edgePoint(el: ShapeEl, to: Point): Point {
  const b = shapeBox(el);
  const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const dx = to.x - c.x;
  const dy = to.y - c.y;
  if (!dx && !dy) return c;
  const rx = b.w / 2;
  const ry = b.h / 2;
  let t: number;
  if (el.kind === "ellipse") t = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
  else if (el.kind === "diamond") t = 1 / (Math.abs(dx) / rx + Math.abs(dy) / ry);
  else t = Math.min(Math.abs(rx / (dx || 1e-9)), Math.abs(ry / (dy || 1e-9)));
  const gap = 4 / Math.hypot(dx, dy);
  return { x: c.x + dx * (t + gap), y: c.y + dy * (t + gap) };
}

export function shapeCenter(el: ShapeEl): Point {
  const b = shapeBox(el);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** Both ends of a link in canvas coordinates, clipped to the shapes they join. */
export function linkEnds(link: LinkEl, shapes: Map<string, ShapeEl>): [Point, Point] {
  const raw = (e: End): Point => ("id" in e ? shapeCenter(shapes.get(e.id)!) : e);
  let a = raw(link.from);
  let b = raw(link.to);
  const fa = "id" in link.from ? shapes.get(link.from.id) : undefined;
  const fb = "id" in link.to ? shapes.get(link.to.id) : undefined;
  if (fa) a = edgePoint(fa, b);
  if (fb) b = edgePoint(fb, fa ? shapeCenter(fa) : a);
  if (fa && fb) a = edgePoint(fa, shapeCenter(fb));
  return [a, b];
}

export function sketchBounds(sketch: Sketch): { minX: number; minY: number; maxX: number; maxY: number } {
  const shapes = shapeMap(sketch);
  let minX = 0;
  let minY = 0;
  let maxX = MIN_CANVAS.width;
  let maxY = MIN_CANVAS.height;
  const grow = (x: number, y: number) => {
    minX = Math.min(minX, x - 20);
    minY = Math.min(minY, y - 20);
    maxX = Math.max(maxX, x + 40);
    maxY = Math.max(maxY, y + 40);
  };
  for (const el of sketch.elements) {
    if (el.type === "shape") {
      const b = shapeBox(el);
      grow(b.x, b.y);
      grow(b.x + b.w, b.y + b.h);
    } else if (el.type === "pen") {
      for (const p of el.points) grow(p.x, p.y);
    } else if (el.type === "link") {
      for (const p of linkEnds(el, shapes)) grow(p.x, p.y);
    }
  }
  return { minX, minY, maxX, maxY };
}

export function shapeMap(sketch: Sketch): Map<string, ShapeEl> {
  const map = new Map<string, ShapeEl>();
  for (const el of sketch.elements) if (el.type === "shape") map.set(el.id, el);
  return map;
}

/** Dark or light text, whichever reads on the fill; the default ink without one. */
export function inkOn(fill: string | undefined, ink: string): string {
  const hex = fill?.match(/^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/i)?.[1];
  if (!hex) return ink;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5 ? "#ffffff" : "#1d1d1b";
}

function labelLines(text: string, x: number, y: number, size: number, ink: string, font: string, bold?: boolean): string {
  const lines = text.split("\n");
  const top = y - ((lines.length - 1) * size * 1.25) / 2;
  return lines
    .map(
      (l, i) =>
        `<text x="${n(x)}" y="${n(top + i * size * 1.25)}" text-anchor="middle" dominant-baseline="central" font-family="${esc(font)}" font-size="${size}"${bold ? ' font-weight="600"' : ""} fill="${ink}">${esc(l)}</text>`,
    )
    .join("");
}

export function drawSketch(sketch: Sketch, opts: SketchDraw): string {
  const ink = opts.dark ? "#e6e3dc" : "#1d1d1b";
  const paper = opts.dark ? "#1b1b1a" : "#ffffff";
  const accent = "#c2410c";
  const hand = opts.style === "hand-drawn";
  const font = hand ? HAND_FONT : FONT;
  const shapes = shapeMap(sketch);
  const { minX, minY, maxX, maxY } = sketchBounds(sketch);
  const w = Math.ceil(maxX - minX);
  const h = Math.ceil(maxY - minY);
  const parts: string[] = [];

  parts.push(
    "<defs>" +
      `<marker id="sk-head" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M1 1.5L11 6L1 10.5" fill="none" stroke="context-stroke" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker>` +
      "</defs>",
  );
  if (opts.interactive) {
    parts.push(
      `<pattern id="sk-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.9" fill="${opts.dark ? "#3a3936" : "#dcd8ce"}"/></pattern>` +
        `<rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="url(#sk-grid)" data-sketch-bg="1"/>`,
    );
  }

  sketch.elements.forEach((el, index) => {
    if (el.type === "comment") return;
    const key = keyOf(el, index);
    const rand = rng(hash(key + index));
    const stroke = el.style.stroke ?? ink;
    const sw = el.style.width ?? (hand ? 1.6 : 1.5);
    const dash = el.style.dashed ? ' stroke-dasharray="7 5"' : "";
    const line = el.line ? ` data-source-line="${el.line - 1}"` : "";
    let body = "";

    if (el.type === "shape") {
      const b = shapeBox(el);
      const fill = el.style.fill ?? (opts.interactive ? "transparent" : "none");
      const common = `stroke="${stroke}" stroke-width="${sw}"${dash} stroke-linecap="round" stroke-linejoin="round"`;
      if (el.kind === "text") {
        body += `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" fill="${el.style.fill ?? "transparent"}"/>`;
        body += labelLines(el.label, b.x + b.w / 2, b.y + b.h / 2, el.style.size ?? 16, el.style.stroke ?? inkOn(el.style.fill, ink), font, el.style.bold);
      } else {
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        if (hand) {
          // The fill sits under the wobbly outline.
          if (el.kind === "box") body += `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="${el.style.round ? 12 : 2}" fill="${fill}"/>`;
          if (el.kind === "ellipse") body += `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(b.w / 2)}" ry="${n(b.h / 2)}" fill="${fill}"/>`;
          if (el.kind === "diamond") body += `<path d="M${n(cx)} ${n(b.y)}L${n(b.x + b.w)} ${n(cy)}L${n(cx)} ${n(b.y + b.h)}L${n(b.x)} ${n(cy)}Z" fill="${fill}"/>`;
          const outline =
            el.kind === "ellipse"
              ? roughEllipse(cx, cy, b.w / 2, b.h / 2, rand)
              : roughPolygon(
                  el.kind === "box"
                    ? [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }]
                    : [{ x: cx, y: b.y }, { x: b.x + b.w, y: cy }, { x: cx, y: b.y + b.h }, { x: b.x, y: cy }],
                  rand,
                );
          body += `<path d="${outline}" fill="none" ${common}/>`;
        } else if (el.kind === "box") {
          body += `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="${el.style.round ? 12 : 0}" fill="${fill}" ${common}/>`;
        } else if (el.kind === "ellipse") {
          body += `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(b.w / 2)}" ry="${n(b.h / 2)}" fill="${fill}" ${common}/>`;
        } else {
          body += `<path d="M${n(cx)} ${n(b.y)}L${n(b.x + b.w)} ${n(cy)}L${n(cx)} ${n(b.y + b.h)}L${n(b.x)} ${n(cy)}Z" fill="${fill}" ${common}/>`;
        }
        if (el.label) body += labelLines(el.label, cx, cy, el.style.size ?? 15, inkOn(el.style.fill, ink), font, el.style.bold);
      }
    } else if (el.type === "link") {
      const [a, b] = linkEnds(el, shapes);
      const heads = el.heads === "both" ? ' marker-start="url(#sk-head)" marker-end="url(#sk-head)"' : el.heads === "end" ? ' marker-end="url(#sk-head)"' : "";
      const d = hand ? roughLine(a, b, rand).split("M").slice(0, 2).join("M") : `M${n(a.x)} ${n(a.y)}L${n(b.x)} ${n(b.y)}`;
      if (opts.interactive) body += `<path d="M${n(a.x)} ${n(a.y)}L${n(b.x)} ${n(b.y)}" stroke="transparent" stroke-width="14" fill="none"/>`;
      body += `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}"${dash} stroke-linecap="round"${heads}/>`;
      if (el.label) {
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const size = el.style.size ?? 13;
        const tw = textWidth(el.label, size) + 8;
        const th = el.label.split("\n").length * size * 1.25 + 4;
        body += `<rect x="${n(mx - tw / 2)}" y="${n(my - th / 2)}" width="${n(tw)}" height="${n(th)}" fill="${paper}" rx="3"/>`;
        body += labelLines(el.label, mx, my, size, ink, font);
      }
    } else {
      const pts = el.points;
      let d = `M${n(pts[0].x)} ${n(pts[0].y)}`;
      for (let i = 1; i < pts.length - 1; i++) {
        d += `Q${n(pts[i].x)} ${n(pts[i].y)} ${n((pts[i].x + pts[i + 1].x) / 2)} ${n((pts[i].y + pts[i + 1].y) / 2)}`;
      }
      d += `L${n(pts[pts.length - 1].x)} ${n(pts[pts.length - 1].y)}`;
      if (opts.interactive) body += `<path d="${d}" stroke="transparent" stroke-width="12" fill="none"/>`;
      body += `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${el.style.width ?? 2}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
    }

    parts.push(`<g data-sketch-key="${esc(key)}"${line}>${body}</g>`);
  });

  if (opts.interactive && opts.selected?.size) parts.push(selection(sketch, opts.selected, shapes, accent));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${minX} ${minY} ${w} ${h}">${parts.join("")}</svg>`;
}

/** Outline and handles for the selected elements. */
function selection(sketch: Sketch, selected: Set<string>, shapes: Map<string, ShapeEl>, accent: string): string {
  let out = "";
  sketch.elements.forEach((el, index) => {
    if (!selected.has(keyOf(el, index))) return;
    if (el.type === "shape") {
      const b = shapeBox(el);
      out += `<rect x="${n(b.x - 4)}" y="${n(b.y - 4)}" width="${n(b.w + 8)}" height="${n(b.h + 8)}" fill="none" stroke="${accent}" stroke-width="1" stroke-dasharray="4 3" pointer-events="none"/>`;
      if (el.kind !== "text") {
        for (const [hx, hy, corner] of [
          [b.x, b.y, "nw"],
          [b.x + b.w, b.y, "ne"],
          [b.x, b.y + b.h, "sw"],
          [b.x + b.w, b.y + b.h, "se"],
        ] as const) {
          out += `<rect x="${n(hx - 5)}" y="${n(hy - 5)}" width="10" height="10" fill="#fff" stroke="${accent}" stroke-width="1.5" data-sketch-handle="${corner}" style="cursor:${corner === "nw" || corner === "se" ? "nwse" : "nesw"}-resize"/>`;
        }
      }
    } else if (el.type === "link") {
      const [a, b] = linkEnds(el, shapes);
      for (const [p, end] of [[a, "from"], [b, "to"]] as const) {
        out += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="6" fill="#fff" stroke="${accent}" stroke-width="1.5" data-sketch-handle="${end}" style="cursor:move"/>`;
      }
    } else if (el.type === "pen") {
      const xs = el.points.map((p) => p.x);
      const ys = el.points.map((p) => p.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      out += `<rect x="${n(x - 4)}" y="${n(y - 4)}" width="${n(Math.max(...xs) - x + 8)}" height="${n(Math.max(...ys) - y + 8)}" fill="none" stroke="${accent}" stroke-width="1" stroke-dasharray="4 3" pointer-events="none"/>`;
    }
  });
  return out;
}
