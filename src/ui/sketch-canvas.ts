// The sketch canvas: drawing tools over the preview. Every change is written
// back to the editor as sketch text, so the text stays the single source of
// truth and undo, saving and sharing need nothing extra.

import type { DiagramEditor } from "../editor/editor";
import {
  nextId,
  parseSketch,
  serializeElement,
  type End,
  type LinkEl,
  type PenEl,
  type Point,
  type ShapeEl,
  type ShapeKind,
  type Sketch,
  type SketchEl,
} from "../engines/sketch/model";
import { drawSketch, keyOf, linkEnds, shapeBox, shapeMap } from "../engines/sketch/render";
import type { SketchStyle } from "../engines/types";
import { h, isMac } from "../lib/dom";
import type { Preview, PreviewTool } from "../preview";

type Tool = "select" | "box" | "ellipse" | "diamond" | "arrow" | "line" | "text" | "pen";

const TOOLS: { tool: Tool; key: string; label: string; icon: string }[] = [
  { tool: "select", key: "v", label: "Select and move", icon: '<path d="M6 4l12 7-5.5 1.5L10 18z"/>' },
  { tool: "box", key: "r", label: "Box", icon: '<rect x="4" y="6" width="16" height="12" rx="1"/>' },
  { tool: "ellipse", key: "o", label: "Ellipse", icon: '<ellipse cx="12" cy="12" rx="8.5" ry="6"/>' },
  { tool: "diamond", key: "d", label: "Diamond", icon: '<path d="M12 4l8 8-8 8-8-8z"/>' },
  { tool: "arrow", key: "a", label: "Arrow", icon: '<path d="M5 19L19 5M11 5h8v8"/>' },
  { tool: "line", key: "l", label: "Line", icon: '<path d="M5 19L19 5"/>' },
  { tool: "text", key: "t", label: "Text", icon: '<path d="M6 6h12M12 6v13"/>' },
  { tool: "pen", key: "p", label: "Pen", icon: '<path d="M4 20l1-4L16 5l3 3L8 19z"/>' },
];

const DEFAULT_SIZE: Record<Exclude<ShapeKind, "text">, { w: number; h: number }> = {
  box: { w: 140, h: 70 },
  ellipse: { w: 120, h: 70 },
  diamond: { w: 120, h: 80 },
};

const GRID = 10;
const snap = (v: number, free: boolean) => (free ? Math.round(v) : Math.round(v / GRID) * GRID);

type Gesture =
  | { kind: "move"; last: Point; moved: boolean }
  | { kind: "resize"; key: string; corner: string; orig: { x: number; y: number; w: number; h: number }; start: Point }
  | { kind: "create"; el: ShapeEl; start: Point }
  | { kind: "link"; el: LinkEl; start: Point }
  | { kind: "end"; el: LinkEl; end: "from" | "to" }
  | { kind: "pen"; el: PenEl };

export interface SketchCanvasOptions {
  pane: HTMLElement;
  preview: Preview;
  editor: DiagramEditor;
  look(): { dark: boolean; style: SketchStyle };
  show(svg: string): void;
}

export class SketchCanvas implements PreviewTool {
  private active = false;
  private tool: Tool = "select";
  private model: Sketch | null = null;
  private code = "";
  private selected = new Set<string>();
  private dirty = new Set<SketchEl>();
  private gesture: Gesture | null = null;
  private bar: HTMLElement;
  private input: HTMLTextAreaElement | null = null;
  private lastDown: { t: number; x: number; y: number } | null = null;

  constructor(private o: SketchCanvasOptions) {
    const shortcut = (k: string) => k.toUpperCase();
    this.bar = h(
      "div",
      { class: "sketch-tools", role: "toolbar", "aria-label": "Drawing tools", hidden: "" },
      ...TOOLS.map((t) => {
        const button = h("button", {
          type: "button",
          class: "sketch-tool",
          "data-tool": t.tool,
          "aria-label": `${t.label} (${shortcut(t.key)})`,
          title: `${t.label} (${shortcut(t.key)})`,
          "aria-pressed": String(t.tool === this.tool),
          onclick: () => this.setTool(t.tool),
        });
        // Fixed markup from TOOLS above, not user input.
        button.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${t.icon}</svg>`;
        return button;
      }),
    );
    o.pane.append(this.bar);
  }

  get isActive() {
    return this.active;
  }

  activate() {
    if (this.active) return;
    this.active = true;
    this.bar.hidden = false;
    this.o.pane.dataset.sketchTool = this.tool;
    this.o.preview.setTool(this);
  }

  deactivate() {
    if (!this.active) return;
    this.active = false;
    this.bar.hidden = true;
    delete this.o.pane.dataset.sketchTool;
    this.closeInput(false);
    this.selected.clear();
    this.gesture = null;
    this.o.preview.setTool(null);
  }

  /** The canvas version of a successful render: grid, hit areas, selection. */
  display(code: string): string | null {
    if (this.gesture) return null;
    try {
      this.model = parseSketch(code);
    } catch {
      this.model = null;
      return null;
    }
    this.code = code;
    this.dirty.clear();
    const keys = new Set(this.model.elements.map(keyOf));
    for (const k of this.selected) if (!keys.has(k)) this.selected.delete(k);
    return this.render();
  }

  private render(): string {
    return drawSketch(this.model!, { ...this.o.look(), interactive: true, selected: this.selected });
  }

  private redraw() {
    if (this.model) this.o.show(this.render());
  }

  private setTool(tool: Tool) {
    this.tool = tool;
    for (const b of this.bar.querySelectorAll<HTMLButtonElement>("button")) {
      b.setAttribute("aria-pressed", String(b.dataset.tool === tool));
    }
    this.o.pane.dataset.sketchTool = tool;
    if (tool !== "select") {
      this.selected.clear();
      this.redraw();
    }
  }

  /** Write the model back as text. Lines not touched keep their own formatting. */
  private commit() {
    if (!this.model) return;
    const original = this.code.split(/\r\n|\r|\n/);
    const lines = ["sketch"];
    for (const el of this.model.elements) {
      lines.push(!this.dirty.has(el) && el.line ? original[el.line - 1] : serializeElement(el));
    }
    const text = lines.join("\n") + "\n";
    this.o.editor.applyText(text);
    // Re-read so line numbers match the new text.
    this.display(text);
    this.redraw();
  }

  private elementAt(target: EventTarget | null): { el: SketchEl; key: string } | null {
    const node = (target as Element | null)?.closest?.("[data-sketch-key]");
    const key = node?.getAttribute("data-sketch-key");
    if (!key || !this.model) return null;
    const index = this.model.elements.findIndex((el, i) => keyOf(el, i) === key);
    return index < 0 ? null : { el: this.model.elements[index], key };
  }

  /** Topmost shape whose box contains the point. */
  private shapeAt(p: Point, except?: string): ShapeEl | null {
    if (!this.model) return null;
    for (let i = this.model.elements.length - 1; i >= 0; i--) {
      const el = this.model.elements[i];
      if (el.type !== "shape" || el.id === except) continue;
      const b = shapeBox(el);
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return el;
    }
    return null;
  }

  // -- Pointer input, called by the preview -------------------------------

  down(e: PointerEvent, at: Point): boolean {
    if (!this.model || e.button !== 0) return false;
    this.closeInput(true);
    const free = e.altKey;
    // Pointer capture hides the real target from dblclick, so spot it here.
    const now = performance.now();
    const double = this.lastDown && now - this.lastDown.t < 450 && Math.hypot(e.clientX - this.lastDown.x, e.clientY - this.lastDown.y) < 6;
    this.lastDown = double || this.tool !== "select" ? null : { t: now, x: e.clientX, y: e.clientY };
    if (double && this.tool === "select") {
      this.doubleClick(e, at);
      return true;
    }
    if (this.tool === "select") {
      const handle = (e.target as Element).closest?.("[data-sketch-handle]")?.getAttribute("data-sketch-handle");
      const [key] = [...this.selected];
      const selectedEl = key ? this.model.elements.find((el, i) => keyOf(el, i) === key) : undefined;
      if (handle && selectedEl) {
        if (selectedEl.type === "shape") {
          this.gesture = { kind: "resize", key, corner: handle, orig: { ...shapeBox(selectedEl) }, start: at };
          return true;
        }
        if (selectedEl.type === "link" && (handle === "from" || handle === "to")) {
          this.gesture = { kind: "end", el: selectedEl, end: handle };
          return true;
        }
      }
      const hit = this.elementAt(e.target);
      if (!hit) {
        if (this.selected.size) {
          this.selected.clear();
          this.redraw();
        }
        return false; // let the preview pan
      }
      if (e.shiftKey) {
        if (this.selected.has(hit.key)) this.selected.delete(hit.key);
        else this.selected.add(hit.key);
      } else if (!this.selected.has(hit.key)) {
        this.selected = new Set([hit.key]);
      }
      this.gesture = { kind: "move", last: at, moved: false };
      this.redraw();
      return true;
    }

    const start = { x: snap(at.x, free), y: snap(at.y, free) };
    if (this.tool === "pen") {
      const el: PenEl = { type: "pen", points: [at], style: {} };
      this.model.elements.push(el);
      this.dirty.add(el);
      this.gesture = { kind: "pen", el };
      return true;
    }
    if (this.tool === "arrow" || this.tool === "line") {
      const from = this.shapeAt(at);
      const el: LinkEl = {
        type: "link",
        kind: this.tool,
        from: from ? { id: from.id } : start,
        to: { ...start },
        label: "",
        heads: this.tool === "arrow" ? "end" : "none",
        style: {},
      };
      this.model.elements.push(el);
      this.dirty.add(el);
      this.gesture = { kind: "link", el, start };
      return true;
    }
    if (this.tool === "text") {
      const el: ShapeEl = { type: "shape", kind: "text", id: nextId(this.model, "text"), x: start.x, y: start.y, w: 0, h: 0, label: "", style: {} };
      this.model.elements.push(el);
      this.dirty.add(el);
      this.selected = new Set([el.id]);
      this.redraw();
      this.editLabel(el);
      this.setTool("select");
      return true;
    }
    const kind = this.tool;
    const el: ShapeEl = { type: "shape", kind, id: nextId(this.model, kind), x: start.x, y: start.y, w: 1, h: 1, label: "", style: kind === "box" ? { round: true } : {} };
    this.model.elements.push(el);
    this.dirty.add(el);
    this.gesture = { kind: "create", el, start };
    return true;
  }

  move(e: PointerEvent, at: Point) {
    // A press that turned into a drag isn't half of a double-click.
    if (this.lastDown && Math.hypot(e.clientX - this.lastDown.x, e.clientY - this.lastDown.y) > 6) this.lastDown = null;
    const g = this.gesture;
    if (!g || !this.model) return;
    const free = e.altKey;
    switch (g.kind) {
      case "move": {
        const dx = at.x - g.last.x;
        const dy = at.y - g.last.y;
        if (!g.moved && Math.hypot(dx, dy) < 3) return;
        g.moved = true;
        g.last = at;
        this.translateSelected(dx, dy);
        break;
      }
      case "resize": {
        const el = this.model.elements.find((x, i) => keyOf(x, i) === g.key) as ShapeEl | undefined;
        if (!el) return;
        const { orig } = g;
        let x1 = orig.x;
        let y1 = orig.y;
        let x2 = orig.x + orig.w;
        let y2 = orig.y + orig.h;
        if (g.corner.includes("w")) x1 = snap(at.x, free);
        if (g.corner.includes("e")) x2 = snap(at.x, free);
        if (g.corner.includes("n")) y1 = snap(at.y, free);
        if (g.corner.includes("s")) y2 = snap(at.y, free);
        el.x = Math.min(x1, x2);
        el.y = Math.min(y1, y2);
        el.w = Math.max(20, Math.abs(x2 - x1));
        el.h = Math.max(20, Math.abs(y2 - y1));
        this.dirty.add(el);
        break;
      }
      case "create": {
        const x2 = snap(at.x, free);
        const y2 = snap(at.y, free);
        g.el.x = Math.min(g.start.x, x2);
        g.el.y = Math.min(g.start.y, y2);
        g.el.w = Math.max(1, Math.abs(x2 - g.start.x));
        g.el.h = Math.max(1, Math.abs(y2 - g.start.y));
        break;
      }
      case "link":
        g.el.to = { x: snap(at.x, free), y: snap(at.y, free) };
        break;
      case "end":
        g.el[g.end] = { x: snap(at.x, free), y: snap(at.y, free) };
        this.dirty.add(g.el);
        break;
      case "pen": {
        const last = g.el.points[g.el.points.length - 1];
        if (Math.hypot(at.x - last.x, at.y - last.y) >= 3) g.el.points.push({ x: at.x, y: at.y });
        break;
      }
    }
    this.redraw();
  }

  up(_e: PointerEvent, at: Point) {
    const g = this.gesture;
    this.gesture = null;
    if (!g || !this.model) return;
    switch (g.kind) {
      case "move":
        if (g.moved) this.commit();
        return;
      case "resize":
        this.commit();
        return;
      case "create": {
        const el = g.el;
        if (el.w < 12 && el.h < 12 && el.kind !== "text") {
          // A click: drop a shape of the usual size there.
          const size = DEFAULT_SIZE[el.kind as Exclude<ShapeKind, "text">];
          el.w = size.w;
          el.h = size.h;
          el.x = g.start.x - size.w / 2;
          el.y = g.start.y - size.h / 2;
        }
        this.selected = new Set([el.id]);
        this.setTool("select");
        this.commit();
        return;
      }
      case "link": {
        const target = this.shapeAt(at, "id" in g.el.from ? g.el.from.id : undefined);
        if (target) g.el.to = { id: target.id };
        const [a, b] = linkEnds(g.el, shapeMap(this.model));
        if (Math.hypot(b.x - a.x, b.y - a.y) < 8) {
          this.model.elements.pop();
          this.redraw();
          return;
        }
        this.selected = new Set([keyOf(g.el, this.model.elements.length - 1)]);
        this.setTool("select");
        this.commit();
        return;
      }
      case "end": {
        const other = g.el[g.end === "from" ? "to" : "from"];
        const target = this.shapeAt(at, "id" in other ? other.id : undefined);
        if (target) g.el[g.end] = { id: target.id };
        this.commit();
        return;
      }
      case "pen":
        if (g.el.points.length < 2) {
          this.model.elements.pop();
          this.redraw();
          return;
        }
        g.el.points = simplify(g.el.points);
        this.commit();
        return;
    }
  }

  private doubleClick(e: PointerEvent, at: Point) {
    if (!this.model) return;
    const hit = this.elementAt(e.target);
    if (hit && (hit.el.type === "shape" || hit.el.type === "link")) {
      this.selected = new Set([hit.key]);
      this.redraw();
      this.editLabel(hit.el);
      return;
    }
    if (!hit && this.tool === "select") {
      const el: ShapeEl = { type: "shape", kind: "text", id: nextId(this.model, "text"), x: snap(at.x, false), y: snap(at.y, false), w: 0, h: 0, label: "", style: {} };
      this.model.elements.push(el);
      this.dirty.add(el);
      this.selected = new Set([el.id]);
      this.redraw();
      this.editLabel(el);
    }
  }

  key(e: KeyboardEvent): boolean {
    if (!this.model || this.input) return false;
    const mod = isMac ? e.metaKey : e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && k === "z") {
      if (e.shiftKey) this.o.editor.redo();
      else this.o.editor.undo();
      return true;
    }
    if (mod && k === "y") {
      this.o.editor.redo();
      return true;
    }
    if (mod && k === "a") {
      this.selected = new Set(this.model.elements.filter((el) => el.type !== "comment").map(keyOf));
      this.redraw();
      return true;
    }
    if (mod && k === "d" && this.selected.size) {
      this.duplicate();
      return true;
    }
    if (mod || e.altKey) return false;
    if ((e.key === "Delete" || e.key === "Backspace") && this.selected.size) {
      this.deleteSelected();
      return true;
    }
    if (e.key === "Escape") {
      if (this.tool !== "select") this.setTool("select");
      this.selected.clear();
      this.redraw();
      return true;
    }
    if (e.key === "Enter" && this.selected.size === 1) {
      const [key] = this.selected;
      const el = this.model.elements.find((x, i) => keyOf(x, i) === key);
      if (el && (el.type === "shape" || el.type === "link")) this.editLabel(el);
      return true;
    }
    const step = e.shiftKey ? GRID : 1;
    const nudge: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (nudge[e.key] && this.selected.size) {
      this.translateSelected(...nudge[e.key]);
      this.commit();
      return true;
    }
    const tool = TOOLS.find((t) => t.key === k);
    if (tool && !e.shiftKey) {
      this.setTool(tool.tool);
      return true;
    }
    return false;
  }

  // -- Editing helpers -----------------------------------------------------

  private translateSelected(dx: number, dy: number) {
    if (!this.model) return;
    this.model.elements.forEach((el, i) => {
      if (!this.selected.has(keyOf(el, i))) return;
      this.dirty.add(el);
      if (el.type === "shape") {
        el.x += dx;
        el.y += dy;
      } else if (el.type === "pen") {
        for (const p of el.points) {
          p.x += dx;
          p.y += dy;
        }
      } else if (el.type === "link") {
        for (const end of [el.from, el.to]) {
          if (!("id" in end)) {
            end.x += dx;
            end.y += dy;
          }
        }
      }
    });
    // Finish on the grid once the drag is over.
    if (!this.gesture) {
      for (const el of this.model.elements) {
        if (el.type === "shape" && this.dirty.has(el)) {
          el.x = Math.round(el.x);
          el.y = Math.round(el.y);
        }
      }
    }
  }

  private deleteSelected() {
    if (!this.model) return;
    const shapes = shapeMap(this.model);
    const gone = new Set<string>();
    this.model.elements = this.model.elements.filter((el, i) => {
      const remove = this.selected.has(keyOf(el, i));
      if (remove && el.type === "shape") gone.add(el.id);
      return !remove;
    });
    // Lines attached to a deleted shape keep their position, unattached.
    for (const el of this.model.elements) {
      if (el.type !== "link") continue;
      const [a, b] = linkEnds(el, shapes);
      const fix = (end: End, p: Point): End => ("id" in end && gone.has(end.id) ? { x: Math.round(p.x), y: Math.round(p.y) } : end);
      const from = fix(el.from, a);
      const to = fix(el.to, b);
      if (from !== el.from || to !== el.to) {
        el.from = from;
        el.to = to;
        this.dirty.add(el);
      }
    }
    this.selected.clear();
    this.commit();
  }

  private duplicate() {
    if (!this.model) return;
    const copies: SketchEl[] = [];
    this.model.elements.forEach((el, i) => {
      if (!this.selected.has(keyOf(el, i)) || el.type === "comment") return;
      const copy = structuredClone(el) as SketchEl;
      if (copy.type === "shape") {
        copy.id = nextId({ elements: [...this.model!.elements, ...copies] }, copy.kind);
        copy.x += 20;
        copy.y += 20;
      } else if (copy.type === "pen") {
        for (const p of copy.points) {
          p.x += 20;
          p.y += 20;
        }
      } else if (copy.type === "link") {
        for (const end of [copy.from, copy.to]) {
          if (!("id" in end)) {
            end.x += 20;
            end.y += 20;
          }
        }
      }
      delete (copy as { line?: number }).line;
      copies.push(copy);
    });
    const start = this.model.elements.length;
    this.model.elements.push(...copies);
    for (const c of copies) this.dirty.add(c);
    this.selected = new Set(copies.map((c, i) => keyOf(c, start + i)));
    this.commit();
  }

  /** An inline text box over the element for its label. */
  private editLabel(el: ShapeEl | LinkEl) {
    this.closeInput(true);
    if (!this.model) return;
    let cx: number;
    let cy: number;
    if (el.type === "shape") {
      const b = shapeBox(el);
      cx = el.kind === "text" ? b.x : b.x + b.w / 2;
      cy = el.kind === "text" ? b.y : b.y + b.h / 2;
    } else {
      const [a, b] = linkEnds(el, shapeMap(this.model));
      cx = (a.x + b.x) / 2;
      cy = (a.y + b.y) / 2;
    }
    const pos = this.o.preview.toStage(cx, cy);
    const size = (el.style.size ?? (el.type === "link" ? 13 : el.kind === "text" ? 16 : 15)) * pos.scale;
    const input = h("textarea", {
      class: "sketch-label",
      rows: "1",
      spellcheck: "false",
      "aria-label": "Label",
    }) as HTMLTextAreaElement;
    input.value = el.label;
    input.style.fontSize = `${Math.max(11, size)}px`;
    const textStart = el.type === "shape" && el.kind === "text";
    input.style.left = `${pos.x}px`;
    input.style.top = `${pos.y}px`;
    input.dataset.anchor = textStart ? "start" : "middle";
    const fit = () => {
      input.style.height = "auto";
      input.style.height = `${input.scrollHeight}px`;
      input.style.width = `${Math.max(80, Math.max(...input.value.split("\n").map((l) => l.length)) * size * 0.6 + 24)}px`;
    };
    input.addEventListener("input", fit);
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") this.closeInput(false);
      else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.closeInput(true);
      }
    });
    input.addEventListener("blur", () => this.closeInput(true));
    (input as HTMLTextAreaElement & { sketchEl?: ShapeEl | LinkEl }).sketchEl = el;
    this.input = input;
    this.o.preview.stageElement.append(input);
    fit();
    input.focus();
    input.select();
  }

  private closeInput(save: boolean) {
    const input = this.input as (HTMLTextAreaElement & { sketchEl?: ShapeEl | LinkEl }) | null;
    if (!input) return;
    this.input = null;
    const el = input.sketchEl!;
    input.remove();
    this.o.preview.stageElement.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    if (!this.model) return;
    const value = input.value.replace(/\s+$/, "");
    if (save && value !== el.label) {
      el.label = value;
      this.dirty.add(el);
    }
    const index = this.model.elements.indexOf(el);
    if (el.type === "shape" && el.kind === "text" && !el.label) {
      // An empty text is removed rather than left invisible.
      if (index >= 0) this.model.elements.splice(index, 1);
      this.selected.clear();
      if (el.line) this.commit();
      else this.redraw();
      return;
    }
    if (this.dirty.has(el)) this.commit();
    else this.redraw();
  }
}

/** Drop pen points that add nothing, keeping strokes short in the text. */
export function simplify(points: Point[], tolerance = 1.5): Point[] {
  if (points.length <= 2) return points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1;
    let dist = tolerance;
    const pa = points[a];
    const pb = points[b];
    const len = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
    for (let i = a + 1; i < b; i++) {
      const p = points[i];
      const d = Math.abs((pb.y - pa.y) * p.x - (pb.x - pa.x) * p.y + pb.x * pa.y - pb.y * pa.x) / len;
      if (d > dist) {
        dist = d;
        best = i;
      }
    }
    if (best > 0) {
      keep[best] = true;
      stack.push([a, best], [best, b]);
    }
  }
  return points.filter((_, i) => keep[i]).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
}
