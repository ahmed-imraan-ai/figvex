// Turns a device list (CSV with a header row) into a network diagram, so an
// inventory spreadsheet becomes a starting point. Columns are matched by
// name; only a name column is required:
//
//   name,type,ip,zone,subnet,uplink
//   core,switch,10.0.0.2,Office,10.0.0.0/24,fw
//   fw,firewall,10.0.0.1,,,

import { DEVICE_KINDS, type DeviceKind } from "./model";

const COLUMNS: Record<string, RegExp> = {
  name: /^(name|hostname|host|device|device name)$/i,
  type: /^(type|kind|role|device type|category)$/i,
  ip: /^(ip|ip address|address|ipv4|ipv6)$/i,
  zone: /^(zone|vlan name|location|site|room|segment|network)$/i,
  subnet: /^(subnet|network address|cidr)$/i,
  vlan: /^(vlan|vlan id)$/i,
  uplink: /^(uplink|link|connected to|connects to|parent|switch|upstream)$/i,
  label: /^(label|description|display name)$/i,
};

/** Words people use for each kind of device. */
const KIND_WORDS: [RegExp, DeviceKind][] = [
  [/firewall|fw|utm/i, "firewall"],
  [/router|gateway|gw|edge/i, "router"],
  [/switch|sw\b/i, "switch"],
  [/access point|wireless|wap|\bap\b|wifi|wi-fi/i, "ap"],
  [/load ?balancer|\blb\b|haproxy/i, "lb"],
  [/database|\bdb\b|sql/i, "database"],
  [/nas|san|storage|backup/i, "storage"],
  [/\bvm\b|virtual/i, "vm"],
  [/server|host|srv/i, "server"],
  [/laptop|notebook/i, "laptop"],
  [/printer|mfp/i, "printer"],
  [/camera|cctv/i, "camera"],
  [/phone|voip|mobile/i, "phone"],
  [/iot|sensor|tv|thermostat/i, "iot"],
  [/internet|isp|wan/i, "internet"],
  [/cloud|aws|azure|gcp/i, "cloud"],
  [/pc|desktop|workstation|computer|client/i, "pc"],
];

export function kindOf(type: string): DeviceKind {
  // Numbers and separators don't change the kind: ap1, fw-01, sw_2.
  const t = type.toLowerCase().replace(/[-_\d.]+/g, " ").trim();
  if ((DEVICE_KINDS as readonly string[]).includes(t)) return t as DeviceKind;
  return KIND_WORDS.find(([re]) => re.test(t))?.[1] ?? "server";
}

/** Rows of a CSV or TSV, with quoted fields. */
function rows(text: string): string[][] {
  const sep = text.split("\n")[0].includes("\t") ? "\t" : ",";
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(field.trim());
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim());
      if (row.some(Boolean)) out.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field.trim());
  if (row.some(Boolean)) out.push(row);
  return out;
}

/** Whether a CSV's header looks like a device list rather than chart data. */
export function isDeviceList(text: string): boolean {
  const header = rows(text.replace(/^﻿/, "").split(/\r?\n/)[0] ?? "")[0] ?? [];
  const has = (k: string) => header.some((h) => COLUMNS[k].test(h));
  return has("name") && (has("type") || has("ip") || has("uplink"));
}

const ID = /^[A-Za-z_][\w-]*$/;
const quote = (s: string) => `"${s.replace(/"/g, "'")}"`;

/** The network text for a device list. */
export function networkFromCsv(text: string, title?: string): string {
  const [header, ...data] = rows(text.replace(/^﻿/, ""));
  const col = (k: string) => header.findIndex((h) => COLUMNS[k].test(h));
  const c = Object.fromEntries(Object.keys(COLUMNS).map((k) => [k, col(k)])) as Record<string, number>;
  const get = (r: string[], k: string) => (c[k] >= 0 ? (r[c[k]] ?? "").trim() : "");

  // Device names become ids: letters, digits, - and _.
  const ids = new Map<string, string>();
  const used = new Set<string>();
  const idFor = (name: string) => {
    if (ids.has(name)) return ids.get(name)!;
    let base = name.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "") || "device";
    if (!/^[A-Za-z_]/.test(base)) base = `d-${base}`;
    let id = base;
    for (let i = 2; used.has(id.toLowerCase()) || (DEVICE_KINDS as readonly string[]).includes(id); i++) id = `${base}-${i}`;
    used.add(id.toLowerCase());
    ids.set(name, id);
    return id;
  };

  const zones = new Map<string, { subnet?: string; vlan?: string; lines: string[] }>();
  const top: string[] = [];
  const links: string[] = [];
  for (const r of data) {
    const name = get(r, "name");
    if (!name) continue;
    const id = idFor(name);
    const kind = kindOf(get(r, "type") || name);
    const label = get(r, "label") || name;
    const ip = get(r, "ip");
    const parts = [kind, id];
    if (label !== id) parts.push(quote(label));
    if (ip && /^[\d.:a-fA-F/]+$/.test(ip)) parts.push(ip);
    const zone = get(r, "zone");
    if (zone) {
      if (!zones.has(zone)) zones.set(zone, { lines: [] });
      const z = zones.get(zone)!;
      z.subnet ||= get(r, "subnet") || undefined;
      z.vlan ||= get(r, "vlan") || undefined;
      z.lines.push(`  ${parts.join(" ")}`);
    } else top.push(parts.join(" "));
    const up = get(r, "uplink");
    if (up) for (const u of up.split(/[;|]/).map((s) => s.trim()).filter(Boolean)) links.push(`${idFor(u)} -- ${id}`);
  }
  // Uplinks to names that aren't rows in the list.
  const declared = new Set(data.map((r) => get(r, "name")).filter(Boolean).map(idFor));
  for (const [name, id] of ids) if (!declared.has(id)) top.push(`${kindOf(name)} ${id}${name !== id ? ` ${quote(name)}` : ""}`);

  const out = ["network", ...(title ? [`title ${quote(title)}`] : []), "# Made from a device list. Check the device types, then tidy up.", ...top];
  let i = 0;
  for (const [name, z] of zones) {
    const zid = name.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "") || `zone${++i}`;
    const safe = ID.test(zid) && !used.has(zid.toLowerCase()) ? zid : `zone-${zid}`;
    const subnet = z.subnet && /\/\d+$/.test(z.subnet) ? ` ${z.subnet}` : "";
    const vlan = z.vlan && /^\d+$/.test(z.vlan) ? ` vlan ${z.vlan}` : "";
    out.push(`zone ${safe} ${quote(name)}${subnet}${vlan}`, ...z.lines);
  }
  out.push(...links);
  return `${out.join("\n")}\n`;
}
