// ER diagrams from SQL: CREATE TABLE statements in, tables and crow's foot
// links out. Graphviz places the tables; the drawing is ours.

import { loadGraphviz } from "../graphviz";
import type { RenderOptions, RenderResult } from "../types";
import { parseSql, SqlError } from "./model";
import { drawSql, layoutSql } from "./render";

export async function renderSql(code: string, options: RenderOptions): Promise<RenderResult> {
  const t0 = performance.now();
  try {
    const schema = parseSql(code);
    const layout = layoutSql(schema, await loadGraphviz(), options.sqlStyle);
    const svg = drawSql(schema, layout, { dark: options.dark, style: options.sqlStyle, warnings: schema.warnings });
    return { ok: true, svg, ms: performance.now() - t0, warnings: schema.warnings };
  } catch (err) {
    const line = err instanceof SqlError ? err.line : undefined;
    return { ok: false, message: err instanceof Error ? err.message : String(err), line, ms: performance.now() - t0 };
  }
}
