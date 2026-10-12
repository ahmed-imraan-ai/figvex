import { renderGraphviz } from "./graphviz";
import { renderMermaid } from "./mermaid";
import { renderPlantUml } from "./plantuml";
import type { Engine, RenderOptions, RenderResult } from "./types";

export * from "./types";
export { detectEngine, diagramKind } from "./detect";

const RENDERERS: Record<Engine, (code: string, options: RenderOptions) => Promise<RenderResult>> = {
  plantuml: renderPlantUml,
  mermaid: renderMermaid,
  graphviz: renderGraphviz,
};

export function renderDiagram(engine: Engine, code: string, options: RenderOptions): Promise<RenderResult> {
  if (!code.trim()) {
    return Promise.resolve({ ok: false, message: "", ms: 0 });
  }
  return RENDERERS[engine](code, options);
}
