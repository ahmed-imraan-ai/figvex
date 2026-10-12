// Copies the PlantUML engine out of node_modules into public/ so it is served
// as static files. The engine resolves themes.js, emoji.js and openiconic.js
// relative to PLANTUML_STDLIB_BASE, so those must sit next to plantuml.js.
//
// Files land in a versioned folder, which lets the host cache them forever.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = join(root, "node_modules", "@plantuml", "core");

if (!existsSync(pkgDir)) {
  console.warn("[copy-plantuml] @plantuml/core is not installed yet, skipping.");
  process.exit(0);
}

const { version } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const vendorRoot = join(root, "public", "vendor", "plantuml");
const target = join(vendorRoot, version);

// Drop folders left behind by older engine versions.
if (existsSync(vendorRoot)) {
  for (const entry of readdirSync(vendorRoot)) {
    if (entry !== version) rmSync(join(vendorRoot, entry), { recursive: true, force: true });
  }
}

mkdirSync(target, { recursive: true });
for (const file of ["plantuml.js", "viz-global.js", "themes.js", "emoji.js", "openiconic.js", "LICENSE"]) {
  cpSync(join(pkgDir, file), join(target, file));
}

console.log(`[copy-plantuml] PlantUML ${version} -> public/vendor/plantuml/${version}/`);
