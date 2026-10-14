import type { D2Style, NomnomlStyle, WireStyle, StructStyle, WaveStyle, AutomatonStyle, LogicStyle, SqlStyle, BpmnStyle, ChartStyle, NetStyle, OrgStyle, SketchStyle, GraphvizStyle, MermaidTheme } from "./types";

/** Themes bundled with PlantUML (themes.js), minus "plain" and "_none_". */
export const PLANTUML_THEMES = `amiga aws-orange black-knight bluegray blueprint carbon-gray cerulean
cerulean-outline cloudscape-design crt-amber crt-green cyborg cyborg-outline hacker lightgray mars
materia materia-outline metal mimeograph minty reddress-darkblue reddress-darkgreen
reddress-darkorange reddress-darkred reddress-lightblue reddress-lightgreen reddress-lightorange
reddress-lightred sandstone silver sketchy sketchy-outline spacelab spacelab-white superhero
superhero-outline toy united vibrant`.split(/\s+/);

export const PLANTUML_STYLES: { value: string; label: string }[] = [
  { value: "plain", label: "Plain" },
  { value: "default", label: "PlantUML colours" },
];

export const MERMAID_STYLES: { value: MermaidTheme; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "neutral", label: "Neutral" },
  { value: "base", label: "Base" },
  { value: "forest", label: "Forest" },
  { value: "neo", label: "Neo" },
  { value: "redux", label: "Redux" },
  { value: "redux-color", label: "Redux colour" },
];

export const GRAPHVIZ_STYLES: { value: GraphvizStyle; label: string }[] = [
  { value: "plain", label: "Plain" },
  { value: "default", label: "Graphviz defaults" },
];

export const CHART_STYLES: { value: ChartStyle; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "colour-blind", label: "Colour-blind safe" },
  { value: "greyscale", label: "Greyscale" },
];

export const BPMN_STYLES: { value: BpmnStyle; label: string }[] = [
  { value: "plain", label: "Plain" },
  { value: "colour", label: "Tinted" },
];

export const SKETCH_STYLES: { value: SketchStyle; label: string }[] = [
  { value: "clean", label: "Clean" },
  { value: "hand-drawn", label: "Hand-drawn" },
];

export const ORG_STYLES: { value: OrgStyle; label: string }[] = [
  { value: "cards", label: "Cards" },
  { value: "minimal", label: "Minimal" },
  { value: "bold", label: "Bold" },
];

export const NET_STYLES: { value: NetStyle; label: string }[] = [
  { value: "tiles", label: "Colour tiles" },
  { value: "outline", label: "Outline" },
  { value: "mono", label: "Greyscale" },
];

export const SQL_STYLES: { value: SqlStyle; label: string }[] = [
  { value: "colour", label: "Colour" },
  { value: "plain", label: "Black and white" },
  { value: "keys", label: "Keys only" },
];

export const LOGIC_STYLES: { value: LogicStyle; label: string }[] = [
  { value: "overbar", label: "Overbars" },
  { value: "prime", label: "Primes" },
  { value: "logic", label: "Logic symbols" },
  { value: "code", label: "Programming" },
];

export const AUTOMATON_STYLES: { value: AutomatonStyle; label: string }[] = [
  { value: "plain", label: "Plain" },
  { value: "colour", label: "Colour" },
];

export const WAVE_STYLES: { value: WaveStyle; label: string }[] = [
  { value: "default", label: "WaveDrom" },
  { value: "narrow", label: "Narrow" },
  { value: "lowkey", label: "Low-key" },
];

export const STRUCT_STYLES: { value: StructStyle; label: string }[] = [
  { value: "plain", label: "Plain" },
  { value: "colour", label: "Colour" },
];

export const WIRE_STYLES: { value: WireStyle; label: string }[] = [
  { value: "clean", label: "Clean" },
  { value: "sketchy", label: "Sketchy" },
];

export const NOMNOML_STYLES: { value: NomnomlStyle; label: string }[] = [
  { value: "default", label: "nomnoml" },
  { value: "plain", label: "Black and white" },
];

export const D2_STYLES: { value: D2Style; label: string }[] = [
  { value: "neutral", label: "Neutral" },
  { value: "grey", label: "Grey" },
  { value: "colour-blind", label: "Colour-blind clear" },
  { value: "terminal", label: "Terminal" },
  { value: "origami", label: "Origami" },
  { value: "sketch", label: "Sketch" },
];
