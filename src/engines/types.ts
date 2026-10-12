export type Engine = "plantuml" | "mermaid" | "graphviz" | "echarts" | "bpmn" | "sketch";

export const ENGINES: readonly Engine[] = ["plantuml", "mermaid", "graphviz", "echarts", "bpmn", "sketch"];

export function isEngine(value: unknown): value is Engine {
  return ENGINES.includes(value as Engine);
}

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
  /** Graphviz only: "plain" uses a sans-serif font, "default" keeps Graphviz's own. */
  graphvizStyle: GraphvizStyle;
  /** Charts only: the colour palette. */
  chartStyle: ChartStyle;
  /** BPMN only: black on white, or tinted shapes. */
  bpmnStyle: BpmnStyle;
  /** Sketch only: straight lines or a hand-drawn look. */
  sketchStyle: SketchStyle;
}

export type GraphvizStyle = "plain" | "default";

export type ChartStyle = "default" | "colour-blind" | "greyscale";

export type BpmnStyle = "plain" | "colour";

export type SketchStyle = "clean" | "hand-drawn";

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
  graphviz: "Graphviz",
  echarts: "ECharts",
  bpmn: "BPMN",
  sketch: "Sketch",
};

export const ENGINE_EXT: Record<Engine, string> = {
  plantuml: "puml",
  mermaid: "mmd",
  graphviz: "gv",
  echarts: "echarts",
  bpmn: "bpmn",
  sketch: "sketch",
};

/** Short tag shown next to diagrams in lists. */
export const ENGINE_TAG: Record<Engine, string> = {
  plantuml: "puml",
  mermaid: "mmd",
  graphviz: "dot",
  echarts: "chart",
  bpmn: "bpmn",
  sketch: "sketch",
};

/** File extensions recognised when opening a file. */
export const ENGINE_FILE_EXTS: Record<Engine, string[]> = {
  plantuml: ["puml", "plantuml", "pu", "iuml", "wsd"],
  mermaid: ["mmd", "mermaid"],
  graphviz: ["gv", "dot"],
  echarts: ["echarts", "json", "jsonc"],
  bpmn: ["bpmn", "bpmn2"],
  sketch: ["sketch"],
};

/** Info string for a Markdown code block. */
export const ENGINE_FENCE: Record<Engine, string> = {
  plantuml: "plantuml",
  mermaid: "mermaid",
  graphviz: "dot",
  echarts: "echarts",
  bpmn: "bpmn",
  sketch: "sketch",
};
