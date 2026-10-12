export const APP_NAME = "Figvex";
export const APP_VERSION = __APP_VERSION__;
export const DEPLOY_LABEL = __DEPLOY_LABEL__;
export const ON_NETLIFY = __ON_NETLIFY__;
export const PLANTUML_VERSION = __PLANTUML_VERSION__;
export const MERMAID_VERSION = __MERMAID_VERSION__;

export const REPO_URL = import.meta.env.VITE_REPO_URL ?? "";

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
} as const;
