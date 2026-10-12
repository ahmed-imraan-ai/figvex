import { renderMermaid } from "./mermaid";
import { renderPlantUml } from "./plantuml";
import type { Engine, RenderOptions, RenderResult } from "./types";

export * from "./types";
export { detectEngine, diagramKind } from "./detect";

export function renderDiagram(engine: Engine, code: string, options: RenderOptions): Promise<RenderResult> {
  if (!code.trim()) {
    return Promise.resolve({ ok: false, message: "", ms: 0 });
  }
  return engine === "plantuml" ? renderPlantUml(code, options) : renderMermaid(code, options);
}
