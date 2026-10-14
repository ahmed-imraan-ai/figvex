import { renderBpmn } from "./bpmn";
import { renderChart } from "./chart";
import { renderGraphviz } from "./graphviz";
import { renderNetwork } from "./network";
import { renderOrgChart } from "./orgchart";
import { renderSketch } from "./sketch";
import { renderWaveDrom } from "./wavedrom";
import { renderAutomaton } from "./automaton";
import { renderLogic } from "./logic";
import { renderSql } from "./sql";
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
  orgchart: renderOrgChart,
  network: renderNetwork,
  sql: renderSql,
  logic: renderLogic,
  automaton: renderAutomaton,
  wavedrom: renderWaveDrom,
};

export function renderDiagram(engine: Engine, code: string, options: RenderOptions): Promise<RenderResult> {
  if (!code.trim()) {
    return Promise.resolve({ ok: false, message: "", ms: 0 });
  }
  return RENDERERS[engine](code, options);
}
