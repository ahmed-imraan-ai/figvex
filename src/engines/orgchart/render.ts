// Lays out an org chart as a tidy tree and draws it as SVG.
//
// Layout works in "across" (u) and "along" (v) coordinates: for a top-down
// chart u is x and v is y; for a left-to-right chart they swap. Managers sit
// centred over their reports, assistants hang off the manager's line, and in
// compact mode the bottom level of each branch is stacked in a column.

import { headcount, initials, type OrgChart, type Person } from "./model";

export type OrgStyle = "cards" | "minimal" | "bold";

export interface OrgDraw {
  dark: boolean;
  style: OrgStyle;
}

const CARD = { cards: { w: 224, h: 76 }, minimal: { w: 190, h: 56 }, bold: { w: 210, h: 78 } } as const;
const GAP_ACROSS = 24;
const GAP_ALONG = 56;
const COMPACT_INDENT = 26;
const COMPACT_GAP = 12;
const ASSIST_OFFSET = 24;
const MARGIN = 24;

const PALETTE = ["#3b6fd8", "#2f9e5b", "#d4880f", "#c94f8a", "#7b5cd6", "#1f97b0", "#cf4b3d", "#6a9a24"];
const FONT = 'font-family="Helvetica, Arial, sans-serif"';

const n = (v: number) => Math.round(v * 10) / 10;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface Placed {
  person: Person;
  /** Centre across, top along. */
  u: number;
  v: number;
}

interface Point {
  x: number;
  y: number;
}

/** A department's colour; people without one take their manager's. */
export function departmentOf(p: Person): string | undefined {
  for (let q: Person | undefined = p; q; q = q.parent) if (q.department) return q.department;
  return undefined;
}

function isLeaf(p: Person) {
  return !p.children.length && !p.assistants.length;
}

export function layoutOrgChart(chart: OrgChart, style: OrgStyle) {
  const card = CARD[style];
  const right = chart.direction === "right";
  // Size of a card across the tree and along it.
  const A = right ? card.h : card.w;
  const L = right ? card.w : card.h;

  const compactHere = (p: Person) => chart.compact && p.children.length > 0 && p.children.every(isLeaf);
  const assistRows = (p: Person) => Math.ceil(p.assistants.length / 2);
  const width = new Map<Person, number>();

  const measure = (p: Person): number => {
    let w: number;
    if (!p.children.length) w = A;
    else if (compactHere(p)) {
      for (const c of p.children) measure(c);
      w = A + COMPACT_INDENT;
    }
    else w = p.children.reduce((sum, c) => sum + measure(c), 0) + GAP_ACROSS * (p.children.length - 1);
    if (p.assistants.length) w = Math.max(w, 2 * (ASSIST_OFFSET + A) + A / 2);
    width.set(p, Math.max(w, A));
    return width.get(p)!;
  };

  const placed: Placed[] = [];
  const links: Point[][] = [];
  const dotted: { from: Placed; to: Placed; label: string; line: number }[] = [];
  const at = new Map<Person, Placed>();

  const place = (p: Person, left: number, top: number) => {
    const w = width.get(p)!;
    const compact = compactHere(p);
    const u = compact ? left + A / 2 : left + w / 2;
    const me: Placed = { person: p, u, v: top };
    placed.push(me);
    at.set(p, me);

    // Assistants: rows between the manager and the reports, alternating sides.
    const rows = assistRows(p);
    const rowStep = L + GAP_ALONG * 0.5;
    p.assistants.forEach((a, i) => {
      const row = Math.floor(i / 2);
      const side = i % 2 === 0 ? 1 : -1;
      const av = top + L + GAP_ALONG * 0.5 + row * rowStep;
      const au = u + side * (ASSIST_OFFSET + A / 2);
      const ap: Placed = { person: a, u: au, v: av };
      placed.push(ap);
      at.set(a, ap);
      links.push([
        { x: u, y: av + L / 2 },
        { x: au - side * (A / 2), y: av + L / 2 },
      ]);
    });
    const childTop = top + L + GAP_ALONG + rows * rowStep;
    if (!p.children.length) {
      if (rows) links.push([{ x: u, y: top + L }, { x: u, y: top + L + GAP_ALONG * 0.5 + (rows - 1) * rowStep + L / 2 }]);
      return;
    }

    if (compact) {
      // A column of reports, joined by a line down the left.
      const trunk = left + 12;
      let v = childTop - GAP_ALONG * 0.4;
      for (const c of p.children) {
        place(c, left + COMPACT_INDENT, v);
        links.push([
          { x: trunk, y: top + L },
          { x: trunk, y: v + L / 2 },
          { x: left + COMPACT_INDENT, y: v + L / 2 },
        ]);
        v += L + COMPACT_GAP;
      }
      return;
    }

    const total = p.children.reduce((sum, c) => sum + width.get(c)!, 0) + GAP_ACROSS * (p.children.length - 1);
    let cursor = left + (w - total) / 2;
    const bus = childTop - GAP_ALONG / 2;
    for (const c of p.children) {
      place(c, cursor, childTop);
      const cu = at.get(c)!.u;
      links.push([
        { x: u, y: top + L },
        { x: u, y: bus },
        { x: cu, y: bus },
        { x: cu, y: childTop },
      ]);
      cursor += width.get(c)! + GAP_ACROSS;
    }
  };

  let left = 0;
  for (const root of chart.roots) {
    measure(root);
    place(root, left, 0);
    left += width.get(root)! + GAP_ACROSS * 2;
  }
  for (const d of chart.dotted) dotted.push({ from: at.get(d.from)!, to: at.get(d.to)!, label: d.label, line: d.line });

  // Map (u, v) to (x, y) and boxes to the page.
  const toXY = (p: Point): Point => (right ? { x: p.y, y: p.x } : p);
  const boxes = placed.map((pl) => {
    const x = right ? pl.v : pl.u - A / 2;
    const y = right ? pl.u - A / 2 : pl.v;
    return { person: pl.person, x, y, w: card.w, h: card.h };
  });
  return { boxes, links: links.map((l) => l.map(toXY)), dotted };
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;
}

/** Centre of a box, and where a line towards `to` leaves it. */
function edge(b: { x: number; y: number; w: number; h: number }, to: Point): Point {
  const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const dx = to.x - c.x;
  const dy = to.y - c.y;
  if (!dx && !dy) return c;
  const t = Math.min(Math.abs(b.w / 2 / (dx || 1e-9)), Math.abs(b.h / 2 / (dy || 1e-9)));
  return { x: c.x + dx * t, y: c.y + dy * t };
}

export function drawOrgChart(chart: OrgChart, opts: OrgDraw): string {
  const { boxes, links, dotted } = layoutOrgChart(chart, opts.style);
  const dark = opts.dark;
  const ink = dark ? "#ebe9e4" : "#1d1d1b";
  const muted = dark ? "#a8a59e" : "#6b6862";
  const paper = dark ? "#232321" : "#ffffff";
  const rule = dark ? "#4a4945" : "#cfcabd";
  const line = dark ? "#8d8a83" : "#8a877f";
  const colour = (dept?: string) => (dept ? PALETTE[chart.departments.indexOf(dept) % PALETTE.length] : muted);
  const minimal = opts.style === "minimal";

  // Page extent.
  let maxX = Math.max(...boxes.map((b) => b.x + b.w)) + (dotted.length ? 60 : 0);
  let maxY = Math.max(...boxes.map((b) => b.y + b.h)) + (dotted.length ? 60 : 0);
  const titleH = chart.title ? 40 : 0;
  const legend = chart.departments.length && !minimal ? chart.departments : [];
  const legendH = legend.length ? 34 : 0;
  const width = Math.max(maxX, legend.reduce((w, d) => w + d.length * 7 + 34, 0)) + MARGIN * 2;
  const height = maxY + titleH + legendH + MARGIN * 2;
  maxX = width;
  maxY = height;
  const ox = MARGIN;
  const oy = MARGIN + titleH;

  const parts: string[] = [];
  if (chart.title) {
    parts.push(`<text x="${n(width / 2)}" y="${MARGIN + 16}" text-anchor="middle" ${FONT} font-size="18" font-weight="600" fill="${ink}">${esc(chart.title)}</text>`);
  }
  parts.push(`<g transform="translate(${ox} ${oy})">`);

  // Reporting lines under the cards.
  for (const l of links) {
    parts.push(`<path d="${l.map((p, i) => `${i ? "L" : "M"}${n(p.x)} ${n(p.y)}`).join("")}" fill="none" stroke="${line}" stroke-width="1.4" stroke-linejoin="round"/>`);
  }
  // Dotted-line reporting.
  const boxOf = new Map(boxes.map((b) => [b.person, b]));
  for (const d of dotted) {
    const a = boxOf.get(d.from.person)!;
    const b = boxOf.get(d.to.person)!;
    let path: string;
    let mx: number;
    let my: number;
    if (Math.abs(a.y - b.y) < 1 || Math.abs(a.x - b.x) < 1) {
      // Same row (or column): curve round the cards in between instead of crossing them.
      const row = Math.abs(a.y - b.y) < 1;
      const pa = row ? { x: a.x + a.w / 2, y: a.y + a.h } : { x: a.x + a.w, y: a.y + a.h / 2 };
      const pb = row ? { x: b.x + b.w / 2, y: b.y + b.h } : { x: b.x + b.w, y: b.y + b.h / 2 };
      const bulge = 46;
      const cx = (pa.x + pb.x) / 2 + (row ? 0 : bulge * 2);
      const cy = (pa.y + pb.y) / 2 + (row ? bulge * 2 : 0);
      path = `M${n(pa.x)} ${n(pa.y)}Q${n(cx)} ${n(cy)} ${n(pb.x)} ${n(pb.y)}`;
      mx = (pa.x + 2 * cx + pb.x) / 4;
      my = (pa.y + 2 * cy + pb.y) / 4;
    } else {
      const pa = edge(a, { x: b.x + b.w / 2, y: b.y + b.h / 2 });
      const pb = edge(b, { x: a.x + a.w / 2, y: a.y + a.h / 2 });
      path = `M${n(pa.x)} ${n(pa.y)}L${n(pb.x)} ${n(pb.y)}`;
      mx = (pa.x + pb.x) / 2;
      my = (pa.y + pb.y) / 2;
    }
    parts.push(
      `<g data-source-line="${d.line - 1}"><path d="${path}" fill="none" stroke="${line}" stroke-width="1.4" stroke-dasharray="2 5" stroke-linecap="round"/>`,
    );
    if (d.label) {
      const tw = d.label.length * 6 + 10;
      parts.push(`<rect x="${n(mx - tw / 2)}" y="${n(my - 9)}" width="${n(tw)}" height="18" rx="9" fill="${paper}" stroke="${rule}"/>`);
      parts.push(`<text x="${n(mx)}" y="${n(my + 4)}" text-anchor="middle" ${FONT} font-size="11" fill="${muted}">${esc(d.label)}</text>`);
    }
    parts.push("</g>");
  }

  for (const b of boxes) parts.push(drawCard(b, chart, opts, { ink, muted, paper, rule, colour }));
  parts.push("</g>");

  if (legend.length) {
    let x = MARGIN;
    const y = height - MARGIN - 8;
    for (const d of legend) {
      parts.push(`<rect x="${x}" y="${y - 9}" width="12" height="12" rx="3" fill="${colour(d)}"/>`);
      parts.push(`<text x="${x + 18}" y="${y + 1}" ${FONT} font-size="12" fill="${muted}">${esc(d)}</text>`);
      x += d.length * 7 + 34;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(maxX)}" height="${n(maxY)}" viewBox="0 0 ${n(maxX)} ${n(maxY)}">${parts.join("")}</svg>`;
}

interface Ink {
  ink: string;
  muted: string;
  paper: string;
  rule: string;
  colour: (dept?: string) => string;
}

function drawCard(b: { person: Person; x: number; y: number; w: number; h: number }, chart: OrgChart, opts: OrgDraw, c: Ink): string {
  const p = b.person;
  const dept = departmentOf(p);
  const accent = c.colour(dept);
  const dash = p.vacant ? ' stroke-dasharray="5 4"' : "";
  const out: string[] = [`<g data-source-line="${p.line - 1}" data-qualified-name="${esc(p.vacant ? "?" : p.name)}">`];
  const nameStyle = p.vacant ? ' font-style="italic"' : "";
  const count = chart.counts ? headcount(p) : 0;

  if (opts.style === "minimal") {
    out.push(`<rect x="${n(b.x)}" y="${n(b.y)}" width="${b.w}" height="${b.h}" rx="3" fill="${c.paper}" stroke="${c.ink}" stroke-width="1.2"${dash}/>`);
    const chars = Math.floor((b.w - 16) / 7.2);
    const titleChars = Math.floor((b.w - 16) / 6);
    out.push(`<text x="${n(b.x + b.w / 2)}" y="${n(b.y + 23)}" text-anchor="middle" ${FONT} font-size="13" font-weight="600" fill="${p.vacant ? c.muted : c.ink}"${nameStyle}>${esc(clip(p.name, chars))}</text>`);
    if (p.title) out.push(`<text x="${n(b.x + b.w / 2)}" y="${n(b.y + 41)}" text-anchor="middle" ${FONT} font-size="11.5" fill="${c.muted}">${esc(clip(p.title, titleChars))}</text>`);
  } else if (opts.style === "bold") {
    const head = 30;
    out.push(`<rect x="${n(b.x)}" y="${n(b.y)}" width="${b.w}" height="${b.h}" rx="8" fill="${c.paper}" stroke="${p.vacant ? c.muted : accent}" stroke-width="1.5"${dash}/>`);
    if (!p.vacant) {
      out.push(`<path d="M${n(b.x)} ${n(b.y + head)}V${n(b.y + 8)}a8 8 0 0 1 8 -8H${n(b.x + b.w - 8)}a8 8 0 0 1 8 8V${n(b.y + head)}Z" fill="${accent}"/>`);
    }
    const chars = Math.floor((b.w - 20) / 7.4);
    const titleChars = Math.floor((b.w - 20) / 6.4);
    out.push(`<text x="${n(b.x + b.w / 2)}" y="${n(b.y + 20)}" text-anchor="middle" ${FONT} font-size="13.5" font-weight="700" fill="${p.vacant ? c.muted : "#ffffff"}"${nameStyle}>${esc(clip(p.name, chars))}</text>`);
    if (p.title) out.push(`<text x="${n(b.x + b.w / 2)}" y="${n(b.y + head + 20)}" text-anchor="middle" ${FONT} font-size="12" fill="${c.ink}">${esc(clip(p.title, titleChars))}</text>`);
    if (dept) out.push(`<text x="${n(b.x + b.w / 2)}" y="${n(b.y + head + 37)}" text-anchor="middle" ${FONT} font-size="10" letter-spacing="0.6" fill="${c.muted}">${esc(clip(dept.toUpperCase(), titleChars))}</text>`);
  } else {
    out.push(`<rect x="${n(b.x)}" y="${n(b.y)}" width="${b.w}" height="${b.h}" rx="8" fill="${c.paper}" stroke="${c.rule}" stroke-width="1"${dash}/>`);
    if (!p.vacant) out.push(`<path d="M${n(b.x + 8)} ${n(b.y + 0.5)}H${n(b.x + b.w - 8)}" stroke="${accent}" stroke-width="4" stroke-linecap="round"/>`);
    const cx = b.x + 30;
    const cy = b.y + b.h / 2;
    out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="18" fill="${p.vacant ? "none" : accent}" fill-opacity="${p.vacant ? 1 : 0.16}" stroke="${p.vacant ? c.muted : "none"}" stroke-dasharray="3 3"/>`);
    out.push(`<text x="${n(cx)}" y="${n(cy + 4.5)}" text-anchor="middle" ${FONT} font-size="12.5" font-weight="700" fill="${p.vacant ? c.muted : accent}">${esc(p.vacant ? "?" : initials(p.name))}</text>`);
    const tx = b.x + 58;
    const chars = Math.floor((b.x + b.w - 10 - tx) / 7.3);
    const titleChars = Math.floor((b.x + b.w - 10 - tx) / 6);
    out.push(`<text x="${n(tx)}" y="${n(b.y + 28)}" ${FONT} font-size="13.5" font-weight="600" fill="${p.vacant ? c.muted : c.ink}"${nameStyle}>${esc(clip(p.name, chars))}</text>`);
    if (p.title) out.push(`<text x="${n(tx)}" y="${n(b.y + 45)}" ${FONT} font-size="11.5" fill="${c.muted}">${esc(clip(p.title, titleChars))}</text>`);
    if (dept) out.push(`<text x="${n(tx)}" y="${n(b.y + 61)}" ${FONT} font-size="9.5" letter-spacing="0.6" fill="${accent}">${esc(clip(dept.toUpperCase(), titleChars))}</text>`);
  }

  if (count) {
    const label = String(count);
    const pw = label.length * 7 + 14;
    const px = b.x + b.w - pw - 8;
    const py = b.y + b.h - 9;
    out.push(`<rect x="${n(px)}" y="${n(py)}" width="${pw}" height="18" rx="9" fill="${c.paper}" stroke="${c.rule}"/>`);
    out.push(`<text x="${n(px + pw / 2)}" y="${n(py + 12.5)}" text-anchor="middle" ${FONT} font-size="11" font-weight="600" fill="${c.muted}">${label}</text>`);
  }
  if (p.assistant) {
    // Inside the top right of a Cards card; just above Minimal and Bold
    // cards, whose names are centred.
    const tagY = opts.style === "cards" ? b.y + 14 : b.y - 5;
    out.push(`<text x="${n(b.x + b.w - 8)}" y="${n(tagY)}" text-anchor="end" ${FONT} font-size="9" letter-spacing="0.5" fill="${c.muted}">ASSISTANT</text>`);
  }
  out.push("</g>");
  return out.join("");
}
