import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const readVersion = (path: string): string =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")).version;

// Netlify sets CONTEXT (production, branch-deploy, deploy-preview) and BRANCH
// during builds. Anything other than production gets a label in the header
// and is kept out of search engines.
const context = process.env.CONTEXT;
const deployLabel =
  context && context !== "production" ? (context === "branch-deploy" ? (process.env.BRANCH ?? "branch") : "preview") : "";

export default defineConfig({
  plugins: [
    {
      name: "figvex-deploy-context",
      transformIndexHtml: (html) =>
        deployLabel ? html.replace("</head>", '    <meta name="robots" content="noindex, nofollow" />\n  </head>') : html,
    },
  ],
  define: {
    __DEPLOY_LABEL__: JSON.stringify(deployLabel),
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
