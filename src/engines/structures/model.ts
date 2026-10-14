// Pictures of data structures, one per line:
//
//   structures
//   array A = [3, 1, 4, 1, 5] mark 2 ptr i=0 j=4
//   matrix M = [[1, 0], [0, 1]]
//   stack S = [1, 2, 3]
//   queue Q = [a, b, c]
//   list L = 3 -> 1 -> 4        (<-> for doubly linked; add "circular")
//   tree T = 8(3(1, 6(4, 7)), 10(, 14(13)))
//   bst B = 8 3 10 1 6 14 4 7 13
//   heap H = [9, 5, 8, 1, 3]
//   hash H size 7 = 10, 22, 31, 4     (add "probe linear" or "probe quadratic")
//   graph G = A-B, B-C:4, C-A          (digraph with ->)

export type Kind = "array" | "matrix" | "stack" | "queue" | "list" | "tree" | "bst" | "heap" | "hash" | "graph" | "digraph";

export const KINDS: Kind[] = ["array", "matrix", "stack", "queue", "list", "tree", "bst", "heap", "hash", "graph", "digraph"];

export interface TreeNode {
  value: string;
  /** null keeps an empty slot, so a lone right child still sits on the right. */
  children: (TreeNode | null)[];
}

export interface Structure {
  kind: Kind;
  name: string;
  line: number;
  /** array, stack, queue, heap: the items. list: the nodes. */
  items: string[];
  rows?: string[][];
  tree?: TreeNode | null;
  doubly?: boolean;
  circular?: boolean;
  /** Items (by index, or by value for lists and trees) drawn highlighted. */
  marks: Set<string>;
  /** Named pointers to an index: i=0 j=4. */
  pointers: { name: string; at: number }[];
  hash?: { size: number; probe: "chain" | "linear" | "quadratic"; buckets: string[][]; overflow: string[] };
  graph?: { nodes: string[]; edges: { a: string; b: string; weight?: string }[] };
}

export interface StructuresDoc {
  title?: string;
  structures: Structure[];
  warnings: { message: string; line: number }[];
}

export class StructuresError extends Error {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(message);
  }
}

/** Splits at top-level commas, ignoring commas inside brackets and quotes. */
export function splitTop(text: string, sep = ","): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = "";
  let cur = "";
  for (const c of text) {
    if (quote) {
      if (c === quote) quote = "";
      cur += c;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    if (c === sep && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const unquote = (s: string) => s.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");

function list(text: string, line: number): string[] {
  const m = text.trim().match(/^\[(.*)\]$/s);
  if (!m) throw new StructuresError(`Write the items in square brackets: [1, 2, 3]`, line);
  return m[1].trim() ? splitTop(m[1]).map(unquote) : [];
}

/** Parses 8(3(1, 6), 10(, 14)): a value, then its children in brackets. */
export function parseTree(text: string, line: number): TreeNode | null {
  let i = 0;
  const s = text.trim();
  const node = (): TreeNode | null => {
    while (s[i] === " ") i++;
    let value = "";
    while (i < s.length && !"(),".includes(s[i])) value += s[i++];
    value = unquote(value.trim());
    if (!value && s[i] === "(") throw new StructuresError("Each bracket in the tree follows a value, as in 3(1, 6).", line);
    if (!value) return null;
    const children: (TreeNode | null)[] = [];
    if (s[i] === "(") {
      i++;
      for (;;) {
        children.push(node());
        while (s[i] === " ") i++;
        if (s[i] === ",") {
          i++;
          continue;
        }
        if (s[i] === ")") {
          i++;
          break;
        }
        throw new StructuresError("A bracket in the tree isn't closed. Add a ).", line);
      }
    }
    return { value, children };
  };
  const root = node();
  while (s[i] === " ") i++;
  if (i < s.length) throw new StructuresError(`Unexpected "${s[i]}" in the tree. Write it as value(left, right).`, line);
  return root;
}

const OPTION = /^(mark|ptr|circular|probe)\b/;
const OPTION_SPLIT = /\s+(?=(?:mark|ptr|circular|probe)\b)/;

/** Where the options start: the first option word outside brackets, after a space. */
function optionStart(body: string): number {
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (i > 0 && depth === 0 && /\s/.test(body[i - 1]) && OPTION.test(body.slice(i))) return i;
  }
  return -1;
}

const num = (v: string) => (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : NaN);

/** A binary search tree from values inserted in order. */
export function buildBst(values: string[]): TreeNode | null {
  let root: TreeNode | null = null;
  const numeric = values.every((v) => !Number.isNaN(num(v)));
  const less = (a: string, b: string) => (numeric ? num(a) < num(b) : a < b);
  for (const v of values) {
    const fresh: TreeNode = { value: v, children: [null, null] };
    if (!root) {
      root = fresh;
      continue;
    }
    let at: TreeNode = root;
    for (;;) {
      const side = less(v, at.value) ? 0 : 1;
      const next = at.children[side];
      if (!next) {
        at.children[side] = fresh;
        break;
      }
      at = next;
    }
  }
  const trim = (n: TreeNode | null): TreeNode | null => {
    if (!n) return null;
    const kids = n.children.map(trim);
    return { value: n.value, children: kids.every((k) => !k) ? [] : kids };
  };
  return trim(root);
}

/** A complete binary tree from an array, as a heap is stored. */
export function heapTree(items: string[], i = 0): TreeNode | null {
  if (i >= items.length) return null;
  const l = heapTree(items, 2 * i + 1);
  const r = heapTree(items, 2 * i + 2);
  return { value: items[i], children: l || r ? [l, r] : [] };
}

/** The bucket for a key: the number itself, or the sum of its character codes, mod size. */
export function hashOf(key: string, size: number): number {
  const n = num(key);
  const h = Number.isNaN(n) ? [...key].reduce((s, c) => s + c.codePointAt(0)!, 0) : Math.trunc(n);
  return ((h % size) + size) % size;
}

export function parseStructures(src: string): StructuresDoc {
  const doc: StructuresDoc = { structures: [], warnings: [] };
  let header = false;
  src.split(/\r?\n/).forEach((raw, k) => {
    const line = k + 1;
    const text = raw.replace(/(^|\s)(#|\/\/).*$/, "").trim();
    if (!text) return;
    if (!header) {
      if (text !== "structures") throw new StructuresError('Data structure pictures start with the word "structures" on the first line.', line);
      header = true;
      return;
    }
    const title = text.match(/^title\s+(.*)$/);
    if (title) {
      doc.title = unquote(title[1].trim()) || undefined;
      return;
    }
    const m = text.match(/^(\w+)\s+([\w.-]+)(?:\s+size\s+(\d+))?\s*=\s*(.+)$/);
    if (!m) throw new StructuresError("Write a structure as kind Name = value, for example: array A = [1, 2, 3]", line);
    const kind = m[1] as Kind;
    if (!KINDS.includes(kind)) throw new StructuresError(`"${m[1]}" isn't a structure. Use ${KINDS.join(", ")}.`, line);
    if (doc.structures.some((s) => s.name === m[2])) throw new StructuresError(`${m[2]} is defined twice.`, line);
    let body = m[4].trim();
    // Options at the end: mark, ptr, circular, probe.
    const marks = new Set<string>();
    const pointers: Structure["pointers"] = [];
    let circular = false;
    let probe: "chain" | "linear" | "quadratic" = "chain";
    const at = optionStart(body);
    const options = at >= 0 ? body.slice(at).trim() : "";
    if (at >= 0) body = body.slice(0, at).trim();
    for (const o of options ? options.split(OPTION_SPLIT) : []) {
      const [word, ...rest] = o.trim().split(/\s+/);
      const value = rest.join(" ");
      if (word === "mark") for (const v of splitTop(value)) marks.add(unquote(v));
      else if (word === "ptr")
        for (const p of rest) {
          const pm = p.match(/^(\w+)=(\d+)$/);
          if (!pm) throw new StructuresError(`Write pointers as name=index, for example ptr i=0 j=4.`, line);
          pointers.push({ name: pm[1], at: Number(pm[2]) });
        }
      else if (word === "circular") circular = true;
      else if (word === "probe") {
        if (!["linear", "quadratic", "chain"].includes(value)) throw new StructuresError("probe is linear, quadratic or chain.", line);
        probe = value as typeof probe;
      }
    }
    const s: Structure = { kind, name: m[2], line, items: [], marks, pointers, circular };
    if (m[3] && kind !== "hash") throw new StructuresError("Only a hash table takes a size.", line);
    switch (kind) {
      case "array":
      case "stack":
      case "queue":
      case "heap":
        s.items = list(body, line);
        if (kind === "heap") {
          s.tree = heapTree(s.items);
          const nums = s.items.map(num);
          if (nums.every((x) => !Number.isNaN(x)) && nums.length > 1) {
            const isMax = nums.every((x, i) => i === 0 || nums[Math.floor((i - 1) / 2)] >= x);
            const isMin = nums.every((x, i) => i === 0 || nums[Math.floor((i - 1) / 2)] <= x);
            if (!isMax && !isMin) doc.warnings.push({ message: `${s.name} isn't a heap: some parent is smaller than one child and larger than another.`, line });
          }
        }
        for (const p of pointers) if (p.at < 0 || p.at >= Math.max(1, s.items.length) + 1) doc.warnings.push({ message: `Pointer ${p.name}=${p.at} is past the end of ${s.name}.`, line });
        break;
      case "matrix": {
        const rows = list(body, line);
        s.rows = rows.map((r) => list(r, line));
        break;
      }
      case "list": {
        s.doubly = body.includes("<->");
        s.items = body.split(/\s*<?->\s*/).map((v) => unquote(v.trim())).filter((v) => v !== "");
        if (s.items.at(-1)?.toLowerCase() === "null") s.items.pop();
        break;
      }
      case "tree":
        s.tree = parseTree(body, line);
        break;
      case "bst": {
        const values = body.split(/[\s,]+/).filter(Boolean).map(unquote);
        s.items = values;
        s.tree = buildBst(values);
        break;
      }
      case "hash": {
        const size = Number(m[3] ?? 0);
        if (!size) throw new StructuresError("Give a hash table a size: hash H size 7 = 10, 22, 31", line);
        const keys = splitTop(body).map(unquote).filter(Boolean);
        const buckets: string[][] = [...Array(size)].map(() => []);
        const overflow: string[] = [];
        for (const key of keys) {
          const h = hashOf(key, size);
          if (probe === "chain") {
            buckets[h].push(key);
            continue;
          }
          let placed = false;
          for (let i = 0; i < size; i++) {
            const at = (h + (probe === "linear" ? i : i * i)) % size;
            if (!buckets[at].length) {
              buckets[at].push(key);
              placed = true;
              break;
            }
          }
          if (!placed) overflow.push(key);
        }
        if (overflow.length) doc.warnings.push({ message: `No free slot for ${overflow.join(", ")}: the table is full or the probe sequence misses the free slots.`, line });
        s.items = keys;
        s.hash = { size, probe, buckets, overflow };
        break;
      }
      case "graph":
      case "digraph": {
        const nodes: string[] = [];
        const edges: { a: string; b: string; weight?: string }[] = [];
        const see = (n: string) => !nodes.includes(n) && nodes.push(n);
        for (const part of splitTop(body)) {
          if (!part) continue;
          const e = part.match(/^(.+?)\s*(->|--|-)\s*(.+?)(?::\s*(.+))?$/);
          if (!e) {
            see(unquote(part));
            continue;
          }
          if (kind === "graph" && e[2] === "->") throw new StructuresError("Use - between nodes in a graph, or make it a digraph for arrows.", line);
          const a = unquote(e[1].trim());
          const b = unquote(e[3].trim());
          see(a);
          see(b);
          edges.push({ a, b, weight: e[4]?.trim() });
        }
        s.graph = { nodes, edges };
        break;
      }
    }
    doc.structures.push(s);
  });
  if (!header) throw new StructuresError('Data structure pictures start with the word "structures" on the first line.');
  if (!doc.structures.length) throw new StructuresError("Add a structure, for example: array A = [1, 2, 3]");
  return doc;
}
