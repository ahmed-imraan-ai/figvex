// Editing an org chart's text from the diagram: rename a person, add a
// report under them, or remove them. Each returns the new text, changing
// only the lines involved.

import { DOTTED, PERSON } from "./model";

interface PersonLine {
  indent: string;
  assistant: boolean;
  name: string;
  id?: string;
  title: string;
  dept?: string;
  comment: string;
}

const split = (code: string) => code.split(/\r?\n/);
const eol = (code: string) => (code.includes("\r\n") ? "\r\n" : "\n");
const width = (indent: string) => [...indent].reduce((n, c) => n + (c === "\t" ? 2 : 1), 0);

/** Reads a person line, or null if the line isn't one. */
export function readPerson(raw: string): PersonLine | null {
  const indent = raw.match(/^[ \t]*/)![0];
  const comment = raw.match(/\s+#\s.*$/)?.[0] ?? "";
  const text = raw.slice(indent.length, raw.length - comment.length).trim();
  if (!text || text.startsWith("#") || DOTTED.test(text) || /^(orgchart|title\s+"|direction\s|compact$|counts$)/.test(text)) return null;
  const m = text.match(PERSON);
  if (!m) return null;
  const [, plus, name, id, title = "", dept] = m;
  return { indent, assistant: !!plus, name: name.trim(), id, title: title.trim(), dept: dept?.trim(), comment };
}

function writePerson(p: PersonLine): string {
  return `${p.indent}${p.assistant ? "+ " : ""}${p.name}${p.id ? ` #${p.id}` : ""}${p.title ? `: ${p.title}` : ""}${p.dept ? ` [${p.dept}]` : ""}${p.comment}`;
}

/** What the rename box shows: "Name: Job title". */
export function personText(code: string, line: number): string | null {
  const p = readPerson(split(code)[line - 1] ?? "");
  return p ? `${p.name}${p.title ? `: ${p.title}` : ""}` : null;
}

/** Renames a person from "Name: Job title", keeping their id and department. */
export function renamePerson(code: string, line: number, text: string): string {
  const lines = split(code);
  const p = readPerson(lines[line - 1] ?? "");
  if (!p) return code;
  const colon = text.indexOf(":");
  const name = (colon < 0 ? text : text.slice(0, colon)).replace(/[#[\]:]/g, "").trim();
  const title = colon < 0 ? p.title : text.slice(colon + 1).replace(/[[\]]/g, "").trim();
  if (!name) return code;
  const oldName = p.name;
  lines[line - 1] = writePerson({ ...p, name, title });
  // Dotted lines that name this person (rather than their #id) follow along.
  if (!p.id && oldName !== "?" && oldName !== name) {
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const m = raw.trim().match(DOTTED);
      if (!m || raw.match(/^[ \t]+/)) continue;
      const [, a, b] = m;
      if (a.trim() !== oldName && b.trim() !== oldName) continue;
      const swap = (s: string) => (s.trim() === oldName ? name : s.trim());
      lines[i] = raw.replace(m[0], `${swap(a)} .. ${swap(b)}${m[3] !== undefined ? ` "${m[3]}"` : ""}`);
    }
  }
  return lines.join(eol(code));
}

/** Index just past a person's reports (lines indented further, and blanks between). */
function subtreeEnd(lines: string[], index: number): number {
  const own = width(lines[index].match(/^[ \t]*/)![0]);
  let end = index + 1;
  for (let i = index + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    if (width(raw.match(/^[ \t]*/)![0]) <= own) break;
    end = i + 1;
  }
  return end;
}

/** Adds "New person: Job title" as the last report of the person on `line`. */
export function addReport(code: string, line: number): { code: string; line: number } | null {
  const lines = split(code);
  const index = line - 1;
  const p = readPerson(lines[index] ?? "");
  if (!p || p.assistant) return null;
  const end = subtreeEnd(lines, index);
  // Match the indentation of existing reports, or add one step.
  const firstChild = lines.slice(index + 1, end).find((l) => l.trim() && !/^\s*#/.test(l));
  const step = p.indent.includes("\t") || (!p.indent && lines.some((l) => l.startsWith("\t"))) ? "\t" : "  ";
  const indent = firstChild ? firstChild.match(/^[ \t]*/)![0] : p.indent + step;
  const taken = new Set(lines.map((l) => readPerson(l)?.name));
  let name = "New person";
  for (let n = 2; taken.has(name); n++) name = `New person ${n}`;
  lines.splice(end, 0, `${indent}${name}: Job title`);
  return { code: lines.join(eol(code)), line: end + 1 };
}

/**
 * Removes the person on `line`. Their reports move up to their manager, and
 * dotted lines to or from them go too. Returns null for the only person.
 */
export function removePerson(code: string, line: number): string | null {
  const lines = split(code);
  const index = line - 1;
  const p = readPerson(lines[index] ?? "");
  if (!p) return null;
  if (lines.filter((l) => readPerson(l)).length < 2) return null;
  const end = subtreeEnd(lines, index);
  const firstChild = lines.slice(index + 1, end).find((l) => l.trim() && !/^\s*#/.test(l));
  if (firstChild) {
    const extra = firstChild.match(/^[ \t]*/)![0].slice(p.indent.length);
    for (let i = index + 1; i < end; i++) {
      if (lines[i].startsWith(p.indent + extra)) lines[i] = p.indent + lines[i].slice(p.indent.length + extra.length);
      // At the top there's no manager to assist, so assistants become people.
      if (!p.indent && /^\+\s*/.test(lines[i])) lines[i] = lines[i].replace(/^\+\s*/, "");
    }
  }
  lines.splice(index, 1);
  const refs = new Set([p.name, ...(p.id ? [p.id, `#${p.id}`] : [])]);
  const kept = lines.filter((raw) => {
    const m = raw.trim().match(DOTTED);
    return !(m && !/^[ \t]+/.test(raw) && (refs.has(m[1].trim()) || refs.has(m[2].trim())));
  });
  return kept.join(eol(code));
}
