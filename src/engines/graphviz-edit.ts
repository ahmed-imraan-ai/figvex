// Renaming a Graphviz node from the diagram: sets its label in the DOT text.

const BARE_ID = /^(?:[A-Za-z_\u0080-￿][\w\u0080-￿]*|-?(?:\.\d+|\d+(?:\.\d*)?))$/;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const quoteDot = (s: string) => `"${s.replace(/"/g, '\\"')}"`;

/** Index just past a quoted string or <HTML> value starting at `i`. */
function skipValue(text: string, i: number): number {
  if (text[i] === '"') {
    for (let j = i + 1; j < text.length; j++) {
      if (text[j] === "\\") j++;
      else if (text[j] === '"') return j + 1;
    }
    return text.length;
  }
  if (text[i] === "<") {
    let depth = 0;
    for (let j = i; j < text.length; j++) {
      if (text[j] === "<") depth++;
      else if (text[j] === ">" && --depth === 0) return j + 1;
    }
    return text.length;
  }
  const m = text.slice(i).match(/^[^\s,;\]]*/)!;
  return i + m[0].length;
}

/** Index of the "]" that closes the attribute list opened at `open`. */
function closeBracket(text: string, open: number): number {
  for (let i = open + 1; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "<") i = skipValue(text, i) - 1;
    else if (c === "]") return i;
  }
  return -1;
}

/** The label a node shows: its label attribute if it has one, otherwise its id. */
export function dotLabel(code: string, id: string): string {
  const stmt = findNodeStatement(code, id);
  if (stmt) {
    const attrs = code.slice(stmt.open + 1, stmt.close);
    const m = attrs.match(/(?<![\w])label\s*=\s*/);
    if (m) {
      const start = m.index! + m[0].length;
      const raw = attrs.slice(start, skipValue(attrs, start));
      if (raw.startsWith('"')) return raw.slice(1, -1).replace(/\\"/g, '"');
      if (!raw.startsWith("<")) return raw;
    }
  }
  return id;
}

/** The first `id [ ... ]` node statement, as offsets of its brackets. */
function findNodeStatement(code: string, id: string): { open: number; close: number } | null {
  const ids = BARE_ID.test(id) ? `(?:${escapeRe(id)}|${escapeRe(quoteDot(id))})` : escapeRe(quoteDot(id));
  const re = new RegExp(`(^|[;{])[ \\t]*${ids}[ \\t]*\\[`, "gm");
  for (let m = re.exec(code); m; m = re.exec(code)) {
    const open = m.index + m[0].length - 1;
    const close = closeBracket(code, open);
    if (close > 0) return { open, close };
  }
  return null;
}

/** Sets a node's label, adding a statement for it if it has none. */
export function renameDotNode(code: string, id: string, label: string): string {
  const value = quoteDot(label);
  const stmt = findNodeStatement(code, id);
  if (stmt) {
    const attrs = code.slice(stmt.open + 1, stmt.close);
    const m = attrs.match(/(?<![\w])label\s*=\s*/);
    let next: string;
    if (m) {
      const start = m.index! + m[0].length;
      next = attrs.slice(0, start) + value + attrs.slice(skipValue(attrs, start));
    } else {
      next = attrs.trim() ? `label=${value} ${attrs.replace(/^\s+/, "")}` : `label=${value}`;
    }
    return code.slice(0, stmt.open + 1) + next + code.slice(stmt.close);
  }
  // Added at the end, so node defaults set earlier in the file still apply.
  const close = code.lastIndexOf("}");
  if (close < 0) return code;
  const nodeId = BARE_ID.test(id) ? id : quoteDot(id);
  const before = code.slice(0, close).replace(/[ \t]*$/, "");
  const sep = before.endsWith("\n") ? "" : "\n";
  return `${before}${sep}  ${nodeId} [label=${value}]\n${code.slice(close)}`;
}
