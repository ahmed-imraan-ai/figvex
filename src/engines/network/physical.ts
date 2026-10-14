// Physical views of a network: rack elevations and floor plans with the
// cables between devices. They live in the same file as the logical
// diagram, in rack and floor blocks that refer to its devices:
//
//   rack r1 "Comms rack" 24U
//     1 patch "Patch panel"
//     3 sw1
//     5-6 web
//   floor f1 "Ground floor" 24x14
//     room "Office" 0 0 14 10
//     pc1 3 3
//     sw1 15 2

import { KIND_LABEL, NetworkError, type Device, type Network, type NetworkWarning } from "./model";
import { KIND_COLOUR } from "./render";

/** Rack items that aren't network devices. */
export const RACK_PARTS = ["patch", "blank", "shelf", "ups", "pdu", "cable", "kvm"] as const;
type RackPart = (typeof RACK_PARTS)[number];

const PART_LABEL: Record<RackPart, string> = { patch: "Patch panel", blank: "Blank", shelf: "Shelf", ups: "UPS", pdu: "PDU", cable: "Cable manager", kvm: "KVM" };

export interface RackItem {
  from: number;
  to: number;
  device?: Device;
  part?: RackPart;
  label: string;
  line: number;
}

export interface Rack {
  id: string;
  label: string;
  units: number;
  items: RackItem[];
  line: number;
}

export interface Room {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  line: number;
}

export interface Floor {
  id: string;
  label: string;
  w: number;
  h: number;
  rooms: Room[];
  places: { device: Device; x: number; y: number; line: number }[];
  line: number;
}

export interface Physical {
  racks: Rack[];
  floors: Floor[];
  /** "logical" (the default), "physical" or "all". */
  view: "all" | "logical" | "physical";
}

/** Rack, floor and view lines, cut out of the source with blank lines left so line numbers still match. */
export function splitPhysical(code: string): { logical: string; physical: { text: string; line: number; indent: number }[] } {
  const lines = code.split(/\r\n|\r|\n/);
  const physical: { text: string; line: number; indent: number }[] = [];
  let inBlock = false;
  const logical = lines.map((raw, i) => {
    const text = raw.replace(/(^|\s)#.*$/, "");
    const indent = text.length - text.trimStart().length;
    const t = text.trim();
    if (!t) return raw;
    if (indent === 0) inBlock = /^(rack|floor)\b/.test(t);
    if (inBlock || (indent === 0 && /^view\b/.test(t))) {
      physical.push({ text: t, line: i + 1, indent });
      return "";
    }
    return raw;
  });
  return { logical: logical.join("\n"), physical };
}

const words = (t: string) => t.match(/"[^"]*"|\S+/g) ?? [];
const unq = (s: string) => s.replace(/^"(.*)"$/, "$1");

export function parsePhysical(lines: { text: string; line: number; indent: number }[], net: Network, warnings: NetworkWarning[]): Physical {
  const phys: Physical = { racks: [], floors: [], view: "all" };
  const byId = new Map(net.devices.map((d) => [d.id, d]));
  let rack: Rack | undefined;
  let floor: Floor | undefined;
  const device = (id: string, line: number) => {
    const d = byId.get(id);
    if (!d) throw new NetworkError(`There's no device called ${id}. Declare it in the network first.`, line);
    return d;
  };
  for (const { text, line, indent } of lines) {
    const w = words(text);
    if (indent === 0) {
      rack = floor = undefined;
      if (w[0] === "view") {
        if (!["all", "logical", "physical"].includes(w[1] ?? "")) throw new NetworkError("view is all, logical or physical.", line);
        phys.view = w[1] as Physical["view"];
      } else if (w[0] === "rack") {
        const size = w.find((x) => /^\d+U$/i.test(x));
        if (!w[1] || w[1].startsWith('"') || /^\d+U$/i.test(w[1])) throw new NetworkError('Give the rack a name: rack r1 "Comms rack" 42U', line);
        rack = { id: w[1], label: unq(w.find((x) => x.startsWith('"')) ?? w[1]), units: size ? parseInt(size, 10) : 42, items: [], line };
        if (rack.units < 1 || rack.units > 60) throw new NetworkError("A rack has between 1 and 60 units.", line);
        phys.racks.push(rack);
      } else {
        const size = w.find((x) => /^\d+(\.\d+)?x\d+(\.\d+)?$/.test(x));
        if (!w[1] || w[1].startsWith('"') || !size) throw new NetworkError('Write a floor as floor f1 "Ground floor" 24x14 (width x depth in metres).', line);
        const [fw, fh] = size.split("x").map(Number);
        floor = { id: w[1], label: unq(w.find((x) => x.startsWith('"')) ?? w[1]), w: fw, h: fh, rooms: [], places: [], line };
        phys.floors.push(floor);
      }
      continue;
    }
    if (rack) {
      const u = w[0]?.match(/^(\d+)(?:-(\d+))?$/);
      if (!u) throw new NetworkError("Start a rack line with its unit, like 3 sw1 or 5-6 web.", line);
      const from = Number(u[1]);
      const to = Number(u[2] ?? u[1]);
      if (to < from) throw new NetworkError(`Write the units low to high, like ${to}-${from}.`, line);
      if (to > rack.units) warnings.push({ message: `Unit ${to} is above the top of ${rack.label} (${rack.units}U).`, line });
      const what = w[1];
      if (!what) throw new NetworkError("Say what goes in these units: a device name, or patch, blank, shelf, ups, pdu, cable or kvm.", line);
      const label = w[2] ? unq(w[2]) : undefined;
      const item: RackItem = (RACK_PARTS as readonly string[]).includes(what)
        ? { from, to, part: what as RackPart, label: label ?? PART_LABEL[what as RackPart], line }
        : (() => {
            const d = device(what, line);
            return { from, to, device: d, label: label ?? d.label, line };
          })();
      const clash = rack.items.find((o) => o.from <= to && from <= o.to);
      if (clash) warnings.push({ message: `Units ${from}${to > from ? `-${to}` : ""} overlap ${clash.label} on line ${clash.line}.`, line });
      rack.items.push(item);
      continue;
    }
    if (floor) {
      if (w[0] === "room") {
        const label = unq(w[1] ?? "");
        const nums = w.slice(2).map(Number);
        if (!w[1]?.startsWith('"') || nums.length !== 4 || nums.some((x) => !Number.isFinite(x))) throw new NetworkError('Write a room as room "Office" x y width depth, in metres.', line);
        const [x, y, rw, rh] = nums;
        floor.rooms.push({ label, x, y, w: rw, h: rh, line });
        if (x + rw > floor.w + 1e-9 || y + rh > floor.h + 1e-9) warnings.push({ message: `${label} goes past the edge of ${floor.label}.`, line });
        continue;
      }
      const d = device(w[0] ?? "", line);
      const [x, y] = w.slice(1, 3).map(Number);
      if (w.length < 3 || !Number.isFinite(x) || !Number.isFinite(y)) throw new NetworkError(`Place a device with its position in metres: ${w[0]} 3 4`, line);
      if (x < 0 || y < 0 || x > floor.w || y > floor.h) warnings.push({ message: `${d.label} is outside ${floor.label}.`, line });
      floor.places.push({ device: d, x, y, line });
    }
  }
  return phys;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

const n = (v: number) => Math.round(v * 10) / 10;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const FONT = 'font-family="Helvetica, Arial, sans-serif"';
const U = 18;

interface Colours {
  ink: string;
  muted: string;
  paper: string;
  rack: string;
  rail: string;
  room: string;
  cable: string;
}

function drawRack(r: Rack, c: Colours): { svg: string; w: number; h: number } {
  const width = 260;
  const rail = 28;
  const top = 28;
  const h = r.units * U;
  const out: string[] = [];
  out.push(`<text x="0" y="16" ${FONT} font-size="14" font-weight="700" fill="${c.ink}">${esc(r.label)}</text>`);
  out.push(`<rect x="0" y="${top}" width="${width}" height="${h + 16}" rx="4" fill="${c.rack}" stroke="${c.ink}" stroke-width="1.4"/>`);
  out.push(`<rect x="${rail}" y="${top + 8}" width="${width - rail * 2}" height="${h}" fill="${c.paper}" stroke="${c.rail}"/>`);
  // Unit numbers count up from the bottom.
  for (let u = 1; u <= r.units; u++) {
    const y = top + 8 + h - u * U;
    out.push(`<text x="${rail - 6}" y="${y + 12.5}" text-anchor="end" ${FONT} font-size="9" fill="${c.muted}">${u}</text>`);
    out.push(`<path d="M${rail} ${y}H${width - rail}" stroke="${c.rail}" stroke-width="0.5"/>`);
  }
  for (const it of r.items) {
    const y = top + 8 + h - it.to * U;
    const ih = (it.to - it.from + 1) * U;
    const colour = it.device ? KIND_COLOUR[it.device.kind] : c.muted;
    const kind = it.device ? KIND_LABEL[it.device.kind] : "";
    out.push(
      `<g data-source-line="${it.line - 1}"${it.device ? ` data-qualified-name="${esc(it.device.id)}"` : ""}>`,
      `<rect x="${rail + 2}" y="${y + 1.5}" width="${width - rail * 2 - 4}" height="${ih - 3}" rx="2" fill="${colour}" fill-opacity="${it.part === "blank" ? 0.08 : 0.2}" stroke="${colour}" stroke-width="1.2"/>`,
      `<rect x="${rail + 2}" y="${y + 1.5}" width="5" height="${ih - 3}" fill="${colour}"/>`,
      `<text x="${rail + 14}" y="${n(y + ih / 2 + 4.5)}" ${FONT} font-size="12" font-weight="600" fill="${c.ink}">${esc(it.label)}</text>`,
      kind && ih >= U ? `<text x="${width - rail - 8}" y="${n(y + ih / 2 + 4)}" text-anchor="end" ${FONT} font-size="10" fill="${c.muted}">${esc(kind)}</text>` : "",
      "</g>",
    );
  }
  return { svg: `<g data-source-line="${r.line - 1}">${out.join("")}</g>`, w: width, h: top + h + 16 };
}

function drawFloor(f: Floor, net: Network, c: Colours): { svg: string; w: number; h: number } {
  // Scale so the floor is about 640 px wide, within limits.
  const scale = Math.max(14, Math.min(48, 640 / Math.max(f.w, 1)));
  const top = 28;
  const W = f.w * scale;
  const H = f.h * scale;
  const out: string[] = [];
  out.push(`<text x="0" y="16" ${FONT} font-size="14" font-weight="700" fill="${c.ink}">${esc(f.label)}<tspan font-weight="400" fill="${c.muted}" font-size="12">  ${f.w} m × ${f.h} m</tspan></text>`);
  out.push(`<g transform="translate(0 ${top})">`);
  out.push(`<rect x="0" y="0" width="${n(W)}" height="${n(H)}" fill="${c.paper}" stroke="${c.ink}" stroke-width="2.5"/>`);
  // A metre grid.
  for (let x = 1; x < f.w; x++) out.push(`<path d="M${n(x * scale)} 0V${n(H)}" stroke="${c.rail}" stroke-width="0.4"/>`);
  for (let y = 1; y < f.h; y++) out.push(`<path d="M0 ${n(y * scale)}H${n(W)}" stroke="${c.rail}" stroke-width="0.4"/>`);
  for (const r of f.rooms) {
    out.push(
      `<g data-source-line="${r.line - 1}"><rect x="${n(r.x * scale)}" y="${n(r.y * scale)}" width="${n(r.w * scale)}" height="${n(r.h * scale)}" fill="${c.room}" stroke="${c.ink}" stroke-width="1.6"/>`,
      `<text x="${n(r.x * scale + 8)}" y="${n(r.y * scale + 18)}" ${FONT} font-size="12" font-weight="700" fill="${c.muted}">${esc(r.label)}</text></g>`,
    );
  }
  // Cables between devices placed on this floor, along the walls' directions.
  const at = new Map(f.places.map((p) => [p.device, p]));
  const labels: string[] = [];
  for (const l of net.links) {
    const a = at.get(l.from);
    const b = at.get(l.to);
    if (!a || !b) continue;
    const ax = a.x * scale;
    const ay = a.y * scale;
    const bx = b.x * scale;
    const by = b.y * scale;
    const wireless = l.style === "wireless";
    const metres = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const d = wireless ? `M${n(ax)} ${n(ay)}L${n(bx)} ${n(by)}` : `M${n(ax)} ${n(ay)}H${n(bx)}V${n(by)}`;
    out.push(`<path data-source-line="${l.line - 1}" d="${d}" fill="none" stroke="${l.style === "trunk" ? c.ink : c.cable}" stroke-width="${l.style === "trunk" ? 2.4 : 1.6}"${wireless ? ' stroke-dasharray="2 4"' : ""}/>`);
    if (!wireless && metres > 0) {
      // On the middle of the longer leg of the run.
      const across = Math.abs(bx - ax) >= Math.abs(by - ay);
      const lx = across ? (ax + bx) / 2 : bx + 6;
      const ly = across ? ay - 5 : (ay + by) / 2 + 3;
      labels.push(`<text x="${n(lx)}" y="${n(ly)}"${across ? ' text-anchor="middle"' : ""} ${FONT} font-size="10" fill="${c.muted}" stroke="${c.paper}" stroke-width="3" paint-order="stroke">≈${Math.round(metres * 10) / 10} m</text>`);
    }
  }
  out.push(...labels);
  for (const p of f.places) {
    const x = p.x * scale;
    const y = p.y * scale;
    const colour = KIND_COLOUR[p.device.kind];
    out.push(
      `<g data-source-line="${p.line - 1}" data-qualified-name="${esc(p.device.id)}">`,
      `<circle cx="${n(x)}" cy="${n(y)}" r="9" fill="${colour}" stroke="${c.paper}" stroke-width="2"/>`,
      `<text x="${n(x)}" y="${n(y + 24)}" text-anchor="middle" ${FONT} font-size="11" font-weight="600" fill="${c.ink}" stroke="${c.paper}" stroke-width="3" paint-order="stroke">${esc(p.device.label)}</text>`,
      "</g>",
    );
  }
  out.push("</g>");
  return { svg: `<g data-source-line="${f.line - 1}">${out.join("")}</g>`, w: Math.max(W, 200), h: top + H + 30 };
}

/** The physical views side by side: racks first, then floors. */
export function drawPhysical(phys: Physical, net: Network, dark: boolean): { svg: string; w: number; h: number } {
  const c: Colours = {
    ink: dark ? "#ebe9e4" : "#1d1d1b",
    muted: dark ? "#a8a59e" : "#6b6862",
    paper: dark ? "#232321" : "#ffffff",
    rack: dark ? "#2e2d2a" : "#ecebe6",
    rail: dark ? "#45443f" : "#d4d1c8",
    room: dark ? "#2a2f38" : "#f3f6fb",
    cable: dark ? "#8fb1f0" : "#3b6fd8",
  };
  const parts = [...phys.racks.map((r) => drawRack(r, c)), ...phys.floors.map((f) => drawFloor(f, net, c))];
  let x = 0;
  const out: string[] = [];
  let h = 0;
  for (const p of parts) {
    out.push(`<g transform="translate(${n(x)} 0)">${p.svg}</g>`);
    x += p.w + 48;
    h = Math.max(h, p.h);
  }
  return { svg: out.join(""), w: Math.max(0, x - 48), h };
}
