export type Engine = "plantuml" | "mermaid" | "graphviz" | "echarts" | "bpmn" | "sketch" | "orgchart" | "network" | "sql" | "logic" | "automaton" | "wavedrom" | "structures";

export const ENGINES: readonly Engine[] = ["plantuml", "mermaid", "graphviz", "echarts", "bpmn", "sketch", "orgchart", "network", "sql", "logic", "automaton", "wavedrom", "structures"];

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
  /** Org charts only: card design. */
  orgStyle: OrgStyle;
  /** Network diagrams only: icon design. */
  netStyle: NetStyle;
  /** ER diagrams from SQL: colour, black and white, or keys only. */
  sqlStyle: SqlStyle;
  /** Logic only: how NOT, AND and OR are written. */
  logicStyle: LogicStyle;
  /** Automata only: plain circles, or the start and accepting states tinted. */
  automatonStyle: AutomatonStyle;
  /** Timing diagrams only: the WaveDrom skin. Dark diagrams always use the dark skin. */
  waveStyle: WaveStyle;
  /** Data structures only: plain nodes, or tree and graph nodes tinted. */
  structStyle: StructStyle;
}

export type GraphvizStyle = "plain" | "default";

export type ChartStyle = "default" | "colour-blind" | "greyscale";

export type BpmnStyle = "plain" | "colour";

export type SketchStyle = "clean" | "hand-drawn";

export type OrgStyle = "cards" | "minimal" | "bold";

export type NetStyle = "tiles" | "outline" | "mono";

export type SqlStyle = "colour" | "plain" | "keys";

export type LogicStyle = "overbar" | "prime" | "logic" | "code";

export type AutomatonStyle = "plain" | "colour";

export type WaveStyle = "default" | "narrow" | "lowkey";

export type StructStyle = "plain" | "colour";

export type MermaidTheme = "default" | "neutral" | "base" | "forest" | "neo" | "redux" | "redux-color";

export interface RenderSuccess {
  ok: true;
  svg: string;
  ms: number;
  /** Set when the diagram was drawn by the remote PlantUML server. */
  remote?: boolean;
  /** Maps a line in the rendered text to the editor, when they differ. */
  mapLine?: (line: number) => number;
  /** Things worth a look that didn't stop the drawing, by editor line. */
  warnings?: { message: string; line: number }[];
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
  orgchart: "Org chart",
  network: "Network",
  sql: "SQL",
  logic: "Logic",
  automaton: "Automata",
  wavedrom: "Timing (WaveDrom)",
  structures: "Data structures",
};

export const ENGINE_EXT: Record<Engine, string> = {
  plantuml: "puml",
  mermaid: "mmd",
  graphviz: "gv",
  echarts: "echarts",
  bpmn: "bpmn",
  sketch: "sketch",
  orgchart: "org",
  network: "network",
  sql: "sql",
  logic: "logic",
  automaton: "automaton",
  wavedrom: "wavedrom",
  structures: "structures",
};

/** Short tag shown next to diagrams in lists. */
export const ENGINE_TAG: Record<Engine, string> = {
  plantuml: "puml",
  mermaid: "mmd",
  graphviz: "dot",
  echarts: "chart",
  bpmn: "bpmn",
  sketch: "sketch",
  orgchart: "org",
  network: "net",
  sql: "sql",
  logic: "logic",
  automaton: "fa",
  wavedrom: "wave",
  structures: "ds",
};

/** File extensions recognised when opening a file. */
export const ENGINE_FILE_EXTS: Record<Engine, string[]> = {
  plantuml: ["puml", "plantuml", "pu", "iuml", "wsd"],
  mermaid: ["mmd", "mermaid"],
  graphviz: ["gv", "dot"],
  echarts: ["echarts", "json", "jsonc"],
  bpmn: ["bpmn", "bpmn2"],
  sketch: ["sketch"],
  orgchart: ["org", "orgchart"],
  network: ["network", "net"],
  sql: ["sql", "ddl"],
  logic: ["logic", "bool"],
  automaton: ["automaton", "fsm", "dfa", "nfa", "tm"],
  wavedrom: ["wavedrom", "wavejson"],
  structures: ["structures", "ds"],
};

/** Info string for a Markdown code block. */
export const ENGINE_FENCE: Record<Engine, string> = {
  plantuml: "plantuml",
  mermaid: "mermaid",
  graphviz: "dot",
  echarts: "echarts",
  bpmn: "bpmn",
  sketch: "sketch",
  orgchart: "orgchart",
  network: "network",
  sql: "sql",
  logic: "logic",
  automaton: "automaton",
  wavedrom: "wavedrom",
  structures: "structures",
};
