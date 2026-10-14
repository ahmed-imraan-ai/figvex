// Draws a logic file: the truth table, a Karnaugh map per function with
// its groups, the minimal expressions and gate-level circuits.

import { write, type Node, type Notation, type Written } from "./expr";
import { productTerm, sumTerm, type Implicant } from "./minimise";
import { MAX_KMAP_VARS, MAX_TABLE_VARS, simplified, valueAt, type LogicDoc, type LogicFunction } from "./model";

export interface LogicDraw {
  dark: boolean;
  notation: Notation;
}

interface Colours {
  ink: string;
  muted: string;
  paper: string;
  rule: string;
  stripe: string;
  accent: string;
  groups: string[];
}

const SANS = 'font-family="Helvetica, Arial, sans-serif"';
const MONO = 'font-family="ui-monospace, Menlo, Consolas, monospace"';
const MARGIN = 24;
const n = (v: number) => Math.round(v * 10) / 10;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Monospaced text is 0.6em a character; textLength holds it to that in every font. */
const monoW = (chars: number, size: number) => chars * size * 0.6;

/** A drawn block: its SVG at the origin, and its size. */
interface Block {
  svg: string;
  w: number;
  h: number;
}

const at = (b: Block, x: number, y: number) => `<g transform="translate(${n(x)} ${n(y)})">${b.svg}</g>`;

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

interface Part {
  written: Written;
  colour?: string;
}

const plain = (text: string): Part => ({ written: { text, bars: [] } });

/** Monospaced expression text with overbars, coloured part by part. */
function exprLine(parts: Part[], size: number, c: Colours, bold = false): Block {
  let x = 0;
  const out: string[] = [];
  // Taller when bars are stacked over bars.
  let maxLevel = 0;
  for (const p of parts) {
    const { text, bars } = p.written;
    if (!text) continue;
    const w = monoW([...text].length, size);
    out.push(
      `<text x="${n(x)}" y="${n(size)}" ${MONO} font-size="${size}"${bold ? ' font-weight="600"' : ""} fill="${p.colour ?? c.ink}" textLength="${n(w)}" lengthAdjust="spacingAndGlyphs" xml:space="preserve">${esc(text)}</text>`,
    );
    // A bar sits above any bars inside it.
    const level = (b: { from: number; to: number }): number =>
      1 + Math.max(0, ...bars.filter((o) => o !== b && o.from >= b.from && o.to <= b.to && o.to - o.from < b.to - b.from).map(level));
    for (const b of bars) {
      const lv = level(b);
      maxLevel = Math.max(maxLevel, lv);
      const y = size * 0.12 - (lv - 1) * 3;
      const x1 = x + monoW(b.from, size) + 1;
      const x2 = x + monoW(b.to, size) - 1;
      out.push(`<path d="M${n(x1)} ${n(y)}H${n(x2)}" stroke="${p.colour ?? c.ink}" stroke-width="1.2"/>`);
    }
    x += w;
  }
  const lift = Math.max(0, maxLevel - 1) * 3;
  return { svg: `<g transform="translate(0 ${lift})">${out.join("")}</g>`, w: x, h: size * 1.3 + lift };
}

const SEP: Record<Notation, { or: string; and: string }> = {
  overbar: { or: " + ", and: "·" },
  prime: { or: " + ", and: "" },
  logic: { or: " ∨ ", and: " ∧ " },
  code: { or: " || ", and: " && " },
};

/** Terms joined by OR (sum of products) or AND (product of sums), each in its group's colour. */
function termParts(terms: Node[], join: "or" | "and", notation: Notation, colours: (string | undefined)[]): Part[] {
  const parts: Part[] = [];
  terms.forEach((t, i) => {
    if (i) parts.push(plain(SEP[notation][join]));
    let w = write(t, notation);
    // An OR term inside a product needs brackets.
    if (join === "and" && t.k === "or" && terms.length > 1) w = { text: `(${w.text})`, bars: w.bars.map((b) => ({ from: b.from + 1, to: b.to + 1 })) };
    parts.push({ written: w, colour: colours[i] });
  });
  return parts;
}

// ---------------------------------------------------------------------------
// Truth table
// ---------------------------------------------------------------------------

function truthTable(doc: LogicDoc, c: Colours): Block {
  const size = 13;
  const rowH = 22;
  const headH = 26;
  const vars = doc.vars;
  const outs = doc.functions;
  const colW = (name: string) => Math.max(30, monoW(name.length, size) + 18);
  const idxW = 30;
  const widths = [...vars.map(colW), ...outs.map((f) => colW(f.name))];
  const split = idxW + vars.reduce((s, v) => s + colW(v), 0);
  const w = idxW + widths.reduce((a, b) => a + b, 0);
  const rows = 1 << vars.length;
  const h = headH + rows * rowH;
  const out: string[] = [];
  for (let r = 0; r < rows; r += 2) out.push(`<rect x="0" y="${headH + (r + 1) * rowH}" width="${n(w)}" height="${rowH}" fill="${c.stripe}"/>`);
  let x = idxW;
  out.push(`<text x="${idxW / 2}" y="18" text-anchor="middle" ${SANS} font-size="11" fill="${c.muted}">m</text>`);
  [...vars, ...outs.map((f) => f.name)].forEach((name, i) => {
    out.push(`<text x="${n(x + widths[i] / 2)}" y="18" text-anchor="middle" ${MONO} font-size="${size}" font-weight="700" fill="${c.ink}">${esc(name)}</text>`);
    x += widths[i];
  });
  for (let r = 0; r < rows; r++) {
    const y = headH + r * rowH + 15.5;
    out.push(`<text x="${idxW / 2}" y="${n(y)}" text-anchor="middle" ${SANS} font-size="10" fill="${c.muted}">${r}</text>`);
    x = idxW;
    vars.forEach((_, i) => {
      const bit = r & (1 << (vars.length - 1 - i)) ? 1 : 0;
      out.push(`<text x="${n(x + widths[i] / 2)}" y="${n(y)}" text-anchor="middle" ${MONO} font-size="${size}" fill="${c.ink}">${bit}</text>`);
      x += widths[i];
    });
    outs.forEach((f, k) => {
      const i = vars.length + k;
      const v = valueAt(f, vars, r);
      const text = v === "x" ? "X" : String(v);
      const style = v === 1 ? `font-weight="700" fill="${c.accent}"` : `fill="${c.muted}"`;
      out.push(`<g data-source-line="${f.line - 1}"><text x="${n(x + widths[i] / 2)}" y="${n(y)}" text-anchor="middle" ${MONO} font-size="${size}" ${style}>${text}</text></g>`);
      x += widths[i];
    });
  }
  out.push(`<path d="M0 ${headH}H${n(w)}" stroke="${c.ink}" stroke-width="1.4"/>`);
  out.push(`<path d="M${n(split)} 4V${n(h)}" stroke="${c.ink}" stroke-width="1.4"/>`);
  out.push(`<path d="M${idxW} 4V${n(h)}" stroke="${c.rule}"/>`);
  return { svg: out.join(""), w, h };
}

// ---------------------------------------------------------------------------
// Karnaugh map
// ---------------------------------------------------------------------------

const GRAY: Record<number, number[]> = { 1: [0, 1], 2: [0, 1, 3, 2] };

/** Contiguous runs of covered positions, allowing for the map wrapping round. */
function runs(covered: boolean[]): { from: number; to: number; openStart: boolean; openEnd: boolean }[] {
  const T = covered.length;
  const idx = covered.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  if (idx.length === T) return [{ from: 0, to: T - 1, openStart: false, openEnd: false }];
  const contiguous = idx.every((v, k) => k === 0 || v === idx[k - 1] + 1);
  if (contiguous) return [{ from: idx[0], to: idx[idx.length - 1], openStart: false, openEnd: false }];
  // Wraps round: one piece at each edge, open towards the edge.
  const gap = idx.findIndex((v, k) => k > 0 && v !== idx[k - 1] + 1);
  return [
    { from: 0, to: idx[gap - 1], openStart: true, openEnd: false },
    { from: idx[gap], to: T - 1, openStart: false, openEnd: true },
  ];
}

function kmap(f: LogicFunction, groups: Implicant[], colours: string[], c: Colours, clipId: string): Block {
  const nv = f.vars.length;
  const rowBits = nv === 4 ? 2 : 1;
  const colBits = nv - rowBits;
  const rows = GRAY[rowBits];
  const cols = GRAY[colBits];
  const cell = 42;
  const left = 34 + 12;
  const top = 34;
  const gw = cols.length * cell;
  const gh = rows.length * cell;
  const rowVars = f.vars.slice(0, rowBits).join("");
  const colVars = f.vars.slice(rowBits).join("");
  const code = (v: number, bits: number) => v.toString(2).padStart(bits, "0");
  const minterm = (r: number, col: number) => (rows[r] << colBits) | cols[col];
  const out: string[] = [];
  // Cell numbers go on top of the groups.
  const numbers: string[] = [];

  // Corner: row variables bottom left, column variables top right.
  out.push(`<path d="M${left - 34} ${top - 30}L${left} ${top}" stroke="${c.muted}"/>`);
  out.push(`<text x="${left - 30}" y="${top - 2}" ${MONO} font-size="12" font-weight="700" fill="${c.ink}">${esc(rowVars)}</text>`);
  out.push(`<text x="${left - 2}" y="${top - 20}" text-anchor="end" ${MONO} font-size="12" font-weight="700" fill="${c.ink}">${esc(colVars)}</text>`);
  cols.forEach((v, i) => out.push(`<text x="${left + i * cell + cell / 2}" y="${top - 6}" text-anchor="middle" ${MONO} font-size="11" fill="${c.muted}">${code(v, colBits)}</text>`));
  rows.forEach((v, i) => out.push(`<text x="${left - 6}" y="${top + i * cell + cell / 2 + 4}" text-anchor="end" ${MONO} font-size="11" fill="${c.muted}">${code(v, rowBits)}</text>`));

  for (let r = 0; r < rows.length; r++)
    for (let col = 0; col < cols.length; col++) {
      const m = minterm(r, col);
      const x = left + col * cell;
      const y = top + r * cell;
      const v = f.ones.includes(m) ? "1" : f.dontCares.includes(m) ? "X" : "0";
      out.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${c.paper}" stroke="${c.rule}"/>`);
      numbers.push(`<text x="${x + 3}" y="${y + 10}" ${SANS} font-size="8.5" fill="${c.muted}" stroke="${c.paper}" stroke-width="2.5" paint-order="stroke">${m}</text>`);
      out.push(
        `<text x="${x + cell / 2}" y="${y + cell / 2 + 6}" text-anchor="middle" ${MONO} font-size="16" ${v === "1" ? `font-weight="700" fill="${c.ink}"` : `fill="${c.muted}"`}>${v}</text>`,
      );
    }
  out.push(`<rect x="${left}" y="${top}" width="${gw}" height="${gh}" fill="none" stroke="${c.ink}" stroke-width="1.3"/>`);

  // Groups, clipped to the grid so pieces that wrap round look open.
  out.push(`<clipPath id="${clipId}"><rect x="${left - 1}" y="${top - 1}" width="${gw + 2}" height="${gh + 2}"/></clipPath><g clip-path="url(#${clipId})">`);
  groups.forEach((g, gi) => {
    const colour = colours[gi];
    const rowCovered = rows.map((rv) => [...Array(cols.length).keys()].some((ci) => ((((rv << colBits) | cols[ci]) & ~g.mask) === g.value)));
    const colCovered = cols.map((cv) => rows.some((rv) => ((((rv << colBits) | cv) & ~g.mask) === g.value)));
    const inset = 4 + (gi % 3) * 3;
    for (const rr of runs(rowCovered))
      for (const cr of runs(colCovered)) {
        let x1 = left + cr.from * cell + inset;
        let x2 = left + (cr.to + 1) * cell - inset;
        let y1 = top + rr.from * cell + inset;
        let y2 = top + (rr.to + 1) * cell - inset;
        if (cr.openStart) x1 = left - 14;
        if (cr.openEnd) x2 = left + gw + 14;
        if (rr.openStart) y1 = top - 14;
        if (rr.openEnd) y2 = top + gh + 14;
        out.push(`<rect x="${n(x1)}" y="${n(y1)}" width="${n(x2 - x1)}" height="${n(y2 - y1)}" rx="12" fill="${colour}" fill-opacity="0.1" stroke="${colour}" stroke-width="2"/>`);
      }
  });
  out.push("</g>", ...numbers);
  return { svg: out.join(""), w: left + gw + 4, h: top + gh + 4 };
}

// ---------------------------------------------------------------------------
// Circuits
// ---------------------------------------------------------------------------

type Gate = { kind: "in"; name: string } | { kind: "const"; v: boolean } | { kind: "and" | "or" | "xor" | "xnor" | "nand" | "nor" | "not"; inputs: Gate[] };

const toGate = (node: Node): Gate =>
  node.k === "var" ? { kind: "in", name: node.name } : node.k === "const" ? { kind: "const", v: node.v } : node.k === "not" ? { kind: "not", inputs: [toGate(node.a)] } : { kind: node.k, inputs: node.args.map(toGate) };

export const gateCount = (g: Gate): number => (g.kind === "in" || g.kind === "const" ? 0 : 1 + g.inputs.reduce((s, i) => s + gateCount(i), 0));
const depth = (g: Gate): number => (g.kind === "in" || g.kind === "const" ? 0 : 1 + Math.max(...g.inputs.map(depth)));

const INVERTED = new Set(["nand", "nor", "xnor", "not"]);
const IEC_LABEL: Record<string, string> = { and: "&", nand: "&", or: "≥1", nor: "≥1", xor: "=1", xnor: "=1", not: "1" };

function circuit(root: Node, name: string, gates: "ansi" | "iec", c: Colours): Block {
  const tree = toGate(root);
  const labelW = 46;
  const colW = 96;
  const maxDepth = depth(tree);
  const out: string[] = [];
  const wires: string[] = [];
  const size = (g: Gate) => {
    const k = g.kind === "in" || g.kind === "const" ? 0 : g.inputs.length;
    if (g.kind === "not") return { w: 32, h: 26 };
    const h = Math.max(34, k * 16 + 4);
    return { w: Math.max(48, h / 2 + 22), h };
  };
  const xOf = (g: Gate) => labelW + 30 + (depth(g) - 1) * colW;
  const line = (pts: [number, number][]) => wires.push(`<path d="M${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join("L")}" fill="none" stroke="${c.ink}" stroke-width="1.5"/>`);

  /** Lays out g with its top at y; returns the output point and the bottom. */
  const place = (g: Gate, y: number): { ox: number; oy: number; bottom: number } => {
    if (g.kind === "in" || g.kind === "const") {
      const label = g.kind === "in" ? g.name : g.v ? "1" : "0";
      out.push(`<text x="${labelW - 6}" y="${n(y + 17)}" text-anchor="end" ${MONO} font-size="14" font-weight="600" fill="${c.ink}">${esc(label)}</text>`);
      return { ox: labelW - 2, oy: y + 13, bottom: y + 28 };
    }
    let cursor = y;
    const kids = g.inputs.map((k) => {
      const r = place(k, cursor);
      cursor = r.bottom;
      return r;
    });
    const { w, h } = size(g);
    const cy = (kids[0].oy + kids[kids.length - 1].oy) / 2;
    const gx = xOf(g);
    const top = cy - h / 2;
    const ansi = gates === "ansi";
    const xorShift = ansi && (g.kind === "xor" || g.kind === "xnor") ? 7 : 0;
    const back = w * 0.28;
    const pinX = (py: number) => {
      if (!ansi || !["or", "nor", "xor", "xnor"].includes(g.kind)) return gx;
      const t = Math.min(1, Math.max(0, (py - top) / h));
      return gx + 2 * t * (1 - t) * back;
    };
    // Inputs, evenly spread down the gate's back.
    kids.forEach((k, i) => {
      const py = g.inputs.length === 1 ? cy : top + 8 + ((h - 16) * i) / (g.inputs.length - 1);
      const px = pinX(py);
      const elbow = gx - 14;
      if (Math.abs(k.oy - py) < 0.5) line([[k.ox, k.oy], [px, py]]);
      else line([[k.ox, k.oy], [elbow, k.oy], [elbow, py], [px, py]]);
    });
    const bx = gx + xorShift;
    const bw = w - xorShift;
    let body: string;
    if (!ansi) {
      body = `<rect x="${n(gx)}" y="${n(top)}" width="${n(w)}" height="${n(h)}" rx="2"/>`;
      out.push(`<g fill="${c.paper}" stroke="${c.ink}" stroke-width="1.6">${body}</g>`);
      out.push(`<text x="${n(gx + w / 2)}" y="${n(top + 16)}" text-anchor="middle" ${SANS} font-size="13" font-weight="600" fill="${c.ink}">${IEC_LABEL[g.kind]}</text>`);
    } else {
      if (g.kind === "not") body = `<path d="M${n(gx)} ${n(top)}L${n(gx + w - 8)} ${n(cy)}L${n(gx)} ${n(top + h)}Z"/>`;
      else if (g.kind === "and" || g.kind === "nand") {
        const r = h / 2;
        body = `<path d="M${n(gx)} ${n(top)}H${n(gx + w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(gx + w - r)} ${n(top + h)}H${n(gx)}Z"/>`;
      } else {
        body = `<path d="M${n(bx)} ${n(top)}Q${n(bx + bw * 0.55)} ${n(top)} ${n(bx + bw)} ${n(cy)}Q${n(bx + bw * 0.55)} ${n(top + h)} ${n(bx)} ${n(top + h)}Q${n(bx + back)} ${n(cy)} ${n(bx)} ${n(top)}Z"/>`;
        if (xorShift) body += `<path d="M${n(gx)} ${n(top + h)}Q${n(gx + back)} ${n(cy)} ${n(gx)} ${n(top)}" fill="none"/>`;
      }
      out.push(`<g fill="${c.paper}" stroke="${c.ink}" stroke-width="1.6">${body}</g>`);
    }
    let ox = gx + w;
    if (INVERTED.has(g.kind)) {
      const r = 4;
      const bxc = g.kind === "not" && ansi ? gx + w - 4 : gx + w + r;
      out.push(`<circle cx="${n(bxc)}" cy="${n(cy)}" r="${r}" fill="${c.paper}" stroke="${c.ink}" stroke-width="1.6"/>`);
      ox = bxc + r;
    }
    return { ox, oy: cy, bottom: Math.max(cursor, cy + h / 2 + 8) };
  };

  const root2 = place(tree, 8);
  const endX = Math.max(root2.ox + 26, labelW + 30 + Math.max(0, maxDepth - 1) * colW + 80);
  line([[root2.ox, root2.oy], [endX, root2.oy]]);
  out.push(`<text x="${n(endX + 6)}" y="${n(root2.oy + 5)}" ${MONO} font-size="14" font-weight="700" fill="${c.ink}">${esc(name)}</text>`);
  return { svg: wires.join("") + out.join(""), w: endX + 12 + monoW(name.length, 14), h: root2.bottom + 4 };
}

// ---------------------------------------------------------------------------
// The whole drawing
// ---------------------------------------------------------------------------

const GROUP_COLOURS = ["#d9480f", "#1c7ed6", "#2b8a3e", "#ae3ec9", "#e67700", "#0b7285", "#c2255c", "#5f3dc4"];
const GROUP_COLOURS_DARK = ["#ff8a4c", "#5aa9ff", "#5fd27a", "#d58cf0", "#ffb347", "#3dc7d9", "#ff6fa0", "#9d86ff"];

const sectionTitle = (text: string, c: Colours): Block => ({
  svg: `<text x="0" y="12" ${SANS} font-size="11" font-weight="700" letter-spacing="0.06em" fill="${c.muted}">${esc(text.toUpperCase())}</text>`,
  w: text.length * 8,
  h: 22,
});

const termsList = (nums: number[]) => nums.join(", ");

export function drawLogic(doc: LogicDoc, opts: LogicDraw, idPrefix = "lg"): string {
  const { dark, notation } = opts;
  const c: Colours = {
    ink: dark ? "#ebe9e4" : "#1d1d1b",
    muted: dark ? "#a8a59e" : "#6b6862",
    paper: dark ? "#232321" : "#ffffff",
    rule: dark ? "#45443f" : "#d9d6ce",
    stripe: dark ? "#2b2a27" : "#f6f5f1",
    accent: dark ? "#5aa9ff" : "#1c64d6",
    groups: dark ? GROUP_COLOURS_DARK : GROUP_COLOURS,
  };
  const parts: string[] = [];
  let y = MARGIN;
  let width = 0;
  const place = (b: Block, x: number, yy: number) => {
    parts.push(at(b, x, yy));
    width = Math.max(width, x + b.w);
  };

  if (doc.title) {
    parts.push(`<text x="${MARGIN}" y="${y + 18}" ${SANS} font-size="18" font-weight="600" fill="${c.ink}">${esc(doc.title)}</text>`);
    width = Math.max(width, MARGIN + doc.title.length * 10);
    y += 36;
  }

  // The functions as written.
  for (const f of doc.functions) {
    const lhs = `${f.name} = `;
    const rhs: Part[] = f.expr
      ? [{ written: write(f.expr, notation) }]
      : [plain(`Σm(${termsList(f.ones)})${f.dontCares.length ? ` + d(${termsList(f.dontCares)})` : ""}`)];
    const b = exprLine([plain(lhs), ...rhs], 15, c, false);
    parts.push(`<g data-source-line="${f.line - 1}">`);
    place(b, MARGIN, y);
    parts.push("</g>");
    y += b.h + 6;
  }
  y += 12;

  // Truth table on the left, maps and results beside it.
  const rowTop = y;
  let x = MARGIN;
  let rowBottom = y;
  if (doc.show.has("table") && doc.vars.length <= MAX_TABLE_VARS) {
    const title = sectionTitle("Truth table", c);
    place(title, x, y);
    const t = truthTable(doc, c);
    place(t, x, y + title.h);
    rowBottom = Math.max(rowBottom, y + title.h + t.h);
    x += t.w + 48;
  }

  let colY = rowTop;
  const colX = x;
  const forms: ("sop" | "pos")[] = doc.form === "both" ? ["sop", "pos"] : [doc.form];
  doc.functions.forEach((f, fi) => {
    const blocks: Block[] = [];
    const showMap = doc.show.has("kmap") && f.vars.length >= 2 && f.vars.length <= MAX_KMAP_VARS;
    const mapForm = doc.form === "pos" ? "pos" : "sop";
    const groups = mapForm === "sop" ? f.sop : f.pos;
    const colours = groups.map((_, i) => c.groups[i % c.groups.length]);
    if (showMap) blocks.push(sectionTitle(`Karnaugh map, ${f.name}`, c), kmap(f, groups, colours, c, `${idPrefix}-k${fi}`));
    if (doc.show.has("simplified")) {
      if (!showMap) blocks.push(sectionTitle(`Simplified, ${f.name}`, c));
      for (const form of forms) {
        const terms = form === "sop" ? f.sop.map((imp) => productTerm(imp, f.vars)) : f.pos.map((imp) => sumTerm(imp, f.vars));
        const tint = showMap && form === mapForm ? colours : [];
        const body: Part[] = terms.length
          ? termParts(terms, form === "sop" ? "or" : "and", notation, tint)
          : [{ written: write(simplified(f, form), notation) }];
        const label = forms.length > 1 ? (form === "sop" ? "Sum of products" : "Product of sums") : "";
        if (label) blocks.push({ svg: `<text x="0" y="11" ${SANS} font-size="11" fill="${c.muted}">${label}</text>`, w: 120, h: 16 });
        blocks.push(exprLine([plain(`${f.name} = `), ...body], 15, c, true));
      }
    }
    if (doc.show.has("minterms")) {
      const zeros = [...Array(1 << f.vars.length).keys()].filter((m) => !f.ones.includes(m) && !f.dontCares.includes(m));
      const dc = f.dontCares.length ? ` + d(${termsList(f.dontCares)})` : "";
      blocks.push(exprLine([plain(`${f.name}(${f.vars.join(", ")}) = Σm(${termsList(f.ones)})${dc}`)], 13, c));
      blocks.push(exprLine([plain(`${" ".repeat(f.name.length + f.vars.join(", ").length + 2)} = ΠM(${termsList(zeros)})${dc}`)], 13, c));
    }
    if (!blocks.length) return;
    parts.push(`<g data-source-line="${f.line - 1}">`);
    for (const b of blocks) {
      place(b, colX, colY);
      colY += b.h + 6;
    }
    parts.push("</g>");
    colY += 18;
  });
  rowBottom = Math.max(rowBottom, colY);
  y = rowBottom + 8;

  for (const cmp of doc.comparisons) {
    const same = cmp.differ.length === 0;
    const rows = cmp.differ.slice(0, 3).map((r) => doc.vars.map((v, i) => `${v}=${r & (1 << (doc.vars.length - 1 - i)) ? 1 : 0}`).join(" "));
    const text = same
      ? `${cmp.a.name} and ${cmp.b.name} are equivalent: the same output for every input.`
      : `${cmp.a.name} and ${cmp.b.name} differ when ${rows.join("; ")}${cmp.differ.length > 3 ? ` and ${cmp.differ.length - 3} more` : ""}.`;
    const mark = same ? "✓" : "✗";
    const colour = same ? (dark ? "#5fd27a" : "#2b8a3e") : dark ? "#ff8a80" : "#c92a2a";
    parts.push(
      `<g data-source-line="${cmp.line - 1}"><text x="${MARGIN}" y="${y + 14}" ${SANS} font-size="14" fill="${c.ink}"><tspan fill="${colour}" font-weight="700">${mark} </tspan>${esc(text)}</text></g>`,
    );
    width = Math.max(width, MARGIN + text.length * 7.6 + 20);
    y += 26;
  }

  if (doc.show.has("circuit")) {
    y += 10;
    doc.functions.forEach((f) => {
      const root = doc.circuit === "simplified" || !f.expr ? simplified(f, doc.form === "pos" ? "pos" : "sop") : f.expr;
      const gates = gateCount(toGate(root));
      if (gates === 0 || gates > 60) return;
      const title = sectionTitle(`Circuit, ${f.name}`, c);
      parts.push(`<g data-source-line="${f.line - 1}">`);
      place(title, MARGIN, y);
      const b = circuit(root, f.name, doc.gates, c);
      place(b, MARGIN, y + title.h);
      parts.push("</g>");
      y += title.h + b.h + 16;
    });
  }

  const w = width + MARGIN;
  const h = y + MARGIN;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}" height="${n(h)}" viewBox="0 0 ${n(w)} ${n(h)}">${parts.join("")}</svg>`;
}

export { toGate };
