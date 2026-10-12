import type { Engine } from "./types";

const MERMAID_TYPES = [
  "flowchart", "graph", "sequenceDiagram", "classDiagram", "classDiagram-v2", "stateDiagram",
  "stateDiagram-v2", "erDiagram", "journey", "gantt", "pie", "quadrantChart", "requirementDiagram",
  "gitGraph", "C4Context", "C4Container", "C4Component", "C4Dynamic", "C4Deployment", "mindmap",
  "timeline", "zenuml", "sankey", "sankey-beta", "xychart", "xychart-beta", "block", "block-beta",
  "packet", "packet-beta", "kanban", "architecture", "architecture-beta", "radar", "radar-beta",
  "treemap", "treemap-beta", "venn", "venn-beta", "ishikawa", "ishikawa-beta", "wardley", "wardley-beta", "railroad",
  "usecase", "swimlanes", "treeView", "eventmodeling", "cynefin", "info",
];

const mermaidStart = new RegExp(`^(${MERMAID_TYPES.map((t) => t.replace(/-/g, "\\-")).join("|")})(\\s|$|:)`);

// DOT shares the word "graph" with Mermaid. Mermaid follows it with a
// direction or nothing; DOT follows it with an optional ID and a brace.
const DOT_ID = String.raw`("(?:[^"\\]|\\.)*"|[\w.]+)`;
const dotStart = new RegExp(
  String.raw`^(strict\s+)?digraph\b|^strict\s+graph\b|^graph(\s+${DOT_ID})?\s*\{|^graph\s+(?!(TB|TD|BT|RL|LR)\s*$)${DOT_ID}\s*$`,
  "i",
);

/**
 * Guess the engine from the first meaningful line. Returns null when the text
 * is empty or ambiguous, so the caller can keep whatever was chosen before.
 */
export function detectEngine(code: string): Engine | null {
  const lines = code.split(/\r?\n/);
  let inFrontMatter = false;
  let inBlockComment = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (inBlockComment) {
      if (line.includes("*/")) inBlockComment = false;
      continue;
    }
    if (i === 0 && line === "---") {
      inFrontMatter = true;
      continue;
    }
    if (inFrontMatter) {
      if (line === "---") inFrontMatter = false;
      continue;
    }
    if (line.startsWith("@start")) return "plantuml";
    if (line.startsWith("%%")) continue; // Mermaid comment or %%{init}%% directive
    if (line.startsWith("'") || line.startsWith("/'")) return "plantuml";
    if (line.startsWith("//")) continue; // DOT comment
    if (line.startsWith("/*")) {
      inBlockComment = !line.includes("*/", 2);
      continue;
    }
    if (dotStart.test(line)) return "graphviz";
    if (mermaidStart.test(line)) return "mermaid";
    return null;
  }
  return null;
}

/** Short name of the diagram type for the status bar, e.g. "sequence" or "gantt". */
export function diagramKind(code: string, engine: Engine): string {
  if (engine === "plantuml") {
    const m = code.match(/@start(\w+)/);
    if (!m) return "";
    return m[1] === "uml" ? "" : m[1];
  }
  if (engine === "graphviz") {
    const layout = code.match(/\blayout\s*=\s*"?(\w+)/)?.[1];
    if (layout && layout !== "dot") return layout;
    return code.match(/^\s*(?:strict\s+)?(digraph|graph)\b/im)?.[1].toLowerCase() ?? "";
  }
  for (const raw of code.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("%%") || line === "---") continue;
    const m = line.match(mermaidStart);
    if (m) return m[1].replace(/-(beta|v2)$/, "");
  }
  return "";
}
