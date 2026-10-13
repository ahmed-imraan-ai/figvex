// Editing a network's text from the diagram: rename a device, zone or
// link, add a device linked to another, or remove a device or link. Each
// returns the new text, changing only the lines involved.

import { DEVICE_KINDS, KIND_LABEL, type DeviceKind } from "./model";

export type NetLineKind = "device" | "zone" | "link";

const LINK = /^(\s*)(\S+?)\s*(--|==|\.\.|~~)\s*(.+)$/;
const split = (code: string) => code.split(/\r?\n/);
const eol = (code: string) => (code.includes("\r\n") ? "\r\n" : "\n");
const quote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const unquote = (s: string) => s.slice(1, -1).replace(/\\(.)/g, "$1");

/** The line without a trailing "# comment" (outside quotes), and the comment. */
function splitComment(raw: string): [string, string] {
  let inQuote = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "\\" && inQuote) i++;
    else if (c === '"') inQuote = !inQuote;
    else if (c === "#" && !inQuote && (i === 0 || /\s/.test(raw[i - 1]))) {
      const cut = raw.slice(0, i).replace(/\s+$/, "");
      return [cut, raw.slice(cut.length)];
    }
  }
  return [raw, ""];
}

/** Words with their offsets; quoted strings are one word. */
function words(text: string): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  const re = /"(?:[^"\\]|\\.)*"?|\S+/g;
  for (let m = re.exec(text); m; m = re.exec(text)) out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

/** What kind of line this is, for choosing what the diagram can do with it. */
export function lineKind(raw: string): NetLineKind | null {
  const [text] = splitComment(raw);
  const first = text.trim().split(/\s+/)[0];
  if (!first) return null;
  // Links first: "internet -- fw" starts with a device type too.
  const m = text.match(LINK);
  if (m && !m[2].startsWith('"')) return "link";
  if (first === "zone") return "zone";
  return (DEVICE_KINDS as readonly string[]).includes(first) ? "device" : null;
}

/** The label shown for a line: its first quoted word. */
export function labelOf(code: string, line: number): string {
  const [text] = splitComment(split(code)[line - 1] ?? "");
  const q = words(text).find((w) => w.text.startsWith('"'));
  if (q) return unquote(q.text);
  const ws = words(text);
  return lineKind(text) === "device" ? (ws[1]?.text ?? ws[0]?.text ?? "") : "";
}

/** Sets the label on a device, zone or link line, adding one if there's none. */
export function setLabel(code: string, line: number, label: string): string {
  const lines = split(code);
  const raw = lines[line - 1];
  if (raw === undefined) return code;
  const kind = lineKind(raw);
  if (!kind) return code;
  const [text, comment] = splitComment(raw);
  const ws = words(text);
  const q = ws.find((w) => w.text.startsWith('"'));
  let next: string;
  if (q) {
    next = text.slice(0, q.start) + quote(label) + text.slice(q.end);
  } else if (kind === "link") {
    // After the devices, before any "vlan".
    const vlan = ws.find((w) => w.text === "vlan");
    next = vlan ? `${text.slice(0, vlan.start)}${quote(label)} ${text.slice(vlan.start)}` : `${text} ${quote(label)}`;
  } else {
    // After "type name" (or "zone name"), or after the type for a nameless one.
    const named = ws[1] && /^[A-Za-z_][\w-]*$/.test(ws[1].text) && ws[1].text !== "vlan";
    const after = named ? ws[1] : ws[0];
    next = `${text.slice(0, after.end)} ${quote(label)}${text.slice(after.end)}`;
  }
  lines[line - 1] = next + comment;
  return lines.join(eol(code));
}

/** The device kind a new linked device gets, given the one it hangs off. */
function childKind(kind: DeviceKind): DeviceKind {
  const next: Partial<Record<DeviceKind, DeviceKind>> = {
    internet: "router",
    cloud: "router",
    router: "switch",
    firewall: "switch",
    switch: "pc",
    lb: "server",
    ap: "laptop",
  };
  return next[kind] ?? kind;
}

/**
 * Adds a device after the one on `line` (so it lands in the same zone) and a
 * link to it. Returns the new text and the new device's line.
 */
export function addLinkedDevice(code: string, line: number): { code: string; line: number } | null {
  const lines = split(code);
  const raw = lines[line - 1];
  if (raw === undefined || lineKind(raw) !== "device") return null;
  const ws = words(splitComment(raw)[0]);
  const kind = ws[0].text as DeviceKind;
  const id = ws[1] && /^[A-Za-z_][\w-]*$/.test(ws[1].text) && ws[1].text !== "vlan" ? ws[1].text : kind;
  const newKind = childKind(kind);
  const ids = new Set(lines.filter((l) => lineKind(l) === "device").map((l) => words(splitComment(l)[0])[1]?.text));
  let n = 1;
  while (ids.has(`${newKind}${n}`)) n++;
  const newId = `${newKind}${n}`;
  const indent = raw.match(/^[ \t]*/)![0];
  lines.splice(line, 0, `${indent}${newKind} ${newId} ${quote(KIND_LABEL[newKind])}`);
  // The link goes after the last link, or at the end.
  let last = -1;
  lines.forEach((l, i) => {
    if (lineKind(l) === "link") last = i;
  });
  const link = `${id} -- ${newId}`;
  if (last >= 0) lines.splice(last + 1, 0, link);
  else {
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    lines.push(link, "");
  }
  return { code: lines.join(eol(code)), line: line + 1 };
}

/** Removes the device on `line` and every link to or from it. */
export function removeDevice(code: string, line: number): string | null {
  const lines = split(code);
  const raw = lines[line - 1];
  if (raw === undefined || lineKind(raw) !== "device") return null;
  if (lines.filter((l) => lineKind(l) === "device").length < 2) return null;
  const ws = words(splitComment(raw)[0]);
  const id = ws[1] && /^[A-Za-z_][\w-]*$/.test(ws[1].text) && ws[1].text !== "vlan" ? ws[1].text : ws[0].text;
  const isMe = (end: string) => end.split(":")[0] === id;
  lines.splice(line - 1, 1);
  const out: string[] = [];
  for (const l of lines) {
    if (lineKind(l) !== "link") {
      out.push(l);
      continue;
    }
    const [text, comment] = splitComment(l);
    const m = text.match(LINK)!;
    const [, indent, from, op, rest] = m;
    if (isMe(from)) continue;
    // Targets run up to the first label or "vlan".
    const rw = words(rest);
    const stop = rw.findIndex((w) => w.text.startsWith('"') || w.text === "vlan");
    const targetText = stop < 0 ? rest : rest.slice(0, rw[stop].start);
    const tail = stop < 0 ? "" : rest.slice(rw[stop].start);
    const targets = targetText.split(",").map((t) => t.trim()).filter(Boolean);
    const left = targets.filter((t) => !isMe(t));
    if (!left.length) continue;
    if (left.length === targets.length) out.push(l);
    else out.push(`${indent}${from} ${op} ${left.join(", ")}${tail ? ` ${tail}` : ""}${comment}`);
  }
  return out.join(eol(code));
}

/** Removes the link line on `line`. */
export function removeLink(code: string, line: number): string | null {
  const lines = split(code);
  if (lineKind(lines[line - 1] ?? "") !== "link") return null;
  lines.splice(line - 1, 1);
  return lines.join(eol(code));
}
