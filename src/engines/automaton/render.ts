// Lays out an automaton with Graphviz and draws it: states as circles,
// accepting states with a double ring, an arrow into the start state, and
// each input's result underneath. The runs go into data-trace on the SVG
// so the step-through player can highlight them.

import type { VizInstance } from "../graphviz";
import type { AutomatonStyle } from "../types";
import type { Automaton, Edge, Rule } from "./model";

interface Point {
  x: number;
  y: number;
}

export interface AutomatonLayout {
  width: number;
  height: number;
  states: Map<string, { x: number; y: number; r: number }>;
  edges: Map<Edge, { points: Point[]; tip?: Point; label?: Point }>;
  startFrom?: Point;
}

const MARGIN = 24;
const SANS = 'font-family="Helvetica, Arial, sans-serif"';
const MONO = 'font-family="ui-monospace, Menlo, Consolas, monospace"';
const n = (v: number) => Math.round(v * 10) / 10;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const dotq = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const radius = (name: string) => Math.max(22, name.length * 4.6 + 10);

export function ruleText(r: Rule, kind: Automaton["kind"]): string {
  if (kind === "tm") return `${r.read}/${r.write},${r.move}`;
  return r.read === "" ? "ε" : r.read;
}

/** Lines of an edge label: symbols joined by commas, or one TM move per line. */
export function labelLines(e: Edge, kind: Automaton["kind"]): string[] {
  const parts = e.rules.map((r) => ruleText(r, kind));
  return kind === "tm" ? parts : [parts.join(", ")];
}

export function layoutAutomaton(a: Automaton, viz: VizInstance): AutomatonLayout {
  const idx = new Map(a.states.map((s, i) => [s, i]));
  const out = [
    "digraph fa {",
    `graph [rankdir=${a.direction === "down" ? "TB" : "LR"} nodesep=0.5 ranksep=0.7 margin=0]`,
    'node [shape=circle fixedsize=true label=""]',
    'edge [fontname="Helvetica" fontsize=13]',
    "__start [shape=point width=0.01 style=invis]",
  ];
  for (const s of a.states) {
    const d = (radius(s) * 2 + (a.accept.has(s) ? 8 : 0)) / 72;
    out.push(`s${idx.get(s)} [width=${d.toFixed(3)} height=${d.toFixed(3)}]`);
  }
  out.push(`__start -> s${idx.get(a.start)} [minlen=1]`);
  a.edges.forEach((e) => {
    // The label only reserves room; we draw it ourselves.
    const label = labelLines(e, a.kind).map((l) => dotq(l).slice(1, -1)).join("\\n");
    out.push(`s${idx.get(e.from)} -> s${idx.get(e.to)} [label="${label}"]`);
  });
  out.push("}");
  const result = viz.render(out.join("\n"), { format: "json" });
  if (result.status !== "success" || !result.output) throw new Error("Graphviz couldn't lay out this automaton.");
  const json = JSON.parse(result.output) as {
    bb: string;
    objects?: { name: string; pos?: string }[];
    edges?: { tail: number; head: number; pos?: string; lp?: string }[];
  };
  const [, , bbW, bbH] = json.bb.split(",").map(Number);
  const flip = (x: number, y: number): Point => ({ x: x + MARGIN, y: bbH - y + MARGIN });
  const states = new Map<string, { x: number; y: number; r: number }>();
  let startAt: Point | undefined;
  for (const o of json.objects ?? []) {
    if (!o.pos) continue;
    const [px, py] = o.pos.split(",").map(Number);
    if (o.name === "__start") startAt = flip(px, py);
    else if (/^s\d+$/.test(o.name)) {
      const s = a.states[Number(o.name.slice(1))];
      states.set(s, { ...flip(px, py), r: radius(s) });
    }
  }
  const edges = new Map<Edge, { points: Point[]; tip?: Point; label?: Point }>();
  // The first edge is the start arrow; the rest follow a.edges in order.
  (json.edges ?? []).slice(1).forEach((je, i) => {
    const e = a.edges[i];
    if (!e || !je.pos) return;
    let tip: Point | undefined;
    const points: Point[] = [];
    for (const p of je.pos.split(" ")) {
      const m = p.match(/^e,([\d.-]+),([\d.-]+)$/);
      if (m) tip = flip(Number(m[1]), Number(m[2]));
      else if (!p.startsWith("s,")) {
        const [x, y] = p.split(",").map(Number);
        points.push(flip(x, y));
      }
    }
    const label = je.lp ? flip(...(je.lp.split(",").map(Number) as [number, number])) : undefined;
    edges.set(e, { points, tip, label });
  });
  return { width: bbW + MARGIN * 2, height: bbH + MARGIN * 2, states, edges, startFrom: startAt };
}

function curve(pts: Point[]): string {
  let d = `M${n(pts[0].x)} ${n(pts[0].y)}`;
  for (let i = 1; i + 2 < pts.length; i += 3) d += `C${[pts[i], pts[i + 1], pts[i + 2]].map((p) => `${n(p.x)} ${n(p.y)}`).join(" ")}`;
  return d;
}

function arrowHead(from: Point, tip: Point): string {
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const size = 9;
  const back = { x: tip.x - ux * size, y: tip.y - uy * size };
  const l = { x: back.x - uy * 4.5, y: back.y + ux * 4.5 };
  const r = { x: back.x + uy * 4.5, y: back.y - ux * 4.5 };
  return `M${n(tip.x)} ${n(tip.y)}L${n(l.x)} ${n(l.y)}L${n(r.x)} ${n(r.y)}Z`;
}

export function drawAutomaton(a: Automaton, lay: AutomatonLayout, dark: boolean, style: AutomatonStyle = "plain"): string {
  const ink = dark ? "#ebe9e4" : "#1d1d1b";
  const muted = dark ? "#a8a59e" : "#6b6862";
  const paper = dark ? "#232321" : "#ffffff";
  const wire = dark ? "#b9b6ae" : "#4a4843";
  const good = dark ? "#5fd27a" : "#2b8a3e";
  const bad = dark ? "#ff8a80" : "#c92a2a";
  const parts: string[] = [];
  const titleH = a.title ? 36 : 0;
  let width = lay.width;

  if (a.title) parts.push(`<text x="${MARGIN}" y="${MARGIN + 16}" ${SANS} font-size="18" font-weight="600" fill="${ink}">${esc(a.title)}</text>`);
  parts.push(`<g transform="translate(0 ${titleH})">`);

  // Start arrow.
  const start = lay.states.get(a.start);
  if (start && lay.startFrom) {
    const from = lay.startFrom;
    const dx = start.x - from.x;
    const dy = start.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const tip = { x: start.x - (dx / len) * start.r, y: start.y - (dy / len) * start.r };
    const tail = { x: tip.x - (dx / len) * 34, y: tip.y - (dy / len) * 34 };
    parts.push(
      `<g class="fa-start"><path d="M${n(tail.x)} ${n(tail.y)}L${n(tip.x)} ${n(tip.y)}" stroke="${wire}" stroke-width="1.5"/><path d="${arrowHead(tail, tip)}" fill="${wire}"/></g>`,
    );
  }

  a.edges.forEach((e, k) => {
    const g = lay.edges.get(e);
    if (!g || g.points.length < 2) return;
    const last = g.points[g.points.length - 1];
    const tip = g.tip ?? last;
    parts.push(
      `<g class="fa-edge" data-edge="${k}" data-source-line="${e.line - 1}">`,
      `<path class="fa-hit" d="${curve(g.points)}${g.tip ? `L${n(tip.x)} ${n(tip.y)}` : ""}" fill="none" stroke="transparent" stroke-width="10"/>`,
      `<path class="fa-line" d="${curve(g.points)}${g.tip ? `L${n(tip.x)} ${n(tip.y)}` : ""}" fill="none" stroke="${wire}" stroke-width="1.5"/>`,
      `<path class="fa-head" d="${arrowHead(g.points[g.points.length - 1], tip)}" fill="${wire}"/>`,
    );
    if (g.label) {
      const lines = labelLines(e, a.kind);
      const lh = 16;
      lines.forEach((t, i) => {
        const y = g.label!.y + (i - (lines.length - 1) / 2) * lh + 4.5;
        parts.push(`<text class="fa-label" x="${n(g.label!.x)}" y="${n(y)}" text-anchor="middle" ${MONO} font-size="13" fill="${ink}" stroke="${paper}" stroke-width="4" paint-order="stroke">${esc(t)}</text>`);
      });
    }
    parts.push("</g>");
  });

  for (const s of a.states) {
    const p = lay.states.get(s);
    if (!p) continue;
    const acc = a.accept.has(s);
    // Colour: the start state green, accepting states blue.
    const fill = style !== "colour" ? paper : s === a.start ? (dark ? "#1f3a2a" : "#e3f4e8") : acc ? (dark ? "#1e2c45" : "#e6eefc") : paper;
    parts.push(
      `<g class="fa-state" data-state="${esc(s)}" data-source-line="${(a.stateLine.get(s) ?? 1) - 1}" data-qualified-name="${esc(s)}">`,
      `<circle class="fa-ring" cx="${n(p.x)}" cy="${n(p.y)}" r="${n(p.r)}" fill="${fill}" stroke="${ink}" stroke-width="1.6"/>`,
      acc ? `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(p.r - 4)}" fill="none" stroke="${ink}" stroke-width="1.4"/>` : "",
      `<text x="${n(p.x)}" y="${n(p.y + 5)}" text-anchor="middle" ${SANS} font-size="14" fill="${ink}">${esc(s)}</text>`,
      "</g>",
    );
  }
  parts.push("</g>");

  // Each input and what happened to it.
  let y = lay.height + titleH;
  const kindName = a.kind === "dfa" ? "DFA" : a.kind === "nfa" ? "NFA" : "Turing machine";
  parts.push(`<text x="${MARGIN}" y="${n(y)}" ${SANS} font-size="11" font-weight="700" letter-spacing="0.06em" fill="${muted}">${kindName.toUpperCase()}</text>`);
  y += 10;
  a.runs.forEach((run) => {
    y += 24;
    const mark = run.accepted ? "✓" : "✗";
    const shown = run.input === "" ? "ε" : run.input;
    const text = `${shown}: ${run.verdict}`;
    parts.push(
      `<g data-source-line="${run.line - 1}"><text x="${MARGIN}" y="${n(y)}" ${SANS} font-size="14" fill="${ink}"><tspan fill="${run.accepted ? good : bad}" font-weight="700">${mark} </tspan><tspan ${MONO}>${esc(shown)}</tspan>${esc(text.slice(shown.length))}</text></g>`,
    );
    width = Math.max(width, MARGIN * 2 + text.length * 7.6 + 20);
  });
  // One tape per input, in the same place; the first shows, and the player
  // switches between them.
  const size = 28;
  const tapes = a.runs.map((run) => (a.kind === "tm" ? run.steps[0].tape! : run.input === "" ? [] : splitInput(a, run.input)));
  if (tapes.some((t) => t.length)) {
    y += 16;
    tapes.forEach((cells, ri) => {
      parts.push(`<g class="fa-tape" data-run="${ri}" transform="translate(${MARGIN} ${n(y)})"${ri ? ' display="none"' : ""}>`);
      cells.forEach((sym, i) => {
        parts.push(
          `<g class="fa-cell" data-cell="${i}"><rect x="${i * size}" y="0" width="${size}" height="${size}" fill="${paper}" stroke="${muted}"/><text x="${i * size + size / 2}" y="19" text-anchor="middle" ${MONO} font-size="14" fill="${ink}">${esc(sym)}</text></g>`,
        );
      });
      parts.push("</g>");
      width = Math.max(width, MARGIN * 2 + cells.length * size);
    });
    y += size + 4;
  }
  const height = y + MARGIN;
  const trace = JSON.stringify(
    a.runs.map((r) => ({ input: r.input === "" ? "ε" : r.input, accepted: r.accepted, verdict: r.verdict, tm: a.kind === "tm", steps: r.steps.map((s) => ({ s: s.states, e: s.edges, p: s.pos, t: s.tape, n: s.note })) })),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" viewBox="0 0 ${n(width)} ${n(height)}" data-trace="${esc(trace)}">${parts.join("")}</svg>`;
}

function splitInput(a: Automaton, input: string): string[] {
  return a.charInput ? [...input.replace(/\s+/g, "")] : input.split(/[\s,]+/).filter(Boolean);
}
