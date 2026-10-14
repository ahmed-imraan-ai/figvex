export const APP_NAME = "Figvex";
export const APP_VERSION = __APP_VERSION__;
export const DEPLOY_LABEL = __DEPLOY_LABEL__;
export const ON_NETLIFY = __ON_NETLIFY__;
export const GA_ID = __GA_ID__;
export const PLANTUML_VERSION = __PLANTUML_VERSION__;
export const MERMAID_VERSION = __MERMAID_VERSION__;
export const GRAPHVIZ_VERSION = __GRAPHVIZ_VERSION__;
export const ECHARTS_VERSION = __ECHARTS_VERSION__;

export const ENGINE_VERSION = {
  plantuml: PLANTUML_VERSION,
  mermaid: MERMAID_VERSION,
  graphviz: GRAPHVIZ_VERSION,
  echarts: ECHARTS_VERSION,
  bpmn: "2.0",
  sketch: "",
  orgchart: "",
  network: "",
  sql: "",
  logic: "",
  automaton: "",
} as const;

/** Set VITE_REPO_URL to an empty string to hide the GitHub links. */
export const REPO_URL = (import.meta.env.VITE_REPO_URL ?? "https://github.com/ahmed-imraan-ai/figvex").replace(/\/+$/, "");
export const ISSUES_URL = REPO_URL ? `${REPO_URL}/issues` : "";

const base = import.meta.env.BASE_URL;

/** Folder holding plantuml.js, viz-global.js, themes.js, emoji.js, openiconic.js. */
export const PLANTUML_ENGINE_BASE = `${base}vendor/plantuml/${PLANTUML_VERSION}/`;
/** Stdlib bundles downloaded at build time (scripts/fetch-stdlib.mjs). */
export const PLANTUML_STDLIB_LOCAL = `${base}vendor/plantuml-stdlib/`;
/** Fallback for every other stdlib bundle. */
export const PLANTUML_STDLIB_REMOTE =
  import.meta.env.VITE_PLANTUML_STDLIB_URL || "https://plantuml.github.io/plantuml/js-plantuml/";
/** Public PlantUML server, only contacted when the user opts in. */
export const PLANTUML_SERVER = (import.meta.env.VITE_PLANTUML_SERVER || "https://www.plantuml.com/plantuml").replace(/\/+$/, "");

export const DOCS = {
  plantuml: "https://plantuml.com/",
  mermaid: "https://mermaid.js.org/intro/syntax-reference.html",
  graphviz: "https://graphviz.org/doc/info/lang.html",
  echarts: "https://echarts.apache.org/en/option.html",
  bpmn: "https://www.omg.org/spec/BPMN/2.0.2/",
  sketch: "https://github.com/ahmed-imraan-ai/figvex#sketches",
  orgchart: "https://github.com/ahmed-imraan-ai/figvex#org-charts",
  network: "https://github.com/ahmed-imraan-ai/figvex#networks",
  sql: "https://github.com/ahmed-imraan-ai/figvex#er-diagrams-from-sql",
  logic: "https://github.com/ahmed-imraan-ai/figvex#logic",
  automaton: "https://github.com/ahmed-imraan-ai/figvex#automata",
} as const;
