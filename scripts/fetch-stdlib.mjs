// Downloads a curated set of PlantUML standard-library bundles so that
// `!include <C4/C4_Context>` and friends are served from this site instead of
// a third party. Anything not listed here is still fetched on demand from the
// official PlantUML host (see src/engines/plantuml.ts).
//
// Usage: node scripts/fetch-stdlib.mjs [--strict]
// Without --strict, network failures only print a warning so an offline build
// still succeeds.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = process.env.PLANTUML_STDLIB_SOURCE ?? "https://plantuml.github.io/plantuml/js-plantuml/";

// Candidates: small libraries that are useful in coursework. The huge icon
// sets (AWS, IBM, tupadr3, Material, logos) stay on the official host.
const BUNDLES = [
  "c4", "classy", "classy-c4", "archimate", "domainstory", "eip", "edgy", "adaml",
  "k8s", "kubernetes", "cloudinsight", "cloudogu", "gcp", "azure", "elastic", "osa2",
];

const strict = process.argv.includes("--strict");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "public", "vendor", "plantuml-stdlib");
mkdirSync(target, { recursive: true });

const available = [];
let failed = 0;

// Each bundle declares its licence in PLANTUML_STDLIB_INFO. Only bundles with
// a permissive licence are served from this site; the rest still work, loaded
// from the official PlantUML host at runtime, so we never redistribute them.
const PERMISSIVE = /^(MIT( License)?|Apache[- ]2\.0|Apache License,? (Version )?2\.0|BSD-[23]-Clause|ISC|CC0-1\.0|Unlicense)$/i;
const skipped = [];

function declaredLicense(source) {
  return source.slice(0, 4000).match(/license:"([^"]*)"/)?.[1]?.trim() ?? "";
}

await Promise.all(
  BUNDLES.map(async (name) => {
    const file = `${name}.min.js`;
    const dest = join(target, file);
    try {
      const res = await fetch(SOURCE + file);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = Buffer.from(await res.arrayBuffer());
      const license = declaredLicense(body.toString("utf8"));
      if (!PERMISSIVE.test(license)) {
        rmSync(dest, { force: true });
        skipped.push(`${name} (${license || "no licence declared"})`);
        return;
      }
      writeFileSync(dest, body);
      available.push(file);
    } catch (err) {
      // Keep a copy from an earlier run if there is one and its licence fits.
      if (existsSync(dest) && PERMISSIVE.test(declaredLicense(readFileSync(dest, "utf8")))) {
        available.push(file);
      } else {
        failed++;
        console.warn(`[fetch-stdlib] ${file}: ${err.message}`);
      }
    }
  }),
);

available.sort();
writeFileSync(join(target, "manifest.json"), JSON.stringify({ source: SOURCE, files: available }, null, 2));
console.log(`[fetch-stdlib] ${available.length}/${BUNDLES.length} bundles in public/vendor/plantuml-stdlib/`);
if (skipped.length) console.log(`[fetch-stdlib] left on the official host (licence): ${skipped.sort().join(", ")}`);

if (failed && strict) process.exit(1);
