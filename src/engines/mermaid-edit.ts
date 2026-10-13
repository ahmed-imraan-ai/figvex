// Renaming a Mermaid flowchart node from the diagram: rewrites the text
// inside its shape brackets, or gives it some if it has none.

const OPENERS: [string, string[]][] = [
  ["(((", [")))"]],
  ["[[", ["]]"]],
  ["[(", [")]"]],
  ["[/", ["/]", "\\]"]],
  ["[\\", ["\\]", "/]"]],
  ["((", ["))"]],
  ["([", ["])"]],
  ["{{", ["}}"]],
  ["[", ["]"]],
  ["(", [")"]],
  ["{", ["}"]],
  [">", ["]"]],
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NOT_NODES = /^\s*(style|class|classDef|click|linkStyle|subgraph|direction|end|%%)\b/;

/** True for Mermaid flowcharts, the one Mermaid type renamed from the diagram. */
export function isFlowchart(code: string): boolean {
  for (const raw of code.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("%%")) continue;
    if (line === "---") return /^\s*(flowchart|graph)\b/m.test(code.split(/^---\s*$/m).slice(2).join("---"));
    return /^(flowchart|graph)\b/.test(line);
  }
  return false;
}

interface Shape {
  /** Offsets of the text between the brackets. */
  start: number;
  end: number;
  quoted: boolean;
}

/** The first place a node is given a shape, e.g. `A[Start]`. */
function findShape(code: string, id: string): Shape | null {
  const re = new RegExp(`(?<![\\w-])${escapeRe(id)}(?![\\w-])`, "g");
  for (let m = re.exec(code); m; m = re.exec(code)) {
    const lineStart = code.lastIndexOf("\n", m.index) + 1;
    if (NOT_NODES.test(code.slice(lineStart, m.index + 1))) continue;
    const after = m.index + m[0].length;
    const opener = OPENERS.find(([o]) => code.startsWith(o, after));
    if (!opener) continue;
    const [open, closers] = opener;
    const start = after + open.length;
    if (code[start] === '"') {
      const q = code.indexOf('"', start + 1);
      if (q < 0) return null;
      return { start, end: q + 1, quoted: true };
    }
    const ends = closers.map((c) => code.indexOf(c, start)).filter((i) => i >= 0);
    if (!ends.length) return null;
    return { start, end: Math.min(...ends), quoted: false };
  }
  return null;
}

/** The label a node shows: the text in its shape, or its id. */
export function mermaidLabel(code: string, id: string): string {
  const s = findShape(code, id);
  if (!s) return id;
  const text = code.slice(s.start, s.end);
  return (s.quoted ? text.slice(1, -1) : text).replace(/#quot;/g, '"').replace(/<br\s*\/?>/g, "\n");
}

/** Mermaid text for a label: bare when it's simple, quoted otherwise. */
function labelText(label: string, quoted: boolean): string {
  const text = label.replace(/\n/g, "<br>");
  if (!quoted && !/["[\](){}<>|#;]/.test(text)) return text;
  return `"${text.replace(/"/g, "#quot;")}"`;
}

/** Sets a node's label. A node without a shape gets square brackets. */
export function renameMermaidNode(code: string, id: string, label: string): string {
  const s = findShape(code, id);
  if (s) return code.slice(0, s.start) + labelText(label, s.quoted) + code.slice(s.end);
  // No shape yet: the first time the node appears in a link or on its own.
  const re = new RegExp(`(?<![\\w-])${escapeRe(id)}(?![\\w-])`, "g");
  for (let m = re.exec(code); m; m = re.exec(code)) {
    const lineStart = code.lastIndexOf("\n", m.index) + 1;
    const lineText = code.slice(lineStart, code.indexOf("\n", m.index) < 0 ? code.length : code.indexOf("\n", m.index));
    if (NOT_NODES.test(lineText) || /^\s*(flowchart|graph)\b/.test(lineText)) continue;
    const at = m.index + m[0].length;
    return `${code.slice(0, at)}[${labelText(label, false)}]${code.slice(at)}`;
  }
  return code;
}
