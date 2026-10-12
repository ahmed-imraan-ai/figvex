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

// Public address for the canonical URL, social cards and sitemap. Netlify's
// URL is the site's main address, including a custom domain once one is set.
const siteUrl = (process.env.VITE_SITE_URL || process.env.URL || "https://figvex.netlify.app").replace(/\/+$/, "");
const appVersion = readVersion("./package.json");
// Viz.js (bundled with @plantuml/core) records its Graphviz version in the script.
const graphvizVersion =
  readFileSync(new URL("./node_modules/@plantuml/core/viz-global.js", import.meta.url), "utf8").match(
    /graphvizVersion="([\d.]+)"/,
  )?.[1] ?? "";

export default defineConfig({
  plugins: [
    {
      name: "figvex-deploy-context",
      transformIndexHtml: (html) =>
        deployLabel ? html.replace("</head>", '    <meta name="robots" content="noindex, nofollow" />\n  </head>') : html,
    },
    {
      name: "figvex-seo",
      transformIndexHtml: (html) => html.replaceAll("%SITE_URL%", siteUrl).replaceAll("%APP_VERSION%", appVersion),
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "robots.txt",
          source: `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
        });
        this.emitFile({
          type: "asset",
          fileName: "sitemap.xml",
          source:
            '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
            `  <url>\n    <loc>${siteUrl}/</loc>\n    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>\n  </url>\n` +
            "</urlset>\n",
        });
      },
    },
  ],
  define: {
    __DEPLOY_LABEL__: JSON.stringify(deployLabel),
    // Netlify's Open Source plan asks for a "powered by Netlify" link.
    __ON_NETLIFY__: JSON.stringify(process.env.NETLIFY === "true"),
    __APP_VERSION__: JSON.stringify(appVersion),
    __PLANTUML_VERSION__: JSON.stringify(readVersion("./node_modules/@plantuml/core/package.json")),
    __MERMAID_VERSION__: JSON.stringify(readVersion("./node_modules/mermaid/package.json")),
    __GRAPHVIZ_VERSION__: JSON.stringify(graphvizVersion),
    __ECHARTS_VERSION__: JSON.stringify(readVersion("./node_modules/echarts/package.json")),
  },
  build: {
    target: "es2022",
    // Mermaid ships a few large diagram chunks; they are lazy-loaded.
    chunkSizeWarningLimit: 2500,
  },
});
