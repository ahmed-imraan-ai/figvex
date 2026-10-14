// Lays out a network with Graphviz (zones as clusters) and draws it as SVG
// with our own device icons.

import type { VizInstance } from "../graphviz";
import { formatAddress } from "./address";
import type { NetStyle } from "../types";
import type { Device, DeviceKind, Link, Network, NetworkWarning, Zone } from "./model";

export type { NetStyle };

export interface NetDraw {
  dark: boolean;
  style: NetStyle;
  /** Lines with a warning; their devices get a marker. */
  warnings?: NetworkWarning[];
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Point {
  x: number;
  y: number;
}

export interface NetLayout {
  width: number;
  height: number;
  devices: Map<Device, Box>;
  zones: Map<Zone, Box>;
  /** Graphviz's own route per link, used for curved lines. */
  routes: Map<Link, Point[]>;
  /** Where Graphviz left room for each link's label. */
  labelAt: Map<Link, Point>;
}

const ICON = 44;
const NAME_H = 17;
const SMALL_H = 14;
const MARGIN = 24;
const FONT = 'font-family="Helvetica, Arial, sans-serif"';
const MONO = 'font-family="ui-monospace, Menlo, Consolas, monospace"';

const n = (v: number) => Math.round(v * 10) / 10;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const dotq = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** Text lines under a device's icon. */
function captions(d: Device): { name: string; small: { text: string; mono: boolean }[] } {
  const small: { text: string; mono: boolean }[] = d.addresses.map((a) => ({
    text: `${formatAddress(a.value, a.family)}${a.prefix !== undefined ? `/${a.prefix}` : ""}`,
    mono: true,
  }));
  if (d.vlan !== undefined) small.push({ text: `VLAN ${d.vlan}`, mono: false });
  if (d.note) small.push({ text: d.note, mono: false });
  return { name: d.label, small };
}

function deviceSize(d: Device): { w: number; h: number } {
  const { name, small } = captions(d);
  const textW = Math.max(name.length * 7.4, ...small.map((s) => s.text.length * (s.mono ? 6.7 : 6.2)));
  return { w: Math.max(ICON + 28, textW + 12), h: ICON + 6 + NAME_H + small.length * SMALL_H };
}

/** Subnets and VLAN shown after a zone's name. */
function zoneExtra(z: Zone): string {
  return [...z.subnets.map((s) => s.text), z.vlan !== undefined && !z.label.includes(`VLAN ${z.vlan}`) ? `VLAN ${z.vlan}` : ""].filter(Boolean).join("  ·  ");
}

/**
 * Text for the cluster label, which only reserves room for our heading.
 * The address part is drawn in a monospace font, wider than Graphviz
 * reckons, so it gets a little padding.
 */
function zoneHeading(z: Zone): string {
  const extra = zoneExtra(z);
  return extra ? `${z.label}  ${extra}${" ".repeat(Math.ceil(extra.length * 0.25) + 2)}` : `${z.label}  `;
}

/** The words on a link: its label and VLANs. */
function linkText(l: Link): string {
  return [l.label, l.vlans.length ? `VLAN ${l.vlans.join(", ")}` : ""].filter(Boolean).join(" · ");
}

/** Graphviz lays out devices and zones; the drawing is ours. */
export function layoutNetwork(net: Network, viz: VizInstance): NetLayout {
  const idx = new Map(net.devices.map((d, i) => [d, i]));
  const zoneIdx = new Map(net.allZones.map((z, i) => [z, i]));
  const right = net.direction === "right";
  // Ports sit near the ends of a link, so they need a little more length.
  const ported = net.links.some((l) => l.fromPort || l.toPort);
  const out: string[] = [
    "graph net {",
    `graph [rankdir=${right ? "LR" : "TB"} nodesep=${right ? 0.5 : 0.75} ranksep=${ported ? 0.95 : 0.75} splines=true margin=0 fontname="Helvetica" fontsize=12]`,
    'node [shape=box fixedsize=true label=""]',
  ];
  const writeZone = (z: Zone, depth: string) => {
    // The cluster label reserves room for our own heading.
    // With port names about, a second label line leaves them room between
    // the heading and the devices.
    const heading = ported ? `${dotq(zoneHeading(z)).slice(0, -1)}\\n "` : dotq(zoneHeading(z));
    out.push(`${depth}subgraph cluster_${zoneIdx.get(z)} {`, `${depth}  graph [label=${heading} labeljust=l margin=16]`);
    for (const d of z.devices) out.push(`${depth}  n${idx.get(d)}`);
    for (const c of z.zones) writeZone(c, `${depth}  `);
    out.push(`${depth}}`);
  };
  for (const z of net.zones) writeZone(z, "");
  for (const d of net.devices) {
    const s = deviceSize(d);
    out.push(`n${idx.get(d)} [width=${(s.w / 72).toFixed(3)} height=${(s.h / 72).toFixed(3)}]`);
  }
  // Rank devices by how many links they are from the first device of their
  // part of the network, so a link written either way round points
  // downstream and links between peers (core1 == core2) keep them level.
  const level = new Map<Device, number>();
  const neighbours = new Map<Device, Device[]>(net.devices.map((d) => [d, []]));
  for (const l of net.links) {
    neighbours.get(l.from)!.push(l.to);
    neighbours.get(l.to)!.push(l.from);
  }
  for (const root of net.devices) {
    if (level.has(root)) continue;
    level.set(root, 0);
    const queue = [root];
    while (queue.length) {
      const d = queue.shift()!;
      for (const m of neighbours.get(d)!) {
        if (level.has(m)) continue;
        level.set(m, level.get(d)! + 1);
        queue.push(m);
      }
    }
  }
  const flipped = new Set<Link>();
  for (const l of net.links) {
    const flip = level.get(l.from)! > level.get(l.to)!;
    if (flip) flipped.add(l);
    const [a, b] = flip ? [l.to, l.from] : [l.from, l.to];
    const attrs: string[] = [];
    if (level.get(a) === level.get(b)) attrs.push("constraint=false");
    // A label makes Graphviz leave room for it between the ranks.
    const text = linkText(l);
    if (text) attrs.push(`label=${dotq(text)} fontsize=11`);
    out.push(`n${idx.get(a)} -- n${idx.get(b)}${attrs.length ? ` [${attrs.join(" ")}]` : ""}`);
  }
  out.push("}");

  const result = viz.render(out.join("\n"), { format: "json" });
  if (result.status !== "success" || !result.output) throw new Error("Graphviz couldn't lay out this network.");
  const json = JSON.parse(result.output) as {
    bb: string;
    objects?: { name: string; pos?: string; bb?: string }[];
    edges?: { tail: number; head: number; pos?: string; lp?: string }[];
  };
  const [, , bbW, bbH] = json.bb.split(",").map(Number);
  const flip = (x: number, y: number): Point => ({ x: x + MARGIN, y: bbH - y + MARGIN });

  const devices = new Map<Device, Box>();
  const zones = new Map<Zone, Box>();
  for (const o of json.objects ?? []) {
    if (o.name.startsWith("cluster_") && o.bb) {
      const [x1, y1, x2, y2] = o.bb.split(",").map(Number);
      const tl = flip(x1, y2);
      zones.set(net.allZones[Number(o.name.slice(8))], { x: tl.x, y: tl.y, w: x2 - x1, h: y2 - y1 });
    } else if (/^n\d+$/.test(o.name) && o.pos) {
      const d = net.devices[Number(o.name.slice(1))];
      const [px, py] = o.pos.split(",").map(Number);
      const c = flip(px, py);
      const s = deviceSize(d);
      devices.set(d, { x: c.x - s.w / 2, y: c.y - s.h / 2, w: s.w, h: s.h });
    }
  }
  const routes = new Map<Link, Point[]>();
  const labelAt = new Map<Link, Point>();
  (json.edges ?? []).forEach((e, i) => {
    const link = net.links[i];
    if (e.lp) {
      const [lx, ly] = e.lp.split(",").map(Number);
      labelAt.set(link, flip(lx, ly));
    }
    if (!e.pos) return;
    const pts = e.pos
      .split(" ")
      .filter((p) => !/^[se],/.test(p))
      .map((p) => p.split(",").map(Number))
      .map(([x, y]) => flip(x, y));
    routes.set(link, flipped.has(link) ? pts.reverse() : pts);
  });
  return { width: bbW + MARGIN * 2, height: bbH + MARGIN * 2, devices, zones, routes, labelAt };
}

const ZONE_COLOURS = ["#3b6fd8", "#2f9e5b", "#d4880f", "#7b5cd6", "#c94f8a", "#1f97b0", "#cf4b3d", "#6a9a24"];

export const KIND_COLOUR: Record<DeviceKind, string> = {
  internet: "#3b6fd8",
  cloud: "#3b6fd8",
  router: "#1f97b0",
  firewall: "#cf4b3d",
  switch: "#2f9e5b",
  lb: "#6a9a24",
  ap: "#7b5cd6",
  server: "#d4880f",
  vm: "#d4880f",
  database: "#c94f8a",
  storage: "#c94f8a",
  pc: "#5d6b80",
  laptop: "#5d6b80",
  phone: "#5d6b80",
  printer: "#5d6b80",
  camera: "#5d6b80",
  iot: "#5d6b80",
  user: "#5d6b80",
};

/** Glyphs on a 24-unit grid, drawn as strokes. A "•" path is filled. */
export const GLYPHS: Record<DeviceKind, string[]> = {
  internet: ["M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18", "M12 3c-2.6 2.5-3.9 5.5-3.9 9s1.3 6.5 3.9 9c2.6-2.5 3.9-5.5 3.9-9S14.6 5.5 12 3", "M3 12h18", "M4.6 7.5h14.8", "M4.6 16.5h14.8"],
  cloud: ["M7 18.5h10.2a4.3 4.3 0 0 0 .5-8.56A6 6 0 0 0 6.3 8.8a4.85 4.85 0 0 0 .7 9.7z"],
  router: ["M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18", "M7 9.5h8.5", "M13.5 7.5l2 2-2 2", "M17 14.5H8.5", "M10.5 12.5l-2 2 2 2"],
  firewall: ["M3.5 5h17v14h-17z", "M3.5 9.7h17", "M3.5 14.3h17", "M9 5v4.7", "M15 5v4.7", "M12 9.7v4.6", "M7 14.3V19", "M17 14.3V19"],
  switch: ["M5 7h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z", "M6.5 10.2h10", "M14.8 8.6l1.7 1.6-1.7 1.6", "M17.5 13.8h-10", "M9.2 12.2l-1.7 1.6 1.7 1.6"],
  lb: ["M6 9.8a2.2 2.2 0 1 0 0 4.4a2.2 2.2 0 1 0 0-4.4", "M8.2 12h3.3", "M11.5 12l5-5.5", "M11.5 12h5", "M11.5 12l5 5.5", "M18.5 5a1.6 1.6 0 1 0 0 3.2a1.6 1.6 0 1 0 0-3.2", "M18.5 10.4a1.6 1.6 0 1 0 0 3.2a1.6 1.6 0 1 0 0-3.2", "M18.5 15.8a1.6 1.6 0 1 0 0 3.2a1.6 1.6 0 1 0 0-3.2"],
  ap: ["M4.5 10a10.5 10.5 0 0 1 15 0", "M7.6 13.2a6 6 0 0 1 8.8 0", "•M12 15.5a1.6 1.6 0 1 0 0 3.2a1.6 1.6 0 1 0 0-3.2"],
  server: ["M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M5 9h14", "M5 15h14", "M8.5 6h.01", "M8.5 12h.01", "M8.5 18h.01", "M12 6h3.5", "M12 12h3.5", "M12 18h3.5"],
  vm: ["M9 3h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M3.5 8v11a2 2 0 0 0 2 2h11", "M11.5 8.5l-2 1.5 2 1.5", "M16.5 8.5l2 1.5-2 1.5"],
  database: ["M12 3c3.9 0 7 1.1 7 2.5S15.9 8 12 8 5 6.9 5 5.5 8.1 3 12 3z", "M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13", "M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"],
  storage: ["M5.5 4h13a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 9.5v-4A1.5 1.5 0 0 1 5.5 4z", "M5.5 13h13a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-4A1.5 1.5 0 0 1 5.5 13z", "M7.5 7.5h.01", "M7.5 16.5h.01", "M11 7.5h5", "M11 16.5h5"],
  pc: ["M4.5 4h15A1.5 1.5 0 0 1 21 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 14.5v-9A1.5 1.5 0 0 1 4.5 4z", "M12 16v4", "M8 20h8"],
  laptop: ["M6 5h12a1 1 0 0 1 1 1v9H5V6a1 1 0 0 1 1-1z", "M2.5 18.5h19l-1.5-3.5H4z"],
  phone: ["M8.5 2.5h7a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 20V4a1.5 1.5 0 0 1 1.5-1.5z", "M11 18.5h2"],
  printer: ["M7 9V3.5h10V9", "M4.5 9h15A1.5 1.5 0 0 1 21 10.5v5a1.5 1.5 0 0 1-1.5 1.5H17", "M7 17H4.5A1.5 1.5 0 0 1 3 15.5v-5A1.5 1.5 0 0 1 4.5 9", "M7 14h10v6.5H7z", "M17.5 12h.01"],
  camera: ["M4.5 7.5h9A1.5 1.5 0 0 1 15 9v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 3 15V9a1.5 1.5 0 0 1 1.5-1.5z", "M15 10.5l5.5-3v9l-5.5-3"],
  iot: ["M8.5 7h7A1.5 1.5 0 0 1 17 8.5v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 15.5v-7A1.5 1.5 0 0 1 8.5 7z", "M10 3v4", "M14 3v4", "M10 17v4", "M14 17v4", "M3 10h4", "M3 14h4", "M17 10h4", "M17 14h4"],
  user: ["M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8", "M4.5 21a7.5 7.5 0 0 1 15 0"],
};

/** A point on a box's edge, on the line from its centre towards p. */
function clipToBox(b: Box, p: Point, gap: number): Point {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const dx = p.x - cx;
  const dy = p.y - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const hw = b.w / 2 + gap;
  const hh = b.h / 2 + gap;
  const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return { x: cx + dx * t, y: cy + dy * t };
}

/** The path a link takes, with the points its labels sit at. */
function linkGeometry(l: Link, lay: NetLayout, mode: Network["lines"], right: boolean) {
  const a = lay.devices.get(l.from)!;
  const b = lay.devices.get(l.to)!;
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const route = lay.routes.get(l);
  if (mode === "curved" && route && route.length >= 4) {
    const [p0, ...rest] = route;
    let d = `M${n(p0.x)} ${n(p0.y)}`;
    for (let i = 0; i + 2 < rest.length; i += 3) d += `C${n(rest[i].x)} ${n(rest[i].y)} ${n(rest[i + 1].x)} ${n(rest[i + 1].y)} ${n(rest[i + 2].x)} ${n(rest[i + 2].y)}`;
    const mid = lay.labelAt.get(l) ?? route[Math.floor(route.length / 2)];
    return { d, mid, start: p0, startDir: route[1], end: route[route.length - 1], endDir: route[route.length - 2] };
  }
  if (mode === "square") {
    // Out of one box and into the other along the layout's direction, with
    // the turn halfway between them.
    const along = right ? "x" : "y";
    const forward = right ? cb.x >= ca.x : cb.y >= ca.y;
    const sameRank = right ? Math.abs(ca.x - cb.x) < 2 : Math.abs(ca.y - cb.y) < 2;
    if (!sameRank) {
      const pa = along === "y" ? { x: ca.x, y: forward ? a.y + a.h + 3 : a.y - 3 } : { x: forward ? a.x + a.w + 3 : a.x - 3, y: ca.y };
      const pb = along === "y" ? { x: cb.x, y: forward ? b.y - 3 : b.y + b.h + 3 } : { x: forward ? b.x - 3 : b.x + b.w + 3, y: cb.y };
      const m = along === "y" ? (pa.y + pb.y) / 2 : (pa.x + pb.x) / 2;
      const pts = along === "y" ? [pa, { x: pa.x, y: m }, { x: pb.x, y: m }, pb] : [pa, { x: m, y: pa.y }, { x: m, y: pb.y }, pb];
      const d = pts.map((p, i) => `${i ? "L" : "M"}${n(p.x)} ${n(p.y)}`).join("");
      const mid = { x: (pts[1].x + pts[2].x) / 2, y: (pts[1].y + pts[2].y) / 2 };
      return { d, mid, start: pa, startDir: pts[1], end: pb, endDir: pts[2] };
    }
  }
  const pa = clipToBox(a, cb, 3);
  const pb = clipToBox(b, ca, 3);
  // The label goes where the line crosses the gap Graphviz left for it,
  // which keeps it off zone borders and headings.
  let t = 0.5;
  const room = lay.labelAt.get(l);
  const v = right ? "x" : "y";
  if (room && Math.abs(pb[v] - pa[v]) > 1) t = Math.min(0.8, Math.max(0.2, (room[v] - pa[v]) / (pb[v] - pa[v])));
  const mid = { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t };
  return { d: `M${n(pa.x)} ${n(pa.y)}L${n(pb.x)} ${n(pb.y)}`, mid, start: pa, startDir: pb, end: pb, endDir: pa };
}

/** A point `dist` along the way from p towards q. */
function toward(p: Point, q: Point, dist: number): Point {
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  const t = Math.min(dist, len * 0.45) / len;
  return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
}

export function drawNetwork(net: Network, lay: NetLayout, opts: NetDraw): string {
  const { dark, style } = opts;
  const ink = dark ? "#ebe9e4" : "#1d1d1b";
  const muted = dark ? "#a8a59e" : "#6b6862";
  const paper = dark ? "#232321" : "#ffffff";
  const wire = dark ? "#9a978f" : "#7d7a72";
  const warnColour = dark ? "#e8b04a" : "#b7791f";
  const titleH = net.title ? 40 : 0;
  const width = lay.width;
  const height = lay.height + titleH;
  const parts: string[] = [];

  if (net.title) {
    parts.push(`<text x="${n(width / 2)}" y="${MARGIN + 14}" text-anchor="middle" ${FONT} font-size="18" font-weight="600" fill="${ink}">${esc(net.title)}</text>`);
  }
  parts.push(`<g transform="translate(0 ${titleH})">`);

  // Zones, outermost first so inner ones sit on top. Their headings are
  // drawn after the links.
  const headings: string[] = [];
  const tabs: Box[] = [];
  net.allZones.forEach((z, i) => {
    const box = lay.zones.get(z);
    if (!box) return;
    // Graphviz packs side-by-side zones edge to edge; an inset leaves a gap.
    const b = { x: box.x + 4, y: box.y + 4, w: box.w - 8, h: box.h - 8 };
    let depth = 0;
    for (let p = z.parent; p; p = p.parent) depth++;
    const c = style === "mono" ? muted : ZONE_COLOURS[i % ZONE_COLOURS.length];
    const fillOpacity = (dark ? 0.1 : 0.06) + depth * 0.02;
    const dash = z.subnets.length || z.vlan !== undefined ? "" : ' stroke-dasharray="6 4"';
    parts.push(`<rect data-source-line="${z.line - 1}" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="10" fill="${c}" fill-opacity="${fillOpacity}" stroke="${c}" stroke-opacity="${dark ? 0.6 : 0.45}" stroke-width="1.2"${dash}/>`);
    let x = b.x + 12;
    const y = b.y + 19;
    const extra = zoneExtra(z);
    // The heading sits on a tab of the zone's own colour, so links that
    // cross it pass underneath instead of through the text.
    const tabW = Math.min(b.w - 3, z.label.length * 7.3 + (extra ? 10 + extra.length * 6.7 : 0) + 22);
    tabs.push({ x: b.x + 1.5, y: b.y + 1.5, w: tabW, h: 26 });
    // Matches the zone fills stacked under it, near enough.
    let tint = 0;
    for (let p: Zone | undefined = z, d = depth; p; p = p.parent, d--) tint += (1 - tint) * ((dark ? 0.1 : 0.06) + d * 0.02);
    headings.push(
      `<g data-source-line="${z.line - 1}"><rect x="${n(b.x + 1.5)}" y="${n(b.y + 1.5)}" width="${n(tabW)}" height="26" rx="8.5" fill="${paper}"/>`,
      `<rect x="${n(b.x + 1.5)}" y="${n(b.y + 1.5)}" width="${n(tabW)}" height="26" rx="8.5" fill="${c}" fill-opacity="${n(tint * 100) / 100}"/>`,
      `<text x="${n(x)}" y="${n(y)}" ${FONT} font-size="12.5" font-weight="600" fill="${style === "mono" ? ink : c}">${esc(z.label)}</text>`,
    );
    x += z.label.length * 7.3 + 10;
    if (extra) headings.push(`<text x="${n(x)}" y="${n(y)}" ${MONO} font-size="11" fill="${muted}" xml:space="preserve">${esc(extra)}</text>`);
    headings.push("</g>");
  });

  // Links under the devices.
  const right = net.direction === "right";
  const labels: string[] = [];
  const geometry = new Map(net.links.map((l) => [l, linkGeometry(l, lay, net.lines, right)]));
  // Port names keep off zone headings and link labels.
  const blocked: Box[] = [...tabs];
  for (const [l, g] of geometry) {
    const text = linkText(l);
    if (text) blocked.push({ x: g.mid.x - (text.length * 6.1 + 14) / 2, y: g.mid.y - 9, w: text.length * 6.1 + 14, h: 18 });
  }
  for (const l of net.links) {
    const g = geometry.get(l)!;
    const strokes: Record<Link["style"], string> = {
      cable: `stroke-width="1.6"`,
      trunk: `stroke-width="4"`,
      vpn: `stroke-width="1.6" stroke-dasharray="7 5"`,
      wireless: `stroke-width="1.8" stroke-dasharray="1 5" stroke-linecap="round"`,
    };
    const colour = l.style === "vpn" ? (style === "mono" ? wire : "#7b5cd6") : l.style === "wireless" ? (style === "mono" ? wire : "#1f97b0") : wire;
    parts.push(`<g data-source-line="${l.line - 1}"><path d="${g.d}" fill="none" stroke="${colour}" ${strokes[l.style]} stroke-linejoin="round"/>`);
    // A wider invisible stroke makes thin links easy to click.
    parts.push(`<path d="${g.d}" fill="none" stroke="transparent" stroke-width="10"/></g>`);
    const text = linkText(l);
    if (text) {
      const tw = text.length * 6.1 + 14;
      labels.push(
        `<g data-source-line="${l.line - 1}"><rect x="${n(g.mid.x - tw / 2)}" y="${n(g.mid.y - 9)}" width="${n(tw)}" height="18" rx="9" fill="${paper}" stroke="${colour}" stroke-opacity="0.5"/>` +
          `<text x="${n(g.mid.x)}" y="${n(g.mid.y + 4)}" text-anchor="middle" ${FONT} font-size="11" fill="${ink}">${esc(text)}</text></g>`,
      );
    }
    for (const [port, at, dir] of [
      [l.fromPort, g.start, g.startDir],
      [l.toPort, g.end, g.endDir],
    ] as const) {
      if (!port) continue;
      // Near the end of the link, in the first spot that's free.
      const clear = (q: Point) => !blocked.some((t) => q.x + 5 < t.x + t.w && q.x + 5 + port.length * 6.2 > t.x && q.y - 7 < t.y + t.h && q.y + 5 > t.y);
      const p = [18, 28, 40, 54, 70, 90].map((d) => toward(at, dir, d)).find(clear) ?? toward(at, dir, 18);
      labels.push(
        `<text x="${n(p.x + 5)}" y="${n(p.y + 3.5)}" ${MONO} font-size="10" fill="${muted}" stroke="${paper}" stroke-width="3" paint-order="stroke">${esc(port)}</text>`,
      );
    }
  }

  parts.push(...headings);
  const warned = new Set((opts.warnings ?? []).map((w) => w.line));
  for (const d of net.devices) {
    const b = lay.devices.get(d);
    if (b) parts.push(drawDevice(d, b, { style, ink, muted, paper, warn: warned.has(d.line) ? warnColour : "" }));
  }
  parts.push(...labels, "</g>");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" viewBox="0 0 ${n(width)} ${n(height)}">${parts.join("")}</svg>`;
}

function glyph(kind: DeviceKind, x: number, y: number, size: number, colour: string, width: number): string {
  const k = size / 24;
  const paths = GLYPHS[kind].map((d) =>
    d.startsWith("•") ? `<path d="${d.slice(1)}" fill="${colour}" stroke="none"/>` : `<path d="${d}"/>`,
  );
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${k})" fill="none" stroke="${colour}" stroke-width="${n(width / k)}" stroke-linecap="round" stroke-linejoin="round">${paths.join("")}</g>`;
}

function drawDevice(d: Device, b: Box, c: { style: NetStyle; ink: string; muted: string; paper: string; warn: string }): string {
  const out: string[] = [`<g data-source-line="${d.line - 1}" data-qualified-name="${esc(d.id)}">`];
  const cx = b.x + b.w / 2;
  const ix = cx - ICON / 2;
  const iy = b.y;
  const colour = c.style === "mono" ? (c.paper === "#ffffff" ? "#55534e" : "#8d8a83") : KIND_COLOUR[d.kind];
  // Stacked copies behind the icon show a count.
  if (d.count && d.count > 1) {
    for (const off of [8, 4]) {
      out.push(`<rect x="${n(ix + off)}" y="${n(iy - off)}" width="${ICON}" height="${ICON}" rx="10" fill="${c.paper}" stroke="${colour}" stroke-opacity="0.55"/>`);
    }
  }
  if (c.style === "outline") {
    out.push(`<rect x="${n(ix)}" y="${n(iy)}" width="${ICON}" height="${ICON}" rx="10" fill="${c.paper}" stroke="${colour}" stroke-width="1.4"/>`);
    out.push(glyph(d.kind, ix + 8, iy + 8, ICON - 16, colour, 1.7));
  } else {
    out.push(`<rect x="${n(ix)}" y="${n(iy)}" width="${ICON}" height="${ICON}" rx="10" fill="${colour}"/>`);
    out.push(glyph(d.kind, ix + 9, iy + 9, ICON - 18, "#ffffff", 1.8));
  }
  if (d.count && d.count > 1) {
    const t = `×${d.count}`;
    const w = t.length * 6.5 + 10;
    out.push(`<rect x="${n(ix + ICON - w / 2 + 6)}" y="${n(iy + ICON - 10)}" width="${n(w)}" height="16" rx="8" fill="${c.paper}" stroke="${colour}"/>`);
    out.push(`<text x="${n(ix + ICON + 6)}" y="${n(iy + ICON + 2)}" text-anchor="middle" ${FONT} font-size="10.5" font-weight="600" fill="${c.ink}">${t}</text>`);
  }
  if (c.warn) {
    out.push(`<circle cx="${n(ix - 2)}" cy="${n(iy + 2)}" r="8" fill="${c.warn}" stroke="${c.paper}" stroke-width="2"/>`);
    out.push(`<text x="${n(ix - 2)}" y="${n(iy + 6)}" text-anchor="middle" ${FONT} font-size="11" font-weight="700" fill="#ffffff">!</text>`);
  }
  const { name, small } = captions(d);
  let y = iy + ICON + 6 + 12;
  out.push(`<text x="${n(cx)}" y="${n(y)}" text-anchor="middle" ${FONT} font-size="12.5" font-weight="600" fill="${c.ink}" stroke="${c.paper}" stroke-width="3" paint-order="stroke">${esc(name)}</text>`);
  for (const s of small) {
    y += SMALL_H;
    out.push(`<text x="${n(cx)}" y="${n(y)}" text-anchor="middle" ${s.mono ? MONO : FONT} font-size="${s.mono ? 10.5 : 11}" fill="${c.muted}" stroke="${c.paper}" stroke-width="3" paint-order="stroke">${esc(s.text)}</text>`);
  }
  out.push("</g>");
  return out.join("");
}
