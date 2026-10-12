/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
/** "staging", "preview" and so on; empty in production. */
declare const __DEPLOY_LABEL__: string;
/** True when the build ran on Netlify. */
declare const __ON_NETLIFY__: boolean;
declare const __PLANTUML_VERSION__: string;
declare const __MERMAID_VERSION__: string;
/** Graphviz inside the Viz.js build that ships with PlantUML. */
declare const __GRAPHVIZ_VERSION__: string;
declare const __ECHARTS_VERSION__: string;

interface ImportMetaEnv {
  /** Source repository for the GitHub links. Defaults to the Figvex repo; set to "" to hide them. */
  readonly VITE_REPO_URL?: string;
  /** Public address of the site, used for the canonical URL, social cards and sitemap. */
  readonly VITE_SITE_URL?: string;
  /** PlantUML server used for diagram types the browser engine cannot draw. */
  readonly VITE_PLANTUML_SERVER?: string;
  /** Where stdlib bundles not shipped with the site are fetched from. */
  readonly VITE_PLANTUML_STDLIB_URL?: string;
}
