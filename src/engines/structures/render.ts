// Draws data structures: each one under its name, stacked down the page.
// Our own drawing, with Graphviz placing the nodes of graphs.

import type { VizInstance } from "../graphviz";
import type { Structure, StructuresDoc, TreeNode } from "./model";

interface Block {
  svg: string;
  w: number;
  h: number;
}

interface Colours {
  ink: string;
  muted: string;
  paper: string;
  line: string;
  fill: string;
  mark: string;
  markStroke: string;
  accent: string;
}

const SANS = 'font-family="Helvetica, Arial, sans-serif"';
const MONO = 'font-family="ui-monospace, Menlo, Consolas, monospace"';
const MARGIN = 24;
const CELL_H = 36;
const n = (v: number) => Math.round(v * 10) / 10;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const textW = (s: string, size = 14) => [...s].length * size * 0.6;
const cellW = (items: string[]) => Math.max(38, ...items.map((s) => textW(s) + 18));

function arrow(x1: number, y1: number, x2: number, y2: number, c: Colours, opts: { dashed?: boolean; both?: boolean } = {}): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const head = (tx: number, ty: number, vx: number, vy: number) => {
    const bx = tx - vx * 8;
    const by = ty - vy * 8;
    return `<path d="M${n(tx)} ${n(ty)}L${n(bx - vy * 4)} ${n(by + vx * 4)}L${n(bx + vy * 4)} ${n(by - vx * 4)}Z" fill="${c.line}"/>`;
  };
  return (
    `<path d="M${n(x1)} ${n(y1)}L${n(x2 - ux * 7)} ${n(y2 - uy * 7)}" stroke="${c.line}" stroke-width="1.5"${opts.dashed ? ' stroke-dasharray="4 3"' : ""}/>` +
    head(x2, y2, ux, uy) +
    (opts.both ? head(x1, y1, -ux, -uy) : "")
  );
}

function cell(x: number, y: number, w: number, value: string, marked: boolean, c: Colours, h = CELL_H): string {
  return (
    `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${h}" fill="${marked ? c.mark : c.paper}" stroke="${marked ? c.markStroke : c.ink}" stroke-width="${marked ? 2 : 1.4}"/>` +
    `<text x="${n(x + w / 2)}" y="${n(y + h / 2 + 5)}" text-anchor="middle" ${MONO} font-size="14" fill="${c.ink}">${esc(value)}</text>`
  );
}

const isMarked = (s: Structure, index: number, value: string) => s.marks.has(String(index)) || (s.kind !== "array" && s.kind !== "heap" && s.marks.has(value));

/** Pointers under an array: an arrow up to the cell, with the name below. */
function pointers(s: Structure, x0: number, y: number, w: number, c: Colours): { svg: string; h: number } {
  if (!s.pointers.length) return { svg: "", h: 0 };
  const byCell = new Map<number, string[]>();
  for (const p of s.pointers) byCell.set(p.at, [...(byCell.get(p.at) ?? []), p.name]);
  const out: string[] = [];
  for (const [at, names] of byCell) {
    const x = x0 + at * w + w / 2;
    out.push(arrow(x, y + 26, x, y + 4, c));
    out.push(`<text x="${n(x)}" y="${n(y + 42)}" text-anchor="middle" ${MONO} font-size="13" font-weight="700" fill="${c.accent}">${esc(names.join(", "))}</text>`);
  }
  return { svg: out.join(""), h: 48 };
}

function drawArray(s: Structure, c: Colours, items = s.items): Block {
  const w = cellW(items);
  const out: string[] = [];
  items.forEach((v, i) => {
    out.push(cell(i * w, 0, w, v, isMarked(s, i, v), c));
    out.push(`<text x="${n(i * w + w / 2)}" y="${CELL_H + 14}" text-anchor="middle" ${SANS} font-size="10.5" fill="${c.muted}">${i}</text>`);
  });
  if (!items.length) out.push(`<text x="0" y="22" ${SANS} font-size="13" font-style="italic" fill="${c.muted}">empty</text>`);
  const p = pointers(s, 0, CELL_H + 16, w, c);
  out.push(p.svg);
  return { svg: out.join(""), w: Math.max(60, items.length * w), h: CELL_H + 18 + p.h };
}

function drawMatrix(s: Structure, c: Colours): Block {
  const rows = s.rows ?? [];
  const w = cellW(rows.flat());
  const left = 22;
  const top = 18;
  const out: string[] = [];
  const cols = Math.max(0, ...rows.map((r) => r.length));
  for (let j = 0; j < cols; j++) out.push(`<text x="${n(left + j * w + w / 2)}" y="12" text-anchor="middle" ${SANS} font-size="10.5" fill="${c.muted}">${j}</text>`);
  rows.forEach((r, i) => {
    out.push(`<text x="${left - 8}" y="${n(top + i * CELL_H + CELL_H / 2 + 4)}" text-anchor="end" ${SANS} font-size="10.5" fill="${c.muted}">${i}</text>`);
    r.forEach((v, j) => out.push(cell(left + j * w, top + i * CELL_H, w, v, s.marks.has(`${i},${j}`) || s.marks.has(v), c)));
  });
  return { svg: out.join(""), w: left + cols * w, h: top + rows.length * CELL_H };
}

function drawStack(s: Structure, c: Colours): Block {
  const w = cellW(s.items);
  const left = 54;
  const out: string[] = [];
  const items = [...s.items].reverse();
  items.forEach((v, i) => out.push(cell(left, i * CELL_H, w, v, isMarked(s, s.items.length - 1 - i, v), c)));
  // An open-topped container.
  const h = Math.max(1, items.length) * CELL_H;
  out.push(`<path d="M${left - 6} -6V${h + 6}H${left + w + 6}V-6" fill="none" stroke="${c.ink}" stroke-width="2"/>`);
  if (items.length) out.push(`<text x="${left - 14}" y="${CELL_H / 2 + 4}" text-anchor="end" ${SANS} font-size="12" font-weight="700" fill="${c.accent}">top</text>`);
  else out.push(`<text x="${left + w / 2}" y="${CELL_H / 2 + 4}" text-anchor="middle" ${SANS} font-size="13" font-style="italic" fill="${c.muted}">empty</text>`);
  return { svg: `<g transform="translate(0 8)">${out.join("")}</g>`, w: left + w + 8, h: h + 16 };
}

function drawQueue(s: Structure, c: Colours): Block {
  const top = 30;
  const a = drawArray({ ...s, pointers: [] }, c);
  const w = cellW(s.items);
  const out = [`<g transform="translate(0 ${top})">${a.svg}</g>`];
  if (s.items.length) {
    out.push(`<text x="${n(w / 2)}" y="12" text-anchor="middle" ${SANS} font-size="12" font-weight="700" fill="${c.accent}">front</text>`);
    out.push(arrow(w / 2, 15, w / 2, top - 2, c));
    const rx = (s.items.length - 1) * w + w / 2;
    out.push(`<text x="${n(rx)}" y="12" text-anchor="middle" ${SANS} font-size="12" font-weight="700" fill="${c.accent}">${s.items.length > 1 ? "rear" : ""}</text>`);
    if (s.items.length > 1) out.push(arrow(rx, 15, rx, top - 2, c));
  }
  return { svg: out.join(""), w: a.w, h: a.h + top };
}

function drawList(s: Structure, c: Colours): Block {
  const vw = cellW(s.items);
  const ptr = 22;
  const nodeW = s.doubly ? vw + ptr * 2 : vw + ptr;
  const gap = 40;
  const out: string[] = [];
  const y = s.circular ? 4 : 4;
  s.items.forEach((v, i) => {
    const x = i * (nodeW + gap);
    const marked = s.marks.has(v) || s.marks.has(String(i));
    const vx = s.doubly ? x + ptr : x;
    out.push(`<rect x="${x}" y="${y}" width="${nodeW}" height="${CELL_H}" rx="3" fill="${marked ? c.mark : c.paper}" stroke="${marked ? c.markStroke : c.ink}" stroke-width="${marked ? 2 : 1.4}"/>`);
    out.push(`<text x="${n(vx + vw / 2)}" y="${y + CELL_H / 2 + 5}" text-anchor="middle" ${MONO} font-size="14" fill="${c.ink}">${esc(v)}</text>`);
    out.push(`<path d="M${n(vx + vw)} ${y}V${y + CELL_H}" stroke="${c.ink}" stroke-width="1.2"/>`);
    if (s.doubly) out.push(`<path d="M${n(vx)} ${y}V${y + CELL_H}" stroke="${c.ink}" stroke-width="1.2"/>`);
    const nextDot = vx + vw + ptr / 2;
    const cy = y + CELL_H / 2;
    out.push(`<circle cx="${n(nextDot)}" cy="${cy - (s.doubly ? 6 : 0)}" r="3" fill="${c.ink}"/>`);
    if (i < s.items.length - 1) {
      const nx = (i + 1) * (nodeW + gap);
      out.push(arrow(nextDot, cy - (s.doubly ? 6 : 0), nx, cy - (s.doubly ? 6 : 0), c));
      if (s.doubly) {
        const prevDot = nx + ptr / 2;
        out.push(`<circle cx="${n(prevDot)}" cy="${cy + 6}" r="3" fill="${c.ink}"/>`);
        out.push(arrow(prevDot, cy + 6, x + nodeW, cy + 6, c));
      }
    }
  });
  const last = s.items.length - 1;
  const endX = last * (nodeW + gap) + nodeW;
  const cy = y + CELL_H / 2;
  let h = CELL_H + 8;
  if (s.circular && s.items.length) {
    const startX = (s.doubly ? ptr : 0) + vw / 2;
    const fromX = endX - ptr / 2;
    out.push(`<path d="M${n(fromX)} ${cy}V${y + CELL_H + 22}H${n(startX)}V${y + CELL_H + 7}" fill="none" stroke="${c.line}" stroke-width="1.5"/>`);
    out.push(`<path d="M${n(startX)} ${y + CELL_H}L${n(startX - 4)} ${y + CELL_H + 8}L${n(startX + 4)} ${y + CELL_H + 8}Z" fill="${c.line}"/>`);
    h += 24;
  } else if (s.items.length) {
    out.push(arrow(endX - ptr / 2, cy - (s.doubly ? 6 : 0), endX + 30, cy - (s.doubly ? 6 : 0), c));
    out.push(`<text x="${n(endX + 34)}" y="${n(cy + 4 - (s.doubly ? 6 : 0))}" ${MONO} font-size="13" fill="${c.muted}">null</text>`);
  }
  if (s.items.length) {
    out.push(`<text x="0" y="0" ${SANS} font-size="11" font-weight="700" fill="${c.accent}">head</text>`);
  }
  return { svg: `<g transform="translate(0 14)">${out.join("")}</g>`, w: Math.max(60, endX + 70), h: h + 14 };
}

// ---------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------

const radius = (v: string) => Math.max(18, textW(v) / 2 + 9);

/** Width each subtree needs. Empty slots get a narrow width so lone children lean the right way. */
function treeWidth(node: TreeNode | null): number {
  if (!node) return 30;
  const own = radius(node.value) * 2 + 10;
  if (!node.children.length) return own;
  const kids = node.children.reduce((s, k) => s + treeWidth(k), 0) + (node.children.length - 1) * 10;
  return Math.max(own, kids);
}

function drawTree(s: Structure, root: TreeNode | null, c: Colours): Block {
  if (!root) return { svg: `<text x="0" y="16" ${SANS} font-size="13" font-style="italic" fill="${c.muted}">empty</text>`, w: 60, h: 24 };
  const level = 64;
  const edges: string[] = [];
  const nodes: string[] = [];
  let depth = 0;
  let index = 0;
  const place = (node: TreeNode, x0: number, d: number): { x: number; y: number } => {
    depth = Math.max(depth, d);
    const w = treeWidth(node);
    const kids = node.children;
    const total = kids.reduce((sum, k) => sum + treeWidth(k), 0) + Math.max(0, kids.length - 1) * 10;
    let cx = x0 + (w - total) / 2;
    const at = { x: x0 + w / 2, y: d * level + 22 };
    const myIndex = index++;
    for (const k of kids) {
      const kw = treeWidth(k);
      if (k) {
        const child = place(k, cx, d + 1);
        const r1 = radius(node.value);
        const r2 = radius(k.value);
        const dx = child.x - at.x;
        const dy = child.y - at.y;
        const len = Math.hypot(dx, dy) || 1;
        edges.push(`<path d="M${n(at.x + (dx / len) * r1)} ${n(at.y + (dy / len) * r1)}L${n(child.x - (dx / len) * r2)} ${n(child.y - (dy / len) * r2)}" stroke="${c.line}" stroke-width="1.5"/>`);
      }
      cx += kw + 10;
    }
    const marked = s.marks.has(node.value) || (s.kind === "heap" && s.marks.has(String(myIndex)));
    const r = radius(node.value);
    nodes.push(
      `<circle cx="${n(at.x)}" cy="${n(at.y)}" r="${n(r)}" fill="${marked ? c.mark : c.fill}" stroke="${marked ? c.markStroke : c.ink}" stroke-width="${marked ? 2 : 1.4}"/>`,
      `<text x="${n(at.x)}" y="${n(at.y + 5)}" text-anchor="middle" ${MONO} font-size="14" fill="${c.ink}">${esc(node.value)}</text>`,
    );
    return at;
  };
  place(root, 0, 0);
  return { svg: edges.join("") + nodes.join(""), w: treeWidth(root), h: depth * level + 46 };
}

// ---------------------------------------------------------------------------
// Hash tables and graphs
// ---------------------------------------------------------------------------

function drawHash(s: Structure, c: Colours): Block {
  const hash = s.hash!;
  if (hash.probe !== "chain") {
    const items = hash.buckets.map((b) => b[0] ?? "");
    return drawArray({ ...s, marks: s.marks }, c, items);
  }
  const left = 26;
  const bw = 34;
  const vw = cellW(hash.buckets.flat());
  const out: string[] = [];
  let width = left + bw;
  hash.buckets.forEach((chain, i) => {
    const y = i * CELL_H;
    out.push(`<text x="${left - 8}" y="${y + CELL_H / 2 + 4}" text-anchor="end" ${SANS} font-size="10.5" fill="${c.muted}">${i}</text>`);
    out.push(`<rect x="${left}" y="${y}" width="${bw}" height="${CELL_H}" fill="${c.paper}" stroke="${c.ink}" stroke-width="1.4"/>`);
    const cy = y + CELL_H / 2;
    if (!chain.length) {
      out.push(`<path d="M${left + 6} ${y + CELL_H - 6}L${left + bw - 6} ${y + 6}" stroke="${c.muted}"/>`);
      return;
    }
    out.push(`<circle cx="${left + bw / 2}" cy="${cy}" r="3" fill="${c.ink}"/>`);
    let x = left + bw + 30;
    let from = left + bw / 2;
    chain.forEach((v, k) => {
      out.push(arrow(from, cy, x, cy, c));
      const marked = s.marks.has(v);
      out.push(`<rect x="${x}" y="${y + 4}" width="${vw + 18}" height="${CELL_H - 8}" rx="3" fill="${marked ? c.mark : c.paper}" stroke="${marked ? c.markStroke : c.ink}" stroke-width="${marked ? 2 : 1.4}"/>`);
      out.push(`<text x="${n(x + vw / 2)}" y="${cy + 5}" text-anchor="middle" ${MONO} font-size="14" fill="${c.ink}">${esc(v)}</text>`);
      out.push(`<path d="M${x + vw} ${y + 4}V${y + CELL_H - 4}" stroke="${c.ink}"/>`);
      from = x + vw + 9;
      // The last node's next is null: a slash across its pointer box.
      if (k === chain.length - 1) out.push(`<path d="M${x + vw + 4} ${y + CELL_H - 8}L${x + vw + 14} ${y + 8}" stroke="${c.muted}"/>`);
      else out.push(`<circle cx="${from}" cy="${cy}" r="2.5" fill="${c.ink}"/>`);
      x += vw + 18 + 30;
    });
    width = Math.max(width, x);
  });
  return { svg: out.join(""), w: width, h: hash.size * CELL_H };
}

function drawGraph(s: Structure, viz: VizInstance, c: Colours): Block {
  const g = s.graph!;
  const directed = s.kind === "digraph";
  const ids = new Map(g.nodes.map((v, i) => [v, `n${i}`]));
  const dot = [
    `${directed ? "digraph" : "graph"} g {`,
    `graph [layout=${directed ? "dot" : "neato"} overlap=false sep="+12" rankdir=LR nodesep=0.5 ranksep=0.6 margin=0]`,
    "node [shape=circle fixedsize=true]",
    ...g.nodes.map((v) => `${ids.get(v)} [width=${((radius(v) * 2) / 72).toFixed(3)}]`),
    ...g.edges.map((e) => `${ids.get(e.a)} ${directed ? "->" : "--"} ${ids.get(e.b)}${e.weight ? ` [label="${e.weight.replace(/"/g, "")}" len=1.4]` : " [len=1.2]"}`),
    "}",
  ].join("\n");
  const result = viz.render(dot, { format: "json" });
  if (result.status !== "success" || !result.output) throw new Error("Graphviz couldn't lay out this graph.");
  const json = JSON.parse(result.output) as { bb: string; objects?: { name: string; pos?: string }[] };
  const [, , bbW, bbH] = json.bb.split(",").map(Number);
  const pos = new Map<string, { x: number; y: number }>();
  for (const o of json.objects ?? []) {
    if (!o.pos) continue;
    const [x, y] = o.pos.split(",").map(Number);
    pos.set(o.name, { x: x + 4, y: bbH - y + 4 });
  }
  const out: string[] = [];
  const labels: string[] = [];
  for (const e of g.edges) {
    const a = pos.get(ids.get(e.a)!)!;
    const b = pos.get(ids.get(e.b)!)!;
    const ra = radius(e.a);
    const rb = radius(e.b);
    if (e.a === e.b) {
      out.push(`<path d="M${n(a.x - 8)} ${n(a.y - ra + 2)}C${n(a.x - 28)} ${n(a.y - ra - 34)} ${n(a.x + 28)} ${n(a.y - ra - 34)} ${n(a.x + 8)} ${n(a.y - ra + 2)}" fill="none" stroke="${c.line}" stroke-width="1.5"/>`);
      if (directed) out.push(`<path d="M${n(a.x + 8)} ${n(a.y - ra + 2)}L${n(a.x + 6)} ${n(a.y - ra - 7)}L${n(a.x + 14)} ${n(a.y - ra - 4)}Z" fill="${c.line}"/>`);
      if (e.weight) labels.push(`<text x="${n(a.x)}" y="${n(a.y - ra - 26)}" text-anchor="middle" ${MONO} font-size="12" fill="${c.ink}">${esc(e.weight)}</text>`);
      continue;
    }
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const x1 = a.x + (dx / len) * ra;
    const y1 = a.y + (dy / len) * ra;
    const x2 = b.x - (dx / len) * rb;
    const y2 = b.y - (dy / len) * rb;
    // Two edges between the same pair in a digraph bend apart.
    const back = directed && g.edges.some((o) => o.a === e.b && o.b === e.a);
    if (back) {
      const mx = (x1 + x2) / 2 - (dy / len) * 14;
      const my = (y1 + y2) / 2 + (dx / len) * 14;
      const ex = x2 - ((x2 - mx) / Math.hypot(x2 - mx, y2 - my)) * 7;
      const ey = y2 - ((y2 - my) / Math.hypot(x2 - mx, y2 - my)) * 7;
      out.push(`<path d="M${n(x1)} ${n(y1)}Q${n(mx)} ${n(my)} ${n(ex)} ${n(ey)}" fill="none" stroke="${c.line}" stroke-width="1.5"/>`);
      out.push(arrow(ex - (x2 - mx) * 0.01, ey - (y2 - my) * 0.01, x2, y2, c).replace(/<path d="M[^"]*" stroke[^>]*\/>/, ""));
      if (e.weight) labels.push(`<text x="${n(mx)}" y="${n(my + 4)}" text-anchor="middle" ${MONO} font-size="12" fill="${c.ink}" stroke="${c.paper}" stroke-width="4" paint-order="stroke">${esc(e.weight)}</text>`);
      continue;
    }
    if (directed) out.push(arrow(x1, y1, x2, y2, c));
    else out.push(`<path d="M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}" stroke="${c.line}" stroke-width="1.5"/>`);
    if (e.weight) labels.push(`<text x="${n((x1 + x2) / 2)}" y="${n((y1 + y2) / 2 + 4)}" text-anchor="middle" ${MONO} font-size="12" fill="${c.ink}" stroke="${c.paper}" stroke-width="4" paint-order="stroke">${esc(e.weight)}</text>`);
  }
  for (const v of g.nodes) {
    const p = pos.get(ids.get(v)!)!;
    const marked = s.marks.has(v);
    out.push(
      `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(radius(v))}" fill="${marked ? c.mark : c.fill}" stroke="${marked ? c.markStroke : c.ink}" stroke-width="${marked ? 2 : 1.4}"/>`,
      `<text x="${n(p.x)}" y="${n(p.y + 5)}" text-anchor="middle" ${MONO} font-size="14" fill="${c.ink}">${esc(v)}</text>`,
    );
  }
  return { svg: out.join("") + labels.join(""), w: bbW + 8, h: bbH + 8 };
}

// ---------------------------------------------------------------------------

const KIND_NAME: Record<Structure["kind"], string> = {
  array: "array",
  matrix: "matrix",
  stack: "stack",
  queue: "queue",
  list: "linked list",
  tree: "tree",
  bst: "binary search tree",
  heap: "heap",
  hash: "hash table",
  graph: "graph",
  digraph: "directed graph",
};

function drawOne(s: Structure, viz: VizInstance | undefined, c: Colours): Block {
  switch (s.kind) {
    case "array":
      return drawArray(s, c);
    case "matrix":
      return drawMatrix(s, c);
    case "stack":
      return drawStack(s, c);
    case "queue":
      return drawQueue(s, c);
    case "list":
      return drawList(s, c);
    case "tree":
    case "bst":
      return drawTree(s, s.tree ?? null, c);
    case "heap": {
      const t = drawTree(s, s.tree ?? null, c);
      const a = drawArray(s, c);
      return { svg: `${t.svg}<g transform="translate(0 ${t.h + 14})">${a.svg}</g>`, w: Math.max(t.w, a.w), h: t.h + 14 + a.h };
    }
    case "hash":
      return drawHash(s, c);
    case "graph":
    case "digraph":
      if (!viz) throw new Error("Graphviz is needed to draw graphs.");
      return drawGraph(s, viz, c);
  }
}

export function needsGraphviz(doc: StructuresDoc): boolean {
  return doc.structures.some((s) => s.kind === "graph" || s.kind === "digraph");
}

export function drawStructures(doc: StructuresDoc, opts: { dark: boolean; style: "plain" | "colour" }, viz?: VizInstance): string {
  const { dark } = opts;
  const colour = opts.style === "colour";
  const c: Colours = {
    ink: dark ? "#ebe9e4" : "#1d1d1b",
    muted: dark ? "#a8a59e" : "#6b6862",
    paper: dark ? "#232321" : "#ffffff",
    line: dark ? "#b9b6ae" : "#4a4843",
    fill: colour ? (dark ? "#1e2c45" : "#e8f0fe") : dark ? "#232321" : "#ffffff",
    mark: dark ? "rgba(245, 158, 11, 0.35)" : "#fde9b8",
    markStroke: "#d97706",
    accent: dark ? "#8fb1f0" : "#1c64d6",
  };
  const parts: string[] = [];
  let y = MARGIN;
  let width = 0;
  if (doc.title) {
    parts.push(`<text x="${MARGIN}" y="${y + 16}" ${SANS} font-size="18" font-weight="600" fill="${c.ink}">${esc(doc.title)}</text>`);
    width = MARGIN + doc.title.length * 10;
    y += 38;
  }
  for (const s of doc.structures) {
    const b = drawOne(s, viz, c);
    const label = `<text x="0" y="13" ${SANS} font-size="14" font-weight="700" fill="${c.ink}">${esc(s.name)}<tspan font-weight="400" fill="${c.muted}" font-size="12">  ${KIND_NAME[s.kind]}${s.kind === "hash" ? `, size ${s.hash!.size}${s.hash!.probe === "chain" ? ", chaining" : `, ${s.hash!.probe} probing`}` : ""}</tspan></text>`;
    parts.push(`<g data-source-line="${s.line - 1}" data-qualified-name="${esc(s.name)}" transform="translate(${MARGIN} ${y})">${label}<g transform="translate(0 26)">${b.svg}</g></g>`);
    width = Math.max(width, MARGIN + b.w, MARGIN + (s.name.length + KIND_NAME[s.kind].length) * 8 + 60);
    y += 26 + b.h + 30;
  }
  const w = width + MARGIN;
  const h = y - 30 + MARGIN;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}" height="${n(h)}" viewBox="0 0 ${n(w)} ${n(h)}">${parts.join("")}</svg>`;
}
