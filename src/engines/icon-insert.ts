// Adds a cloud icon from PlantUML's standard library to a diagram: the
// library's common include and the icon's own include (unless they're
// already there), and a line using the icon's macro.

export interface IconLibrary {
  id: string;
  label: string;
  common: string;
}

export interface IconIndex {
  libraries: IconLibrary[];
  /** [library id, path inside the library, macro name] */
  icons: [string, string, string][];
}

/** "Compute_Engine" -> "Compute Engine", "AzureVirtualMachine" -> "Azure Virtual Machine". */
export function iconLabel(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/(\d)([A-Z][a-z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
}

/** Icons matching every word of the query, best first. */
export function searchIcons(index: IconIndex, query: string, limit = 80): IconIndex["icons"] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const labels = new Map(index.libraries.map((l) => [l.id, l.label.toLowerCase()]));
  const scored: { icon: IconIndex["icons"][number]; score: number }[] = [];
  for (const icon of index.icons) {
    const [lib, path, name] = icon;
    const n = name.toLowerCase();
    const hay = `${n} ${iconLabel(name).toLowerCase()} ${path} ${labels.get(lib)} ${lib}`;
    if (!words.every((w) => hay.includes(w))) continue;
    const first = words[0] ?? "";
    // Exact names first, then names starting with the query, then the rest; shorter names first.
    const score = (n === words.join("") ? 0 : n.startsWith(first) ? 1 : n.includes(first) ? 2 : 3) * 1000 + n.length;
    scored.push({ icon, score });
  }
  return scored.sort((a, b) => a.score - b.score).slice(0, limit).map((s) => s.icon);
}

/** Inserts the includes and a macro line; returns the new text and the line of the macro (1-based). */
export function insertIcon(code: string, cursorLine: number, lib: IconLibrary, icon: IconIndex["icons"][number]): { code: string; line: number } {
  const [, path, name] = icon;
  const lines = code.split("\n");
  const has = (include: string) => lines.some((l) => l.trim().toLowerCase() === `!include <${include.toLowerCase()}>`);
  const wanted = [lib.common, `${lib.id}/${path}`].filter((inc) => !has(inc)).map((inc) => `!include <${inc}>`);

  const startAt = lines.findIndex((l) => /^\s*@start\w*/.test(l));
  let endAt = lines.findIndex((l, i) => i > startAt && /^\s*@end\w*/.test(l));
  // Includes go after the last include, or straight after @startuml.
  let lastInclude = -1;
  lines.forEach((l, i) => {
    if (/^\s*!include\b/.test(l) && (endAt < 0 || i < endAt)) lastInclude = i;
  });
  const includeAt = (lastInclude >= 0 ? lastInclude : startAt) + 1;
  lines.splice(includeAt, 0, ...wanted);
  if (endAt >= 0 && includeAt <= endAt) endAt += wanted.length;
  let cursor = cursorLine - 1 + (cursorLine - 1 >= includeAt ? wanted.length : 0);

  // A short, unused alias from the name.
  const base = name.replace(/[^A-Za-z0-9]/g, "").toLowerCase() || "icon";
  const text = lines.join("\n");
  let alias = base;
  for (let i = 2; new RegExp(`\\(${alias}\\s*,`).test(text); i++) alias = `${base}${i}`;
  const macro = `${name}(${alias}, "${iconLabel(name)}", "${lib.label}")`;

  // After the cursor's line, as long as that's inside the diagram.
  const lastIncludeNow = includeAt + wanted.length - 1;
  if (cursor < Math.max(lastIncludeNow, startAt) || (endAt >= 0 && cursor >= endAt)) cursor = endAt >= 0 ? endAt - 1 : lines.length - 1;
  lines.splice(cursor + 1, 0, macro);
  return { code: lines.join("\n"), line: cursor + 2 };
}
