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
  type Side,
  type Sketch,
  type SketchEl,
} from "../engines/sketch/model";
import { drawSketch, keyOf, linkEnds, shapeBox, shapeMap, sidePoint, SIDES } from "../engines/sketch/render";
import { align, alignSnap, distribute, edgeSnap, type Alignment, type Box, type Guides } from "../engines/sketch/snap";
import type { SketchStyle } from "../engines/types";
import { h, isMac } from "../lib/dom";
import type { Preview, PreviewTool } from "../preview";

type Tool = "select" | "box" | "ellipse" | "diamond" | "arrow" | "connector" | "line" | "text" | "pen";

const TOOLS: { tool: Tool; key: string; label: string; icon: string }[] = [
  { tool: "select", key: "v", label: "Select and move", icon: '<path d="M6 4l12 7-5.5 1.5L10 18z"/>' },
  { tool: "box", key: "r", label: "Box", icon: '<rect x="4" y="6" width="16" height="12" rx="1"/>' },
  { tool: "ellipse", key: "o", label: "Ellipse", icon: '<ellipse cx="12" cy="12" rx="8.5" ry="6"/>' },
  { tool: "diamond", key: "d", label: "Diamond", icon: '<path d="M12 4l8 8-8 8-8-8z"/>' },
  { tool: "arrow", key: "a", label: "Arrow", icon: '<path d="M5 19L19 5M11 5h8v8"/>' },
  { tool: "connector", key: "c", label: "Connector with right angles", icon: '<path d="M4 5h7v14h8M16 16l3 3-3 3"/>' },
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

/** Where an element was when a move started. */
type Snapshot = { x: number; y: number } | Point[] | [End, End];

type Gesture =
  | { kind: "move"; start: Point; moved: boolean; primary?: ShapeEl; orig: Map<SketchEl, Snapshot> }
  | { kind: "marquee"; start: Point }
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
  private guides: Guides | undefined;
  private target: { id: string; side?: Side } | undefined;
  private marquee: Box | undefined;
  /** Space is held: drags pan instead of selecting. */
  private space = false;
  private arrange: HTMLElement;
  private arrangeSignature = "";

  constructor(private o: SketchCanvasOptions) {
    window.addEventListener("keydown", (e) => {
      if (e.key === " " && this.active && e.target === o.preview.stageElement) {
        this.space = true;
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => {
      if (e.key === " ") this.space = false;
    });
    this.arrange = h("div", { class: "sketch-arrange", role: "toolbar", "aria-label": "Arrange", hidden: "" });
    o.pane.append(this.arrange);
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
    this.arrange.hidden = true;
    delete this.o.pane.dataset.sketchTool;
    this.closeInput(false);
    this.selected.clear();
    this.gesture = null;
    this.o.preview.setTool(null);
  }

  /** The canvas version of a successful render: grid, hit areas, selection. */
  display(code: string): string | null {
    if (this.gesture) return null;
    const input = this.input as (HTMLTextAreaElement & { sketchEl?: ShapeEl | LinkEl }) | null;
    const old = this.model;
    const editing = input?.sketchEl && old ? keyOf(input.sketchEl, old.elements.indexOf(input.sketchEl)) : undefined;
    try {
      this.model = parseSketch(code);
    } catch {
      this.model = null;
      return null;
    }
    // A render can land while a label is being typed; keep the text box on
    // the same element in the new model, or the label would be lost.
    if (input && editing) {
      const same = this.model.elements.find((el, i) => keyOf(el, i) === editing);
      if (same && (same.type === "shape" || same.type === "link")) input.sketchEl = same;
    }
    this.code = code;
    this.dirty.clear();
    const keys = new Set(this.model.elements.map(keyOf));
    for (const k of this.selected) if (!keys.has(k)) this.selected.delete(k);
    return this.render();
  }

  private render(): string {
    this.updateArrange();
    return drawSketch(this.model!, {
      ...this.o.look(),
      interactive: true,
      selected: this.selected,
      guides: this.guides,
      target: this.target,
      marquee: this.marquee,
    });
  }

  private redraw() {
    if (this.model) this.o.show(this.render());
  }

  /** Snapping distance in diagram units: about 7 screen pixels at any zoom. */
  private get tolerance() {
    return 7 / (this.o.preview.toStage(0, 0).scale || 1);
  }

  private selectedEls(): SketchEl[] {
    return this.model ? this.model.elements.filter((el, i) => this.selected.has(keyOf(el, i))) : [];
  }

  private selectedShapes(): ShapeEl[] {
    return this.selectedEls().filter((el): el is ShapeEl => el.type === "shape");
  }

  private selectedLinks(): LinkEl[] {
    return this.selectedEls().filter((el): el is LinkEl => el.type === "link");
  }

  /** Boxes of the shapes that aren't selected, for alignment guides. */
  private otherBoxes(except: Set<SketchEl>): Box[] {
    return (this.model?.elements ?? []).filter((el): el is ShapeEl => el.type === "shape" && !except.has(el)).map(shapeBox);
  }

  /** Align and distribute for several shapes; straight or elbow for lines. */
  private updateArrange() {
    const els = this.selectedEls();
    const shapes = els.filter((el): el is ShapeEl => el.type === "shape");
    const links = els.filter((el): el is LinkEl => el.type === "link");
    this.arrange.hidden = !!this.gesture || (shapes.length < 2 && !links.length);
    // Rebuild only when the set of buttons changes, so they stay clickable.
    const signature = `${Math.min(shapes.length, 3)}|${links.length ? links.every((l) => l.route === "elbow") : "-"}|${this.selected.size}`;
    if (signature === this.arrangeSignature) return;
    this.arrangeSignature = signature;
    const button =(label: string, icon: string, run: () => void, pressed?: boolean) => {
      const b = h("button", {
        type: "button",
        class: "sketch-tool",
        title: label,
        "aria-label": label,
        "aria-pressed": pressed === undefined ? false : String(pressed),
        onclick: run,
      });
      // Fixed icon markup below, not user input.
      b.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>`;
      return b;
    };
    const items: HTMLElement[] = [];
    if (shapes.length >= 2) {
      const a = (how: Alignment) => () => {
        const now = this.selectedShapes();
        this.arrangeShapes(now, align(now.map(shapeBox), how));
      };
      const spread = (axis: "x" | "y") => () => {
        const now = this.selectedShapes();
        this.arrangeShapes(now, distribute(now.map(shapeBox), axis));
      };
      items.push(
        button("Align left", '<path d="M4 3v18"/><rect x="7" y="6" width="10" height="4"/><rect x="7" y="14" width="6" height="4"/>', a("left")),
        button("Align centres", '<path d="M12 3v18"/><rect x="6" y="6" width="12" height="4"/><rect x="8" y="14" width="8" height="4"/>', a("center")),
        button("Align right", '<path d="M20 3v18"/><rect x="7" y="6" width="10" height="4"/><rect x="11" y="14" width="6" height="4"/>', a("right")),
        button("Align top", '<path d="M3 4h18"/><rect x="6" y="7" width="4" height="10"/><rect x="14" y="7" width="4" height="6"/>', a("top")),
        button("Align middles", '<path d="M3 12h18"/><rect x="6" y="6" width="4" height="12"/><rect x="14" y="8" width="4" height="8"/>', a("middle")),
        button("Align bottom", '<path d="M3 20h18"/><rect x="6" y="7" width="4" height="10"/><rect x="14" y="11" width="4" height="6"/>', a("bottom")),
      );
      if (shapes.length >= 3) {
        items.push(
          button("Space evenly across", '<path d="M3 4v16M21 4v16"/><rect x="9" y="8" width="6" height="8"/>', spread("x")),
          button("Space evenly down", '<path d="M4 3h16M4 21h16"/><rect x="8" y="9" width="8" height="6"/>', spread("y")),
        );
      }
    }
    if (links.length) {
      const elbow = links.every((l) => l.route === "elbow");
      items.push(
        button("Straight line (E)", '<path d="M5 19L19 5"/>', () => this.setRoute(this.selectedLinks(), "straight"), !elbow),
        button("Right-angle line (E)", '<path d="M5 19V12h14V5"/>', () => this.setRoute(this.selectedLinks(), "elbow"), elbow),
      );
    }
    this.arrange.replaceChildren(...items);
  }

  private arrangeShapes(shapes: ShapeEl[], boxes: Box[]) {
    shapes.forEach((el, i) => {
      el.x = Math.round(boxes[i].x);
      el.y = Math.round(boxes[i].y);
      this.dirty.add(el);
    });
    this.commit();
  }

  private setRoute(links: LinkEl[], route: LinkEl["route"]) {
    for (const l of links) {
      l.route = route;
      this.dirty.add(l);
    }
    this.commit();
  }

  /** The shape under a point, and the side whose connection point is close. */
  private attachAt(p: Point, except?: string): { id: string; side?: Side } | undefined {
    const shape = this.shapeAt(p, except, this.tolerance * 2);
    if (!shape || shape.kind === "text") return undefined;
    let side: Side | undefined;
    let best = this.tolerance * 2.2;
    for (const s of SIDES) {
      const q = sidePoint(shape, s, 0);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < best) {
        best = d;
        side = s;
      }
    }
    return { id: shape.id, side };
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

  /** Topmost shape whose box (grown by `margin`) contains the point. */
  private shapeAt(p: Point, except?: string, margin = 0): ShapeEl | null {
    if (!this.model) return null;
    for (let i = this.model.elements.length - 1; i >= 0; i--) {
      const el = this.model.elements[i];
      if (el.type !== "shape" || el.id === except) continue;
      const b = shapeBox(el);
      if (p.x >= b.x - margin && p.x <= b.x + b.w + margin && p.y >= b.y - margin && p.y <= b.y + b.h + margin) return el;
    }
    return null;
  }

  // -- Pointer input, called by the preview -------------------------------

  down(e: PointerEvent, at: Point): boolean {
    if (!this.model || e.button !== 0 || this.space) return false;
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
        if (!e.shiftKey && this.selected.size) this.selected.clear();
        // Touch drags on empty space pan; mouse drags draw a selection box.
        if (e.pointerType === "touch") {
          this.redraw();
          return false;
        }
        this.gesture = { kind: "marquee", start: at };
        this.redraw();
        return true;
      }
      if (e.shiftKey) {
        if (this.selected.has(hit.key)) this.selected.delete(hit.key);
        else this.selected.add(hit.key);
      } else if (!this.selected.has(hit.key)) {
        this.selected = new Set([hit.key]);
      }
      const orig = new Map<SketchEl, Snapshot>();
      for (const el of this.selectedEls()) {
        if (el.type === "shape") orig.set(el, { x: el.x, y: el.y });
        else if (el.type === "pen") orig.set(el, el.points.map((p) => ({ ...p })));
        else if (el.type === "link") orig.set(el, [{ ...el.from }, { ...el.to }]);
      }
      this.gesture = { kind: "move", start: at, moved: false, primary: hit.el.type === "shape" ? hit.el : undefined, orig };
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
    if (this.tool === "arrow" || this.tool === "line" || this.tool === "connector") {
      const from = this.attachAt(at);
      const el: LinkEl = {
        type: "link",
        kind: this.tool === "line" ? "line" : "arrow",
        from: from ?? start,
        to: { ...start },
        label: "",
        heads: this.tool === "line" ? "none" : "end",
        route: this.tool === "connector" ? "elbow" : "straight",
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
    const begin = free ? start : this.snapPoint(at, new Set());
    const el: ShapeEl = { type: "shape", kind, id: nextId(this.model, kind), x: begin.x, y: begin.y, w: 1, h: 1, label: "", style: kind === "box" ? { round: true } : {} };
    this.model.elements.push(el);
    this.dirty.add(el);
    this.gesture = { kind: "create", el, start: begin };
    return true;
  }

  /** A point snapped to the other shapes' lines where close, else to the grid. */
  private snapPoint(p: Point, except: Set<SketchEl>): Point {
    const others = this.otherBoxes(except);
    const x = edgeSnap(p.x, others, "x", this.tolerance);
    const y = edgeSnap(p.y, others, "y", this.tolerance);
    this.guides = { x: x.guide === undefined ? [] : [x.guide], y: y.guide === undefined ? [] : [y.guide] };
    return { x: x.guide === undefined ? snap(p.x, false) : x.value, y: y.guide === undefined ? snap(p.y, false) : y.value };
  }

  move(e: PointerEvent, at: Point) {
    // A press that turned into a drag isn't half of a double-click.
    if (this.lastDown && Math.hypot(e.clientX - this.lastDown.x, e.clientY - this.lastDown.y) > 6) this.lastDown = null;
    const g = this.gesture;
    if (!g || !this.model) return;
    const free = e.altKey;
    this.guides = undefined;
    this.target = undefined;
    switch (g.kind) {
      case "move": {
        let dx = at.x - g.start.x;
        let dy = at.y - g.start.y;
        if (!g.moved && Math.hypot(dx, dy) < 3) return;
        g.moved = true;
        const p = g.primary && (g.orig.get(g.primary) as { x: number; y: number } | undefined);
        if (g.primary && p && !free) {
          // Grid first, then line up with other shapes when one is close.
          dx = snap(p.x + dx, false) - p.x;
          dy = snap(p.y + dy, false) - p.y;
          const box = { ...shapeBox(g.primary), x: p.x + at.x - g.start.x, y: p.y + at.y - g.start.y };
          const lined = alignSnap(box, this.otherBoxes(new Set(g.orig.keys())), this.tolerance);
          if (lined.guides.x.length) dx = box.x + lined.dx - p.x;
          if (lined.guides.y.length) dy = box.y + lined.dy - p.y;
          this.guides = lined.guides;
        }
        for (const [el, snap0] of g.orig) {
          this.dirty.add(el);
          if (el.type === "shape") {
            const o = snap0 as { x: number; y: number };
            el.x = Math.round(o.x + dx);
            el.y = Math.round(o.y + dy);
          } else if (el.type === "pen") {
            el.points = (snap0 as Point[]).map((q) => ({ x: q.x + dx, y: q.y + dy }));
          } else if (el.type === "link") {
            const [f, t] = snap0 as [End, End];
            const shift = (end: End): End => ("id" in end ? end : { x: end.x + dx, y: end.y + dy });
            el.from = shift(f);
            el.to = shift(t);
          }
        }
        break;
      }
      case "marquee":
        this.marquee = {
          x: Math.min(g.start.x, at.x),
          y: Math.min(g.start.y, at.y),
          w: Math.abs(at.x - g.start.x),
          h: Math.abs(at.y - g.start.y),
        };
        break;
      case "resize": {
        const el = this.model.elements.find((x, i) => keyOf(x, i) === g.key) as ShapeEl | undefined;
        if (!el) return;
        const { orig } = g;
        const others = this.otherBoxes(new Set([el]));
        const guides: Guides = { x: [], y: [] };
        const edge = (v: number, axis: "x" | "y") => {
          if (free) return Math.round(v);
          const s = edgeSnap(v, others, axis, this.tolerance);
          if (s.guide === undefined) return snap(v, false);
          guides[axis].push(s.guide);
          return s.value;
        };
        let x1 = orig.x;
        let y1 = orig.y;
        let x2 = orig.x + orig.w;
        let y2 = orig.y + orig.h;
        if (g.corner.includes("w")) x1 = edge(at.x, "x");
        if (g.corner.includes("e")) x2 = edge(at.x, "x");
        if (g.corner.includes("n")) y1 = edge(at.y, "y");
        if (g.corner.includes("s")) y2 = edge(at.y, "y");
        el.x = Math.min(x1, x2);
        el.y = Math.min(y1, y2);
        el.w = Math.max(20, Math.abs(x2 - x1));
        el.h = Math.max(20, Math.abs(y2 - y1));
        this.guides = guides;
        this.dirty.add(el);
        break;
      }
      case "create": {
        const end = free ? { x: Math.round(at.x), y: Math.round(at.y) } : this.snapPoint(at, new Set([g.el]));
        g.el.x = Math.min(g.start.x, end.x);
        g.el.y = Math.min(g.start.y, end.y);
        g.el.w = Math.max(1, Math.abs(end.x - g.start.x));
        g.el.h = Math.max(1, Math.abs(end.y - g.start.y));
        break;
      }
      case "link": {
        const fromId = "id" in g.el.from ? g.el.from.id : undefined;
        this.target = this.attachAt(at, fromId);
        g.el.to = this.target ? { ...this.target } : { x: snap(at.x, free), y: snap(at.y, free) };
        break;
      }
      case "end": {
        const other = g.el[g.end === "from" ? "to" : "from"];
        this.target = this.attachAt(at, "id" in other ? other.id : undefined);
        g.el[g.end] = this.target ? { ...this.target } : { x: snap(at.x, free), y: snap(at.y, free) };
        this.dirty.add(g.el);
        break;
      }
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
    this.guides = undefined;
    this.target = undefined;
    if (!g || !this.model) return;
    switch (g.kind) {
      case "move":
        if (g.moved) this.commit();
        else this.redraw();
        return;
      case "marquee": {
        const m = this.marquee;
        this.marquee = undefined;
        if (m && (m.w > 2 || m.h > 2)) {
          const inside = (p: Point) => p.x >= m.x && p.x <= m.x + m.w && p.y >= m.y && p.y <= m.y + m.h;
          const shapes = shapeMap(this.model);
          this.model.elements.forEach((el, i) => {
            let ok = false;
            if (el.type === "shape") {
              const b = shapeBox(el);
              ok = inside({ x: b.x, y: b.y }) && inside({ x: b.x + b.w, y: b.y + b.h });
            } else if (el.type === "link") ok = linkEnds(el, shapes).every(inside);
            else if (el.type === "pen") ok = el.points.every(inside);
            if (ok) this.selected.add(keyOf(el, i));
          });
        }
        this.redraw();
        return;
      }
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
        const fromId = "id" in g.el.from ? g.el.from.id : undefined;
        const target = this.attachAt(at, fromId);
        if (target) g.el.to = target;
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
        const target = this.attachAt(at, "id" in other ? other.id : undefined);
        if (target) g.el[g.end] = target;
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
    const links = this.selectedEls().filter((el): el is LinkEl => el.type === "link");
    if (k === "e" && links.length) {
      this.setRoute(links, links.every((l) => l.route === "elbow") ? "straight" : "elbow");
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
