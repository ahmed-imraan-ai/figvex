// Writes public/icon-index.json: the cloud icons in PlantUML's standard
// library (AWS, Azure, Google Cloud, Kubernetes), for the icon search in
// the editor. It lists names and include paths only; the icons themselves
// still load from the official PlantUML host when a diagram uses them.
//
// Usage: node scripts/make-icon-index.mjs
// Run it when the PlantUML version changes; the output is committed.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = process.env.PLANTUML_STDLIB_SOURCE ?? "https://plantuml.github.io/plantuml/js-plantuml/";

/** Library, its label, and the include every diagram using it needs first. */
const LIBRARIES = [
  { id: "awslib14", label: "AWS", common: "awslib14/AWSCommon" },
  { id: "azure", label: "Azure", common: "azure/AzureCommon" },
  { id: "gcp", label: "Google Cloud", common: "gcp/GCPCommon" },
  { id: "k8s", label: "Kubernetes", common: "k8s/Common" },
];

/** Reads a quoted JavaScript string starting at `at`; returns its value and where it ends. */
function readString(source, at) {
  const quote = source[at];
  let value = "";
  let i = at + 1;
  for (; i < source.length && source[i] !== quote; i++) {
    if (source[i] !== "\\") {
      value += source[i];
      continue;
    }
    const c = source[++i];
    if (c === "n") value += "\n";
    else if (c === "t") value += "\t";
    else if (c === "u") {
      value += String.fromCharCode(parseInt(source.slice(i + 1, i + 5), 16));
      i += 4;
    } else if (c === "x") {
      value += String.fromCharCode(parseInt(source.slice(i + 1, i + 3), 16));
      i += 2;
    } else value += c;
  }
  return { value, end: i + 1 };
}

/**
 * The files in a bundle, read as text. Each is assigned as
 * PLANTUML_STDLIB.<lib>["path"]="line;line;...".split(";"). The bundle is
 * never run.
 */
function files(source, lib) {
  const out = new Map();
  const marker = `PLANTUML_STDLIB.${lib}["`;
  for (let at = source.indexOf(marker); at >= 0; at = source.indexOf(marker, at + 1)) {
    const pathEnd = source.indexOf('"]=', at + marker.length);
    if (pathEnd < 0) break;
    const path = source.slice(at + marker.length, pathEnd);
    const start = pathEnd + 3;
    if (source[start] === "[") {
      // Or a list of quoted lines: ["line","line"].
      const lines = [];
      let i = start + 1;
      const skipSpace = () => {
        while (/\s/.test(source[i] ?? "")) i++;
      };
      skipSpace();
      while (source[i] === '"' || source[i] === "'") {
        const s = readString(source, i);
        lines.push(s.value);
        i = s.end;
        skipSpace();
        if (source[i] === ",") i++;
        skipSpace();
      }
      out.set(path, lines);
      continue;
    }
    if (source[start] !== '"' && source[start] !== "'") continue;
    const text = readString(source, start);
    const split = source.slice(text.end).match(/^\.split\((["'])(.*?)\1\)/);
    out.set(path, split ? text.value.split(split[2]) : [text.value]);
  }
  return out;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const icons = [];

for (const lib of LIBRARIES) {
  const res = await fetch(`${SOURCE}${lib.id}.min.js`);
  if (!res.ok) throw new Error(`${lib.id}: HTTP ${res.status}`);
  for (const [path, lines] of files(await res.text(), lib.id)) {
    if (!path.includes("/") || path.endsWith("/all") || !Array.isArray(lines)) continue;
    // Icons define a sprite and a macro of the same name: Name(alias, label, technology).
    const sprite = lines.find((l) => typeof l === "string" && l.startsWith("sprite $"))?.match(/^sprite \$(\w+)/)?.[1];
    const macro = sprite && lines.some((l) => typeof l === "string" && l.startsWith(`!define ${sprite}(e_alias, e_label, e_techn)`));
    if (!macro) continue;
    icons.push([lib.id, path, sprite]);
  }
  console.log(`${lib.label}: ${icons.filter((i) => i[0] === lib.id).length} icons`);
}

icons.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
writeFileSync(join(root, "public", "icon-index.json"), `${JSON.stringify({ libraries: LIBRARIES, icons })}\n`);
console.log(`Wrote ${icons.length} icons to public/icon-index.json`);
