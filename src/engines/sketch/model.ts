// The sketch format: one shape per line, written by the canvas and readable
// by hand. The first line is the word "sketch".
//
//   sketch
//   # comments start with #
//   box login 40 40 160 80 "Login page" round fill=#fde68a
//   ellipse user 260 60 120 60 "User"
//   diamond ok 260 200 120 80 "Valid?"
//   text note 40 160 "Notes go here" size=18
//   arrow user -> login "signs in" dashed
//   line 40,300 -> 200,300
//   pen 10,10 12,14 18,20
//
// Arrow and line ends are a shape id (the line follows the shape) or x,y.

export type ShapeKind = "box" | "ellipse" | "diamond" | "text";
export type LinkKind = "arrow" | "line";

export interface Style {
  fill?: string;
  stroke?: string;
  /** Stroke width. */
  width?: number;
  /** Text size. */
  size?: number;
  dashed?: boolean;
  round?: boolean;
  bold?: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export type End = { id: string } | Point;

export interface ShapeEl {
  type: "shape";
  kind: ShapeKind;
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  style: Style;
  line?: number;
}

export interface LinkEl {
  type: "link";
  kind: LinkKind;
  id?: string;
  from: End;
  to: End;
  label: string;
  /** Arrow heads: "end" (default for arrow), "both" or "none". */
  heads: "end" | "both" | "none";
  style: Style;
  line?: number;
}

export interface PenEl {
  type: "pen";
  id?: string;
  points: Point[];
  style: Style;
  line?: number;
}

export interface CommentEl {
  type: "comment";
  text: string;
  line?: number;
}

export type SketchEl = ShapeEl | LinkEl | PenEl | CommentEl;

export interface Sketch {
  elements: SketchEl[];
}

export class SketchError extends Error {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(message);
  }
}

const SHAPES = new Set(["box", "ellipse", "diamond", "text"]);
const LINKS = new Set(["arrow", "line"]);
const FLAGS = new Set(["dashed", "round", "bold"]);
const COLOR = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/;

/** Split a line into words, keeping "quoted strings" (with \" and \n) together. */
export function tokenize(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (/\s/.test(line[i])) {
      i++;
      continue;
    }
    if (line[i] === '"') {
      let s = "";
      i++;
      while (i < line.length && line[i] !== '"') {
        if (line[i] === "\\" && i + 1 < line.length) {
          const c = line[i + 1];
          s += c === "n" ? "\n" : c;
          i += 2;
        } else {
          s += line[i++];
        }
      }
      i++;
      out.push(`"${s}`); // a leading quote marks a string token
      continue;
    }
    let s = "";
    while (i < line.length && !/\s/.test(line[i])) s += line[i++];
    out.push(s);
  }
  return out;
}

const isString = (t: string | undefined) => t !== undefined && t.startsWith('"');
const isNumber = (t: string | undefined) => t !== undefined && /^-?\d+(\.\d+)?$/.test(t);
const isPoint = (t: string | undefined) => t !== undefined && /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(t);
const isId = (t: string | undefined) => t !== undefined && /^[A-Za-z_][\w-]*$/.test(t);

function parsePoint(t: string): Point {
  const [x, y] = t.split(",").map(Number);
  return { x, y };
}

function parseStyle(tokens: string[], line: number): Style {
  const style: Style = {};
  for (const t of tokens) {
    if (FLAGS.has(t)) {
      style[t as "dashed" | "round" | "bold"] = true;
      continue;
    }
    const m = t.match(/^(fill|stroke|width|size)=(.+)$/);
    if (!m) throw new SketchError(`"${t.replace(/^"/, "")}" isn't an option here. Options are fill=, stroke=, width=, size=, dashed, round and bold.`, line);
    const [, key, value] = m;
    if (key === "fill" || key === "stroke") {
      if (!COLOR.test(value)) throw new SketchError(`"${value}" isn't a colour. Use a name like red or a hex code like #ff8800.`, line);
      style[key] = value;
    } else {
      const v = Number(value);
      if (!Number.isFinite(v) || v <= 0 || v > 200) throw new SketchError(`${key}= needs a positive number.`, line);
      style[key as "width" | "size"] = v;
    }
  }
  return style;
}

export function parseSketch(code: string): Sketch {
  const lines = code.split(/\r\n|\r|\n/);
  const elements: SketchEl[] = [];
  let header = false;
  let auto = 0;
  lines.forEach((raw, index) => {
    const line = index + 1;
    const text = raw.trim();
    if (!text) return;
    if (!header) {
      if (text !== "sketch") throw new SketchError('A sketch starts with the word "sketch" on its own line.', line);
      header = true;
      return;
    }
    if (text.startsWith("#")) {
      elements.push({ type: "comment", text: text.slice(1).trim(), line });
      return;
    }
    const tokens = tokenize(text);
    const kind = tokens.shift()!;
    if (SHAPES.has(kind)) {
      const id = isId(tokens[0]) ? tokens.shift()! : `_${++auto}`;
      const nums: number[] = [];
      const wanted = kind === "text" ? 2 : 4;
      while (nums.length < wanted && isNumber(tokens[0])) nums.push(Number(tokens.shift()));
      if (nums.length < wanted) {
        const form = kind === "text" ? "text id x y \"words\"" : `${kind} id x y width height "label"`;
        throw new SketchError(`Write a ${kind} as: ${form}`, line);
      }
      // A text's size is worked out from its words; extra numbers are accepted and ignored.
      while (kind === "text" && isNumber(tokens[0])) tokens.shift();
      const label = isString(tokens[0]) ? tokens.shift()!.slice(1) : "";
      const style = parseStyle(tokens, line);
      const [x, y, w = 0, h = 0] = nums;
      if (kind !== "text" && (w <= 0 || h <= 0)) throw new SketchError("Width and height must be more than 0.", line);
      elements.push({ type: "shape", kind: kind as ShapeKind, id, x, y, w, h, label, style, line });
      return;
    }
    if (LINKS.has(kind)) {
      const id = isId(tokens[0]) && tokens[1] !== "->" ? tokens.shift() : undefined;
      const from = tokens.shift();
      const arrow = tokens.shift();
      const to = tokens.shift();
      const end = (t: string | undefined): End | null => (isPoint(t) ? parsePoint(t!) : isId(t) ? { id: t! } : null);
      const a = end(from);
      const b = end(to);
      if (arrow !== "->" || !a || !b) {
        throw new SketchError(`Write ${kind === "arrow" ? "an arrow" : "a line"} as: ${kind} from -> to, where each end is a shape id or x,y.`, line);
      }
      const label = isString(tokens[0]) ? tokens.shift()!.slice(1) : "";
      let heads: LinkEl["heads"] = kind === "arrow" ? "end" : "none";
      const rest = tokens.filter((t) => {
        if (t === "both" || t === "none") {
          heads = t;
          return false;
        }
        return true;
      });
      elements.push({ type: "link", kind: kind as LinkKind, id, from: a, to: b, label, heads, style: parseStyle(rest, line), line });
      return;
    }
    if (kind === "pen") {
      const id = isId(tokens[0]) ? tokens.shift() : undefined;
      const points: Point[] = [];
      while (isPoint(tokens[0])) points.push(parsePoint(tokens.shift()!));
      if (points.length < 2) throw new SketchError("A pen stroke needs at least two points, written x,y x,y.", line);
      elements.push({ type: "pen", id, points, style: parseStyle(tokens, line), line });
      return;
    }
    throw new SketchError(`"${kind.replace(/^"/, "")}" isn't a sketch element. Use box, ellipse, diamond, text, arrow, line or pen.`, line);
  });
  if (!header) throw new SketchError('A sketch starts with the word "sketch" on its own line.', 1);

  const ids = new Set<string>();
  for (const el of elements) {
    if (el.type !== "shape") continue;
    if (ids.has(el.id)) throw new SketchError(`Two shapes are called "${el.id}". Ids must be unique.`, el.line);
    ids.add(el.id);
  }
  for (const el of elements) {
    if (el.type !== "link") continue;
    for (const end of [el.from, el.to]) {
      if ("id" in end && !ids.has(end.id)) throw new SketchError(`There's no shape called "${end.id}".`, el.line);
    }
  }
  return { elements };
}

const r = (v: number) => String(Math.round(v * 10) / 10);
const quote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;

function styleText(style: Style): string {
  const parts: string[] = [];
  if (style.round) parts.push("round");
  if (style.bold) parts.push("bold");
  if (style.dashed) parts.push("dashed");
  if (style.fill) parts.push(`fill=${style.fill}`);
  if (style.stroke) parts.push(`stroke=${style.stroke}`);
  if (style.width) parts.push(`width=${r(style.width)}`);
  if (style.size) parts.push(`size=${r(style.size)}`);
  return parts.join(" ");
}

const endText = (e: End) => ("id" in e ? e.id : `${r(e.x)},${r(e.y)}`);

export function serializeElement(el: SketchEl): string {
  const join = (...parts: string[]) => parts.filter(Boolean).join(" ");
  switch (el.type) {
    case "comment":
      return `# ${el.text}`.trimEnd();
    case "shape": {
      const id = el.id.startsWith("_") ? "" : el.id;
      const box = el.kind === "text" ? [r(el.x), r(el.y)] : [r(el.x), r(el.y), r(el.w), r(el.h)];
      return join(el.kind, id, ...box, el.label || el.kind === "text" ? quote(el.label) : "", styleText(el.style));
    }
    case "link": {
      const heads = el.kind === "arrow" ? (el.heads === "end" ? "" : el.heads) : el.heads === "none" ? "" : el.heads;
      return join(el.kind, el.id ?? "", endText(el.from), "->", endText(el.to), el.label ? quote(el.label) : "", heads, styleText(el.style));
    }
    case "pen":
      return join("pen", el.id ?? "", el.points.map((p) => `${r(p.x)},${r(p.y)}`).join(" "), styleText(el.style));
  }
}

export function serializeSketch(sketch: Sketch): string {
  return ["sketch", ...sketch.elements.map(serializeElement)].join("\n") + "\n";
}

/** A fresh id like "box3" that no shape uses yet. */
export function nextId(sketch: Sketch, base: string): string {
  const used = new Set(sketch.elements.flatMap((e) => (e.type === "shape" ? [e.id] : [])));
  for (let i = 1; ; i++) if (!used.has(`${base}${i}`)) return `${base}${i}`;
}
