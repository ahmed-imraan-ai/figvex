import { renderBpmn } from "./bpmn";
import { renderChart } from "./chart";
import { renderGraphviz } from "./graphviz";
import { renderSketch } from "./sketch";
import { renderMermaid } from "./mermaid";
import { renderPlantUml } from "./plantuml";
import type { Engine, RenderOptions, RenderResult } from "./types";

export * from "./types";
export { detectEngine, diagramKind } from "./detect";

const RENDERERS: Record<Engine, (code: string, options: RenderOptions) => Promise<RenderResult>> = {
  plantuml: renderPlantUml,
  mermaid: renderMermaid,
  graphviz: renderGraphviz,
  echarts: renderChart,
  bpmn: renderBpmn,
  sketch: renderSketch,
};

export function renderDiagram(engine: Engine, code: string, options: RenderOptions): Promise<RenderResult> {
  if (!code.trim()) {
    return Promise.resolve({ ok: false, message: "", ms: 0 });
  }
  return RENDERERS[engine](code, options);
}
