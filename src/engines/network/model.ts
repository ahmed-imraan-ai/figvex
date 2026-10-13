// The network format. Devices sit in zones (subnets, VLANs or sites) by
// indentation, and links join them.
//
//   network
//   title "Small office"
//   internet
//   router edge "Edge router" 203.0.113.2/30 192.168.1.1
//   zone lan "Office LAN" 192.168.1.0/24 vlan 10
//     switch sw1 "Core switch" 192.168.1.2
//     pc desks "Desk PCs" x12
//   internet -- edge "100 Mbps"
//   edge:ge0 == sw1:ge1 "trunk" vlan 10, 20
//   sw1 -- desks
//
// Links: -- cable, == trunk or fibre, .. VPN or tunnel, ~~ wireless.
// Settings: title, direction down|right, lines straight|curved|square,
// checks on|off. "#" starts a comment.

import { contains, formatAddress, lastOf, looksLikeAddress, networkOf, overlaps, parseAddress, subnetText, type Address } from "./address";

export const DEVICE_KINDS = [
  "internet", "cloud", "router", "firewall", "switch", "lb", "ap", "server", "vm",
  "database", "storage", "pc", "laptop", "phone", "printer", "camera", "iot", "user",
] as const;

export type DeviceKind = (typeof DEVICE_KINDS)[number];

export const KIND_LABEL: Record<DeviceKind, string> = {
  internet: "Internet",
  cloud: "Cloud",
  router: "Router",
  firewall: "Firewall",
  switch: "Switch",
  lb: "Load balancer",
  ap: "Wi-Fi access point",
  server: "Server",
  vm: "Virtual machine",
  database: "Database",
  storage: "Storage",
  pc: "PC",
  laptop: "Laptop",
  phone: "Phone",
  printer: "Printer",
  camera: "Camera",
  iot: "IoT device",
  user: "User",
};

/** Kinds whose name is optional, as there's usually only one. */
const NAMELESS: DeviceKind[] = ["internet", "cloud"];

export type LinkStyle = "cable" | "trunk" | "vpn" | "wireless";

const LINK_OPS: Record<string, LinkStyle> = { "--": "cable", "==": "trunk", "..": "vpn", "~~": "wireless" };

export interface Device {
  id: string;
  kind: DeviceKind;
  label: string;
  note?: string;
  addresses: Address[];
  vlan?: number;
  /** Shown as a stack, e.g. "x12" for twelve desk PCs. */
  count?: number;
  zone?: Zone;
  /** 1-based source line. */
  line: number;
}

export interface Zone {
  id: string;
  label: string;
  subnets: Address[];
  vlan?: number;
  parent?: Zone;
  zones: Zone[];
  devices: Device[];
  line: number;
}

export interface Link {
  from: Device;
  to: Device;
  fromPort?: string;
  toPort?: string;
  style: LinkStyle;
  label: string;
  vlans: number[];
  line: number;
}

export interface Network {
  title?: string;
  direction: "down" | "right";
  lines: "straight" | "curved" | "square";
  checks: boolean;
  /** Top-level zones. */
  zones: Zone[];
  /** Every zone, in source order. */
  allZones: Zone[];
  /** Every device, in source order. */
  devices: Device[];
  links: Link[];
}

export interface NetworkWarning {
  message: string;
  line: number;
}

export class NetworkError extends Error {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(message);
  }
}

const ID = /^[A-Za-z_][\w-]*$/;
const LINK = /^(\S+?)\s*(--|==|\.\.|~~)\s*(.+)$/;

/** Words and "quoted strings", with the quotes kept. */
function tokenize(text: string, line: number): string[] {
  const out: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[2]?.startsWith('"')) throw new NetworkError("A quote is missing its closing quote.", line);
    out.push(m[0]);
  }
  return out;
}

const unquote = (s: string) => s.slice(1, -1).replace(/\\(.)/g, "$1");
const quoted = (s: string) => s.startsWith('"');

/** Strips a "#" comment that sits outside quotes. */
function stripComment(raw: string): string {
  let inQuote = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "\\" && inQuote) i++;
    else if (c === '"') inQuote = !inQuote;
    else if (c === "#" && !inQuote && (i === 0 || /\s/.test(raw[i - 1]))) return raw.slice(0, i);
  }
  return raw;
}

function indentOf(raw: string): number {
  let n = 0;
  for (const c of raw) {
    if (c === " ") n++;
    else if (c === "\t") n += 2;
    else break;
  }
  return n;
}

function parseVlan(word: string | undefined, line: number): number {
  const n = Number(word);
  if (!word || !/^\d+$/.test(word) || n < 1 || n > 4094) {
    throw new NetworkError(word ? `VLAN ${word} isn't valid. VLAN IDs go from 1 to 4094.` : 'Put the VLAN number after "vlan", like vlan 10.', line);
  }
  return n;
}

function address(word: string, line: number): Address {
  const a = parseAddress(word);
  if (typeof a === "string") throw new NetworkError(a, line);
  return a;
}

export function parseNetwork(code: string): Network {
  const net: Network = { direction: "down", lines: "straight", checks: true, zones: [], allZones: [], devices: [], links: [] };
  const lines = code.split(/\r\n|\r|\n/);
  let header = false;
  /** Open zones by indent. */
  const stack: [number, Zone][] = [];
  const byId = new Map<string, Device>();
  const zoneIds = new Set<string>();
  const pending: { from: string; to: string[]; op: string; rest: string[]; line: number }[] = [];

  lines.forEach((raw, index) => {
    const line = index + 1;
    const text = stripComment(raw).trim();
    if (!text) return;
    if (!header) {
      if (text !== "network") throw new NetworkError('A network diagram starts with the word "network" on its own line.', line);
      header = true;
      return;
    }
    const indent = indentOf(raw);

    const link = text.match(LINK);
    if (link && !quoted(link[1])) {
      const [, from, op, rest] = link;
      const words = tokenize(rest, line);
      // Targets run up to the first label or "vlan": "a -- b, c "uplink"".
      const to: string[] = [];
      let i = 0;
      for (; i < words.length && !quoted(words[i]) && words[i] !== "vlan"; i++) {
        to.push(...words[i].split(",").filter(Boolean));
      }
      if (!to.length) throw new NetworkError(`Say what ${from} links to, like ${from} ${op} switch1.`, line);
      pending.push({ from, to, op, rest: words.slice(i), line });
      return;
    }

    const words = tokenize(text, line);
    const [first] = words;

    if (indent === 0 && ["title", "direction", "lines", "checks"].includes(first) && !byId.has(first)) {
      const value = words[1];
      if (first === "title") {
        if (!value || !quoted(value) || words.length > 2) throw new NetworkError('Write the title in quotes, like title "Head office".', line);
        net.title = unquote(value);
      } else if (first === "direction") {
        if (value !== "down" && value !== "right") throw new NetworkError('direction is "down" or "right".', line);
        net.direction = value;
      } else if (first === "lines") {
        if (value !== "straight" && value !== "curved" && value !== "square") throw new NetworkError('lines is "straight", "curved" or "square".', line);
        net.lines = value;
      } else {
        if (value !== "on" && value !== "off") throw new NetworkError('checks is "on" or "off".', line);
        net.checks = value === "on";
      }
      return;
    }

    while (stack.length && stack[stack.length - 1][0] >= indent) stack.pop();
    const parent = stack[stack.length - 1]?.[1];

    if (first === "zone") {
      let i = 1;
      let id = `zone-${line}`;
      if (words[1] && !quoted(words[1]) && !looksLikeAddress(words[1]) && words[1] !== "vlan") {
        if (!ID.test(words[1])) throw new NetworkError(`"${words[1]}" can't be a zone name. Use letters, digits, - and _.`, line);
        id = words[1];
        i = 2;
      }
      if (zoneIds.has(id)) throw new NetworkError(`There are two zones called "${id}".`, line);
      zoneIds.add(id);
      const zone: Zone = { id, label: "", subnets: [], parent, zones: [], devices: [], line };
      for (; i < words.length; i++) {
        const w = words[i];
        if (quoted(w) && !zone.label) zone.label = unquote(w);
        else if (looksLikeAddress(w)) {
          const a = address(w, line);
          if (a.prefix === undefined) throw new NetworkError(`Write the zone's subnet with a prefix, like ${w}/24.`, line);
          zone.subnets.push(a);
        } else if (w === "vlan") zone.vlan = parseVlan(words[++i], line);
        else throw new NetworkError(`"${w.replace(/^"|"$/g, "")}" isn't part of a zone line. A zone takes a name, a "label", subnets and vlan N.`, line);
      }
      if (!zone.label) zone.label = id.startsWith("zone-") ? (zone.vlan ? `VLAN ${zone.vlan}` : "Zone") : id;
      (parent ? parent.zones : net.zones).push(zone);
      net.allZones.push(zone);
      stack.push([indent, zone]);
      return;
    }

    if (!(DEVICE_KINDS as readonly string[]).includes(first)) {
      const near = DEVICE_KINDS.find((k) => k.startsWith(first.toLowerCase().slice(0, 3)));
      throw new NetworkError(
        `"${first}" isn't a device type${near ? ` (did you mean ${near}?)` : ""}. Lines start with a device type such as router, switch, server or pc, with zone, or are links like a -- b.`,
        line,
      );
    }
    const kind = first as DeviceKind;
    let i = 1;
    let id: string;
    if (words[1] && !quoted(words[1]) && !looksLikeAddress(words[1]) && words[1] !== "vlan" && !/^x\d+$/.test(words[1])) {
      if (!ID.test(words[1])) throw new NetworkError(`"${words[1]}" can't be a device name. Use letters, digits, - and _, starting with a letter.`, line);
      id = words[1];
      i = 2;
    } else if (NAMELESS.includes(kind)) id = kind;
    else throw new NetworkError(`Give the ${KIND_LABEL[kind].toLowerCase()} a short name to link it by, like ${kind} ${kind}1 "${KIND_LABEL[kind]}".`, line);
    if (byId.has(id)) throw new NetworkError(`There are two devices called "${id}". Each needs its own name.`, line);

    const device: Device = { id, kind, label: "", addresses: [], zone: parent, line };
    let labelled = false;
    for (; i < words.length; i++) {
      const w = words[i];
      if (quoted(w)) {
        if (!labelled) {
          device.label = unquote(w);
          labelled = true;
        } else if (device.note === undefined) device.note = unquote(w);
        else throw new NetworkError("A device takes a label and one note. Put the rest in the note.", line);
      } else if (looksLikeAddress(w)) device.addresses.push(address(w, line));
      else if (w === "vlan") device.vlan = parseVlan(words[++i], line);
      else if (/^x\d+$/.test(w)) {
        device.count = Number(w.slice(1));
        if (device.count < 1) throw new NetworkError("A count is x2 or more.", line);
      } else {
        throw new NetworkError(`"${w}" isn't part of a device line. After the name come a "label", a "note", addresses, vlan N and a count like x12.`, line);
      }
    }
    if (!labelled) device.label = NAMELESS.includes(kind) && id === kind ? KIND_LABEL[kind] : id;
    byId.set(id, device);
    net.devices.push(device);
    parent?.devices.push(device);
  });

  if (!header) throw new NetworkError('A network diagram starts with the word "network" on its own line.', 1);
  if (!net.devices.length) throw new NetworkError('Add a device under the network line, for example: router r1 "Edge router"', lines.length);

  const end = (ref: string, line: number): { device: Device; port?: string } => {
    const colon = ref.indexOf(":");
    const id = colon < 0 ? ref : ref.slice(0, colon);
    const port = colon < 0 ? undefined : ref.slice(colon + 1) || undefined;
    const device = byId.get(id);
    if (!device) {
      throw new NetworkError(zoneIds.has(id) ? `"${id}" is a zone. Links join devices.` : `There's no device called "${id}".`, line);
    }
    return { device, port };
  };
  for (const p of pending) {
    const a = end(p.from, p.line);
    let label = "";
    const vlans: number[] = [];
    for (let i = 0; i < p.rest.length; i++) {
      const w = p.rest[i];
      if (quoted(w) && !label) label = unquote(w);
      else if (w === "vlan") {
        // vlan 10, 20 or vlan 10,20
        const list: string[] = [];
        while (i + 1 < p.rest.length && /^[\d,]+$/.test(p.rest[i + 1])) list.push(...p.rest[++i].split(",").filter(Boolean));
        if (!list.length) parseVlan(undefined, p.line);
        vlans.push(...list.map((v) => parseVlan(v, p.line)));
      } else throw new NetworkError(`"${w}" isn't part of a link. A link takes a "label" and vlan N after the devices.`, p.line);
    }
    for (const target of p.to) {
      const b = end(target, p.line);
      if (a.device === b.device) throw new NetworkError(`${a.device.id} is linked to itself.`, p.line);
      net.links.push({ from: a.device, to: b.device, fromPort: a.port, toPort: b.port, style: LINK_OPS[p.op], label, vlans, line: p.line });
    }
  }
  return net;
}

/** The nearest zone, from the device's own outwards, matching a test. */
function nearest(zone: Zone | undefined, test: (z: Zone) => boolean): Zone | undefined {
  for (let z = zone; z; z = z.parent) if (test(z)) return z;
  return undefined;
}

function isAncestor(a: Zone, b: Zone): boolean {
  for (let z = b.parent; z; z = z.parent) if (z === a) return true;
  return false;
}

const show = (a: Address) => formatAddress(a.value, a.family);

/** Address and VLAN mistakes worth a look. They don't stop the drawing. */
export function checkNetwork(net: Network): NetworkWarning[] {
  const out: NetworkWarning[] = [];
  const warn = (message: string, line: number) => out.push({ message, line });

  for (const zone of net.allZones) {
    for (const s of zone.subnets) {
      if (networkOf(s.value, s.family, s.prefix!) !== s.value) {
        warn(`${zone.label}: ${s.text} has host bits set. The subnet is ${subnetText(s)}.`, zone.line);
      }
      const outer = nearest(zone.parent, (z) => z.subnets.some((p) => p.family === s.family));
      if (outer && !outer.subnets.some((p) => p.family === s.family && contains(p, s) && p.prefix! <= s.prefix!)) {
        warn(`${zone.label}'s subnet ${s.text} isn't inside ${outer.label} (${outer.subnets.filter((p) => p.family === s.family).map((p) => p.text).join(", ")}).`, zone.line);
      }
    }
  }

  // Overlapping subnets in zones that aren't nested in each other.
  for (let i = 0; i < net.allZones.length; i++) {
    for (let j = i + 1; j < net.allZones.length; j++) {
      const [a, b] = [net.allZones[i], net.allZones[j]];
      if (isAncestor(a, b) || isAncestor(b, a)) continue;
      for (const sa of a.subnets) {
        const sb = b.subnets.find((s) => overlaps(sa, s));
        if (sb) warn(`${b.label} (${sb.text}) overlaps ${a.label} (${sa.text}).`, b.line);
      }
    }
  }

  // VLAN numbers only need to be unique within a site: a zone with no
  // subnet and no VLAN of its own.
  const siteOf = (z: Zone) => nearest(z.parent, (p) => !p.subnets.length && p.vlan === undefined);
  const vlanZone = new Map<string, Zone>();
  for (const zone of net.allZones) {
    if (zone.vlan === undefined) continue;
    const key = `${net.allZones.indexOf(siteOf(zone)!)}:${zone.vlan}`;
    const other = vlanZone.get(key);
    if (other) warn(`VLAN ${zone.vlan} is used by both ${other.label} and ${zone.label}.`, zone.line);
    else vlanZone.set(key, zone);
  }

  const seen = new Map<bigint, Device>();
  for (const d of net.devices) {
    for (const family of [4, 6] as const) {
      const mine = d.addresses.filter((a) => a.family === family);
      const zone = nearest(d.zone, (z) => z.subnets.some((s) => s.family === family));
      if (!mine.length || !zone) continue;
      const subnets = zone.subnets.filter((s) => s.family === family);
      if (!mine.some((a) => subnets.some((s) => contains(s, a)))) {
        warn(`${d.id}: ${mine.map(show).join(", ")} isn't in ${zone.label} (${subnets.map((s) => s.text).join(", ")}).`, d.line);
      }
      for (const a of mine) {
        const s = subnets.find((x) => contains(x, a));
        if (!s) continue;
        if (a.prefix !== undefined && a.prefix !== s.prefix) warn(`${d.id}: ${a.text} has a /${a.prefix} prefix, but ${zone.label} is ${s.text}.`, d.line);
        if (family === 4 && s.prefix! <= 30) {
          if (a.value === networkOf(s.value, 4, s.prefix!)) warn(`${d.id}: ${show(a)} is the network address of ${subnetText(s)}, not one a device can use.`, d.line);
          else if (a.value === lastOf(s)) warn(`${d.id}: ${show(a)} is the broadcast address of ${subnetText(s)}, not one a device can use.`, d.line);
        }
      }
    }
    // A device with a prefix of its own and no zone still gets the
    // network and broadcast checks.
    for (const a of d.addresses) {
      if (a.family !== 4 || a.prefix === undefined || a.prefix > 30 || nearest(d.zone, (z) => z.subnets.some((s) => contains(s, a)))) continue;
      if (a.value === networkOf(a.value, 4, a.prefix)) warn(`${d.id}: ${show(a)} is the network address of ${subnetText(a)}, not one a device can use.`, d.line);
      else if (a.value === lastOf(a)) warn(`${d.id}: ${show(a)} is the broadcast address of ${subnetText(a)}, not one a device can use.`, d.line);
    }
    for (const a of d.addresses) {
      const key = (a.value << 1n) | (a.family === 6 ? 1n : 0n);
      const other = seen.get(key);
      if (other && other !== d) warn(`${show(a)} is used by both ${other.id} and ${d.id}.`, d.line);
      else seen.set(key, d);
    }
    if (d.vlan !== undefined) {
      const zone = nearest(d.zone, (z) => z.vlan !== undefined);
      if (zone && zone.vlan !== d.vlan) warn(`${d.id} is on VLAN ${d.vlan}, but ${zone.label} is VLAN ${zone.vlan}.`, d.line);
    }
  }

  if (net.links.length) {
    const linked = new Set(net.links.flatMap((l) => [l.from, l.to]));
    for (const d of net.devices) if (!linked.has(d)) warn(`${d.id} isn't linked to anything.`, d.line);
  }
  return out.sort((a, b) => a.line - b.line);
}
