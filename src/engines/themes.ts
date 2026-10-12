import type { ChartStyle, GraphvizStyle, MermaidTheme } from "./types";

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
