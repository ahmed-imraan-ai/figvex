import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const readVersion = (path: string): string =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")).version;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(readVersion("./package.json")),
    __PLANTUML_VERSION__: JSON.stringify(readVersion("./node_modules/@plantuml/core/package.json")),
    __MERMAID_VERSION__: JSON.stringify(readVersion("./node_modules/mermaid/package.json")),
  },
  build: {
    target: "es2022",
    // Mermaid ships a few large diagram chunks; they are lazy-loaded.
    chunkSizeWarningLimit: 2500,
  },
});
