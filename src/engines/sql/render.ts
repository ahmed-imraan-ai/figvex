// Lays out the tables with Graphviz, one port per column so links meet the
// right row, and draws them as SVG with crow's foot ends.

import type { VizInstance } from "../graphviz";
import type { SqlStyle } from "../types";
import { visibleTables, type Column, type Relation, type SqlSchema, type SqlWarning, type Table } from "./model";

export interface SqlDraw {
  dark: boolean;
  style: SqlStyle;
  warnings?: SqlWarning[];
}

interface Point {
  x: number;
  y: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A row in a drawn table: a column, or a note that some are hidden. */
interface Row {
  col?: Column;
  more?: number;
}

interface TableShape extends Box {
  rows: Row[];
  nameW: number;
}

export interface SqlLayout {
  width: number;
  height: number;
  tables: Map<Table, TableShape>;
  groups: Map<string, Box>;
  /** Graphviz's route per relation, from the referenced table to the one with the key. */
  routes: Map<Relation, Point[]>;
}

const HEAD_H = 32;
const ROW_H = 22;
const FOOT_H = 5;
const PAD = 12;
const BADGE_W = 30;
const GAP = 18;
const MIN_W = 150;
const MARGIN = 24;
const MAX_TYPE = 28;
const FONT = 'font-family="Helvetica, Arial, sans-serif"';
const MONO = 'font-family="ui-monospace, Menlo, Consolas, monospace"';
const COLOURS = ["#3b6fd8", "#2f9e5b", "#d4880f", "#7b5cd6", "#c94f8a", "#1f97b0", "#cf4b3d", "#6a9a24"];

const n = (v: number) => Math.round(v * 10) / 10;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const dotq = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const sansW = (s: string, px: number, bold = false) => s.length * px * (bold ? 0.62 : 0.56);
const monoW = (s: string, px: number) => s.length * px * 0.6;
const shortType = (t: string) => (t.length > MAX_TYPE ? `${t.slice(0, MAX_TYPE - 1)}…` : t);

function rowsOf(t: Table, style: SqlStyle): Row[] {
  if (style !== "keys") return t.columns.map((col) => ({ col }));
  const keys = t.columns.filter((c) => c.pk || c.fk || c.unique);
  const hidden = t.columns.length - keys.length;
  return [...keys.map((col) => ({ col })), ...(hidden ? [{ more: hidden }] : [])];
}

function shapeOf(t: Table, style: SqlStyle): Omit<TableShape, "x" | "y"> {
  const rows = rowsOf(t, style);
  const cols = rows.flatMap((r) => (r.col ? [r.col] : []));
  const nameW = Math.max(0, ...cols.map((c) => sansW(c.name, 13, c.pk)), ...rows.map((r) => (r.more ? sansW(`${r.more} more columns`, 12) : 0)));
  const typeW = Math.max(0, ...cols.map((c) => (c.type ? monoW(shortType(c.type) + (c.notNull ? "" : "?"), 11.5) : 0)));
  const w = Math.max(MIN_W, PAD * 2 + sansW(t.name, 14, true) + 18, PAD * 2 + BADGE_W + nameW + (typeW ? GAP + typeW : 0));
  return { w: Math.ceil(w), h: HEAD_H + rows.length * ROW_H + FOOT_H, rows, nameW };
}

/** The group each table is drawn in: its "-- group:", or its schema when there are several. */
export function groupOf(schema: SqlSchema): Map<Table, string> {
  const out = new Map<Table, string>();
  const explicit = schema.tables.some((t) => t.group);
  const schemas = new Set(schema.tables.map((t) => t.schema?.toLowerCase() ?? ""));
  for (const t of schema.tables) {
    const g = explicit ? t.group : schemas.size > 1 ? (t.schema ?? "") : undefined;
    if (g) out.set(t, g);
  }
  return out;
}

const rowIndex = (shape: { rows: Row[] }, col: Column) => shape.rows.findIndex((r) => r.col === col);

export function layoutSql(schema: SqlSchema, viz: VizInstance, style: SqlStyle): SqlLayout {
  const shown = visibleTables(schema);
  const tables = schema.tables.filter((t) => shown.has(t));
  const idx = new Map(tables.map((t, i) => [t, i]));
  const shapes = new Map(tables.map((t) => [t, shapeOf(t, style)]));
  const groups = groupOf(schema);
  const groupNames = [...new Set(tables.map((t) => groups.get(t)).filter((g): g is string => !!g))];

  const out = [
    "digraph er {",
    'graph [rankdir=LR nodesep=0.45 ranksep=1.1 splines=true margin=0 fontname="Helvetica" fontsize=13]',
    "node [shape=plain]",
    "edge [dir=none]",
  ];
  const nodeLine = (t: Table) => {
    const s = shapes.get(t)!;
    const cell = (h: number, port?: string) => `<TR><TD${port ? ` PORT="${port}"` : ""} WIDTH="${s.w}" HEIGHT="${h}" FIXEDSIZE="TRUE"></TD></TR>`;
    const cells = [cell(HEAD_H), ...s.rows.map((_, k) => cell(ROW_H, `r${k}`)), cell(FOOT_H)];
    return `t${idx.get(t)} [label=<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="0">${cells.join("")}</TABLE>>]`;
  };
  groupNames.forEach((g, i) => {
    // The label only reserves room for our own heading.
    out.push(`subgraph cluster_${i} {`, `graph [label=${dotq(`${g}  `)} labeljust=l margin=18]`);
    for (const t of tables) if (groups.get(t) === g) out.push(nodeLine(t));
    out.push("}");
  });
  for (const t of tables) if (!groups.get(t)) out.push(nodeLine(t));

  const drawn = schema.relations.filter((r) => shown.has(r.from) && shown.has(r.to));
  drawn.forEach((r, i) => {
    const toRow = rowIndex(shapes.get(r.to)!, r.toCols[0]);
    const fromRow = rowIndex(shapes.get(r.from)!, r.fromCols[0]);
    const self = r.from === r.to;
    const tail = `t${idx.get(r.to)}${toRow >= 0 ? `:r${toRow}:e` : ""}`;
    const head = `t${idx.get(r.from)}${fromRow >= 0 ? `:r${fromRow}:${self ? "e" : "w"}` : ""}`;
    out.push(`${tail} -> ${head} [id="e${i}"]`);
  });
  out.push("}");

  const result = viz.render(out.join("\n"), { format: "json" });
  if (result.status !== "success" || !result.output) throw new Error("Graphviz couldn't lay out these tables.");
  const json = JSON.parse(result.output) as {
    bb: string;
    objects?: { name: string; pos?: string; bb?: string }[];
    edges?: { id?: string; pos?: string }[];
  };
  const [, , bbW, bbH] = json.bb.split(",").map(Number);
  const flip = (x: number, y: number): Point => ({ x: x + MARGIN, y: bbH - y + MARGIN });

  const placed = new Map<Table, TableShape>();
  const groupBoxes = new Map<string, Box>();
  for (const o of json.objects ?? []) {
    if (o.name.startsWith("cluster_") && o.bb) {
      const [x1, y1, x2, y2] = o.bb.split(",").map(Number);
      const tl = flip(x1, y2);
      groupBoxes.set(groupNames[Number(o.name.slice(8))], { x: tl.x, y: tl.y, w: x2 - x1, h: y2 - y1 });
    } else if (/^t\d+$/.test(o.name) && o.pos) {
      const t = tables[Number(o.name.slice(1))];
      const s = shapes.get(t)!;
      const [px, py] = o.pos.split(",").map(Number);
      const c = flip(px, py);
      placed.set(t, { ...s, x: c.x - s.w / 2, y: c.y - s.h / 2 });
    }
  }
  const routes = new Map<Relation, Point[]>();
  for (const e of json.edges ?? []) {
    const r = drawn[Number(e.id?.slice(1))];
    if (!r || !e.pos) continue;
    const pts = e.pos
      .split(" ")
      .filter((p) => !/^[se],/.test(p))
      .map((p) => p.split(",").map(Number))
      .map(([x, y]) => flip(x, y));
    routes.set(r, pts);
  }
  return { width: bbW + MARGIN * 2, height: bbH + MARGIN * 2, tables: placed, groups: groupBoxes, routes };
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function unit(a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/** The end of a route and the direction leading away from the table. */
function endOf(pts: Point[], atStart: boolean): { p: Point; d: Point } {
  const list = atStart ? pts : [...pts].reverse();
  const p = list[0];
  const next = list.find((q) => Math.hypot(q.x - p.x, q.y - p.y) > 0.5) ?? { x: p.x + 1, y: p.y };
  return { p, d: unit(p, next) };
}

/**
 * Crow's foot end. "one": a bar for exactly one, with a circle for zero or
 * one. "many": the crow's foot with a circle, zero or more.
 */
function marker(end: { p: Point; d: Point }, kind: "one" | "zero-one" | "many", c: { wire: string; paper: string }): string {
  const { p, d } = end;
  const q = { x: -d.y, y: d.x };
  const at = (dist: number, side = 0) => ({ x: p.x + d.x * dist + q.x * side, y: p.y + d.y * dist + q.y * side });
  const line = (a: Point, b: Point) => `<path d="M${n(a.x)} ${n(a.y)}L${n(b.x)} ${n(b.y)}"/>`;
  const bar = (dist: number) => line(at(dist, -6), at(dist, 6));
  const circle = (dist: number) => {
    const m = at(dist);
    return `<circle cx="${n(m.x)}" cy="${n(m.y)}" r="4" fill="${c.paper}"/>`;
  };
  const parts =
    kind === "one"
      ? [bar(7), bar(12)]
      : kind === "zero-one"
        ? [bar(7), circle(15)]
        : [line(at(12), at(0, -6)), line(at(12), at(0)), line(at(12), at(0, 6)), circle(17)];
  return `<g stroke="${c.wire}" stroke-width="1.4" fill="none">${parts.join("")}</g>`;
}

function curve(pts: Point[]): string {
  let d = `M${n(pts[0].x)} ${n(pts[0].y)}`;
  for (let i = 1; i + 2 < pts.length; i += 3) d += `C${[pts[i], pts[i + 1], pts[i + 2]].map((p) => `${n(p.x)} ${n(p.y)}`).join(" ")}`;
  return d;
}

export function drawSql(schema: SqlSchema, lay: SqlLayout, opts: SqlDraw): string {
  const { dark, style } = opts;
  const ink = dark ? "#ebe9e4" : "#1d1d1b";
  const muted = dark ? "#a8a59e" : "#6b6862";
  const paper = dark ? "#232321" : "#ffffff";
  const border = dark ? "#5a5852" : "#c9c6bd";
  const rule = dark ? "#3a3935" : "#ecebe6";
  const wire = dark ? "#9a978f" : "#7d7a72";
  const keyColour = dark ? "#e8b04a" : "#b7791f";
  const fkColour = dark ? "#8fb1f0" : "#3b6fd8";
  const warnColour = dark ? "#e8b04a" : "#b7791f";
  const titleH = schema.title ? 40 : 0;
  const width = lay.width;
  const height = lay.height + titleH;
  const parts: string[] = [];

  if (schema.title) {
    parts.push(`<text x="${n(width / 2)}" y="${MARGIN + 14}" text-anchor="middle" ${FONT} font-size="18" font-weight="600" fill="${ink}">${esc(schema.title)}</text>`);
  }
  parts.push(`<g transform="translate(0 ${titleH})">`);

  const groupNames = [...lay.groups.keys()];
  const groupColour = new Map(groupNames.map((g, i) => [g, COLOURS[i % COLOURS.length]]));
  for (const [g, b] of lay.groups) {
    const c = style === "plain" ? muted : groupColour.get(g)!;
    parts.push(
      `<rect x="${n(b.x + 4)}" y="${n(b.y + 4)}" width="${n(b.w - 8)}" height="${n(b.h - 8)}" rx="10" fill="${c}" fill-opacity="${dark ? 0.1 : 0.05}" stroke="${c}" stroke-opacity="${dark ? 0.6 : 0.45}" stroke-width="1.2"/>`,
      `<text x="${n(b.x + 16)}" y="${n(b.y + 22)}" ${FONT} font-size="12.5" font-weight="600" fill="${style === "plain" ? ink : c}">${esc(g)}</text>`,
    );
  }

  for (const [r, pts] of lay.routes) {
    if (pts.length < 2) continue;
    const parentEnd = marker(endOf(pts, true), r.optional ? "zero-one" : "one", { wire, paper });
    const childEnd = marker(endOf(pts, false), r.single ? "zero-one" : "many", { wire, paper });
    const what = `${r.from.name} (${r.fromCols.map((c) => c.name).join(", ")}) → ${r.to.name} (${r.toCols.map((c) => c.name).join(", ")})`;
    parts.push(
      `<g data-source-line="${r.line - 1}"><title>${esc(what)}</title>`,
      `<path d="${curve(pts)}" fill="none" stroke="transparent" stroke-width="10"/>`,
      `<path d="${curve(pts)}" fill="none" stroke="${wire}" stroke-width="1.4"/>`,
      parentEnd,
      childEnd,
      "</g>",
    );
  }

  const groups = groupOf(schema);
  const warned = new Set((opts.warnings ?? []).map((w) => w.line));
  for (const [t, b] of lay.tables) {
    const colour = style === "plain" ? "" : (groupColour.get(groups.get(t) ?? "") ?? COLOURS[0]);
    const hasWarning = warned.has(t.line) || t.columns.some((c) => warned.has(c.line));
    parts.push(`<g data-source-line="${t.line - 1}" data-qualified-name="${esc(t.name)}">`);
    if (t.comment) parts.push(`<title>${esc(t.comment)}</title>`);
    parts.push(`<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="6" fill="${paper}" stroke="${border}" stroke-width="1.2"/>`);
    if (colour) {
      const r = 6;
      parts.push(
        `<path d="M${n(b.x)} ${n(b.y + HEAD_H)}V${n(b.y + r)}Q${n(b.x)} ${n(b.y)} ${n(b.x + r)} ${n(b.y)}H${n(b.x + b.w - r)}Q${n(b.x + b.w)} ${n(b.y)} ${n(b.x + b.w)} ${n(b.y + r)}V${n(b.y + HEAD_H)}Z" fill="${colour}"/>`,
      );
    } else {
      parts.push(`<path d="M${n(b.x)} ${n(b.y + HEAD_H)}H${n(b.x + b.w)}" stroke="${border}" stroke-width="1.2"/>`);
    }
    parts.push(`<text x="${n(b.x + PAD)}" y="${n(b.y + 21)}" ${FONT} font-size="14" font-weight="700" fill="${colour ? "#ffffff" : ink}">${esc(t.name)}</text>`);
    if (hasWarning) {
      const cx = b.x + b.w - 14;
      const cy = b.y + HEAD_H / 2;
      parts.push(
        `<circle cx="${n(cx)}" cy="${n(cy)}" r="8" fill="${warnColour}" stroke="${colour ? "#ffffff" : paper}" stroke-width="1.5"/>`,
        `<text x="${n(cx)}" y="${n(cy + 4)}" text-anchor="middle" ${FONT} font-size="11" font-weight="700" fill="#ffffff">!</text>`,
      );
    }
    b.rows.forEach((row, k) => {
      const y = b.y + HEAD_H + k * ROW_H;
      const base = y + 15;
      if (k > 0) parts.push(`<path d="M${n(b.x + 1)} ${n(y)}H${n(b.x + b.w - 1)}" stroke="${rule}"/>`);
      if (row.more) {
        parts.push(`<text x="${n(b.x + PAD + BADGE_W)}" y="${n(base)}" ${FONT} font-size="12" font-style="italic" fill="${muted}">${row.more} more column${row.more === 1 ? "" : "s"}</text>`);
        return;
      }
      const c = row.col!;
      parts.push(`<g data-source-line="${c.line - 1}" data-qualified-name="${esc(c.name)}">`);
      if (c.comment) parts.push(`<title>${esc(c.comment)}</title>`);
      parts.push(`<rect x="${n(b.x + 1)}" y="${n(y)}" width="${n(b.w - 2)}" height="${ROW_H}" fill="transparent"/>`);
      const badge = [c.pk ? "PK" : "", c.fk ? "FK" : "", !c.pk && !c.fk && c.unique ? "UQ" : ""].filter(Boolean);
      if (badge.length) {
        const fill = c.pk ? keyColour : c.fk ? fkColour : muted;
        parts.push(`<text x="${n(b.x + PAD)}" y="${n(base - 1)}" ${FONT} font-size="${badge.length > 1 ? 8.5 : 9.5}" font-weight="700" fill="${fill}">${badge.join(" ")}</text>`);
      }
      parts.push(`<text x="${n(b.x + PAD + BADGE_W)}" y="${n(base)}" ${FONT} font-size="13"${c.pk ? ' font-weight="600"' : ""} fill="${ink}">${esc(c.name)}</text>`);
      if (c.type) {
        const nullable = c.notNull ? "" : `<tspan fill-opacity="0.7">?</tspan>`;
        parts.push(`<text x="${n(b.x + PAD + BADGE_W + b.nameW + GAP)}" y="${n(base)}" ${MONO} font-size="11.5" fill="${muted}">${esc(shortType(c.type))}${nullable}</text>`);
      }
      parts.push("</g>");
    });
    parts.push("</g>");
  }

  parts.push("</g>");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" viewBox="0 0 ${n(width)} ${n(height)}">${parts.join("")}</svg>`;
}
