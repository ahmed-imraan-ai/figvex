export type Engine = "plantuml" | "mermaid";

export interface RenderOptions {
  dark: boolean;
  /** PlantUML only: a `!theme` name, or "default" for PlantUML's own colours. */
  plantumlTheme: string;
  /** PlantUML only: send unsupported diagram types to the PlantUML server. */
  serverFallback: boolean;
  /** Mermaid only. */
  mermaidTheme: MermaidTheme;
  /** Mermaid only. */
  look: "classic" | "handDrawn";
}

export type MermaidTheme = "default" | "neutral" | "base" | "forest" | "neo" | "redux" | "redux-color";

export interface RenderSuccess {
  ok: true;
  svg: string;
  ms: number;
  /** Set when the diagram was drawn by the remote PlantUML server. */
  remote?: boolean;
  /** Maps a line in the rendered text to the editor, when they differ. */
  mapLine?: (line: number) => number;
}

export interface RenderFailure {
  ok: false;
  message: string;
  /** 1-based line in the editor, when the engine reports one. */
  line?: number;
  /** The diagram type exists in PlantUML but not in the browser build. */
  unsupported?: string;
  ms: number;
}

export type RenderResult = RenderSuccess | RenderFailure;

export const ENGINE_LABEL: Record<Engine, string> = {
  plantuml: "PlantUML",
  mermaid: "Mermaid",
};

export const ENGINE_EXT: Record<Engine, string> = {
  plantuml: "puml",
  mermaid: "mmd",
};
