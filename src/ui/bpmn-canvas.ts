// Dragging BPMN shapes in the preview. The drawing updates as you drag and
// the new positions are written into the XML when you let go, so undo, save
// and share work as for a typed change.

import { lastBpmn } from "../engines/bpmn";
import { addDiagram, laneChanges, moveInModel, writeLanes, writePositions, type Delta } from "../engines/bpmn/edit";
import type { BpmnModel, EdgeDi, ShapeDi } from "../engines/bpmn/model";
import { drawBpmn, type DrawStyle } from "../engines/bpmn/render";
import { alignSnap, type Box, type Guides } from "../engines/sketch/snap";
import type { DiagramEditor } from "../editor/editor";
import type { Preview, PreviewTool } from "../preview";

export interface BpmnCanvasOptions {
  pane: HTMLElement;
  preview: Preview;
  editor: DiagramEditor;
  look: () => DrawStyle;
  show: (svg: string) => void;
  /** A click without a drag: show the element's line. */
  pick: (target: Element) => void;
  /** Tell the person something happened, such as positions being added. */
  notify: (message: string) => void;
}

/** Width of a pool's name band, the part you drag a pool by. */
const POOL_HEADER = 30;
/** Pointer travel, in screen pixels, before a press becomes a drag. */
const DRAG_START = 3;
/** Alignment snapping distance, in screen pixels. */
const SNAP = 6;
const ACCENT = "#c2410c";

interface Gesture {
  id: string;
  start: { x: number; y: number };
  target: Element;
  moved: boolean;
  delta: Delta;
}

export class BpmnCanvas implements PreviewTool {
  /** Shapes stay under the pointer when the drawing grows to the left or top. */
  readonly anchor = true;
  private active = false;
  private model: BpmnModel | null = null;
  private code = "";
  private laidOut = false;
  private selected: string | null = null;
  private gesture: Gesture | null = null;
  private guides: Guides | undefined;

  constructor(private readonly o: BpmnCanvasOptions) {}

  activate() {
    if (this.active) return;
    this.active = true;
    this.o.pane.dataset.bpmnEdit = "";
    this.o.preview.setTool(this);
  }

  deactivate() {
    if (!this.active) return;
    this.active = false;
    delete this.o.pane.dataset.bpmnEdit;
    this.selected = null;
    this.gesture = null;
    this.o.preview.setTool(null);
  }

  /** The drawing for a successful render, with the selection on it. */
  display(code: string): string | null {
    if (!this.active || this.gesture?.moved) return null;
    const last = lastBpmn(code);
    if (!last) return null;
    this.model = last.model;
    this.laidOut = last.laidOut;
    this.code = code;
    if (this.selected && !this.model.shapes.has(this.selected)) this.selected = null;
    return this.render();
  }

  private render(shapes?: Map<string, ShapeDi>, edges?: Map<string, EdgeDi>): string {
    const model = shapes && edges ? { ...this.model!, shapes, edges } : this.model!;
    const svg = drawBpmn(model, this.o.look());
    const extra: string[] = [];
    const sel = this.selected ? model.shapes.get(this.selected) : undefined;
    if (sel) {
      const b = sel.bounds;
      extra.push(
        `<rect x="${b.x - 5}" y="${b.y - 5}" width="${b.width + 10}" height="${b.height + 10}" rx="6" fill="none" stroke="${ACCENT}" stroke-width="1.5" stroke-dasharray="5 4" pointer-events="none"/>`,
      );
    }
    for (const x of this.guides?.x ?? []) extra.push(`<line x1="${x}" y1="-100000" x2="${x}" y2="100000" stroke="${ACCENT}" stroke-width="1" stroke-dasharray="3 3" pointer-events="none"/>`);
    for (const y of this.guides?.y ?? []) extra.push(`<line x1="-100000" y1="${y}" x2="100000" y2="${y}" stroke="${ACCENT}" stroke-width="1" stroke-dasharray="3 3" pointer-events="none"/>`);
    return extra.length ? svg.replace(/<\/svg>\s*$/, `${extra.join("")}</svg>`) : svg;
  }

  private redraw(shapes?: Map<string, ShapeDi>, edges?: Map<string, EdgeDi>) {
    if (this.model) this.o.show(this.render(shapes, edges));
  }

  /** Screen pixels to diagram units at the current zoom. */
  private px(n: number) {
    return n / (this.o.preview.toStage(0, 0).scale || 1);
  }

  // -- Pointer input, called by the preview -------------------------------

  down(e: PointerEvent, at: { x: number; y: number }): boolean {
    if (!this.model || e.button !== 0) return false;
    const el = (e.target as Element).closest?.("[data-element-id]");
    const id = el?.getAttribute("data-element-id") ?? "";
    const node = this.model.nodes.get(id);
    const di = this.model.shapes.get(id);
    let grab = !!node && !!di && node.kind !== "lane";
    if (grab && node!.kind === "participant") {
      // A pool moves by its name band, so dragging inside it still pans.
      const b = di!.bounds;
      grab = di!.horizontal === false ? at.y - b.y <= POOL_HEADER : at.x - b.x <= POOL_HEADER;
    }
    if (!grab) {
      if (this.selected) {
        this.selected = null;
        this.redraw();
      }
      return false;
    }
    this.selected = id;
    this.gesture = { id, start: at, target: e.target as Element, moved: false, delta: { dx: 0, dy: 0 } };
    this.redraw();
    return true;
  }

  move(e: PointerEvent, at: { x: number; y: number }) {
    const g = this.gesture;
    if (!g || !this.model) return;
    let dx = at.x - g.start.x;
    let dy = at.y - g.start.y;
    if (!g.moved && Math.hypot(dx, dy) < this.px(DRAG_START)) return;
    g.moved = true;
    this.guides = undefined;
    if (!e.altKey) {
      // Line up with other shapes where close; otherwise move in steps of 5.
      const { moved } = moveInModel(this.model, [g.id], { dx: 0, dy: 0 });
      const b = this.model.shapes.get(g.id)!.bounds;
      const others: Box[] = [];
      for (const [id, s] of this.model.shapes) {
        const kind = this.model.nodes.get(id)?.kind;
        if (moved.has(id) || kind === "participant" || kind === "lane") continue;
        others.push({ x: s.bounds.x, y: s.bounds.y, w: s.bounds.width, h: s.bounds.height });
      }
      const snap = alignSnap({ x: b.x + dx, y: b.y + dy, w: b.width, h: b.height }, others, this.px(SNAP));
      dx = snap.guides.x.length ? dx + snap.dx : Math.round(dx / 5) * 5;
      dy = snap.guides.y.length ? dy + snap.dy : Math.round(dy / 5) * 5;
      this.guides = snap.guides;
    }
    g.delta = { dx, dy };
    const next = moveInModel(this.model, [g.id], g.delta);
    this.redraw(next.shapes, next.edges);
  }

  up() {
    const g = this.gesture;
    this.gesture = null;
    this.guides = undefined;
    if (!g) return;
    if (!g.moved) {
      this.o.pick(g.target);
      return;
    }
    this.commit([g.id], g.delta);
  }

  key(e: KeyboardEvent): boolean {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === "z" || e.key === "Z" || e.key === "y")) {
      if (e.key === "y" || e.shiftKey) this.o.editor.redo();
      else this.o.editor.undo();
      return true;
    }
    if (!this.selected) return false;
    const step = e.shiftKey ? 10 : 1;
    const arrows: Record<string, Delta> = {
      ArrowLeft: { dx: -step, dy: 0 },
      ArrowRight: { dx: step, dy: 0 },
      ArrowUp: { dx: 0, dy: -step },
      ArrowDown: { dx: 0, dy: step },
    };
    if (arrows[e.key]) {
      this.commit([this.selected], arrows[e.key]);
      return true;
    }
    if (e.key === "Escape") {
      this.selected = null;
      this.redraw();
      return true;
    }
    return false;
  }

  /** Writes a move into the text, which then redraws as usual. */
  private commit(ids: string[], delta: Delta) {
    if (!this.model || (!delta.dx && !delta.dy)) return;
    const { shapes, edges, moved } = moveInModel(this.model, ids, delta);
    let text: string;
    if (this.laidOut) {
      // The file had no positions, so the whole layout goes in once.
      text = addDiagram(this.code, this.model, shapes, edges);
      this.o.notify("Positions were added to the file, so the layout you make is kept.");
    } else {
      const flows = this.model.flows.filter((f) => moved.has(f.source) || moved.has(f.target)).map((f) => f.id);
      text = writePositions(this.code, shapes, edges, { shapes: moved, edges: flows });
    }
    // A task dropped in another lane now belongs to that lane.
    text = writeLanes(text, laneChanges(this.model, shapes, moved));
    // Until the redraw comes back, later nudges build on this text.
    this.model = { ...this.model, shapes, edges };
    this.code = text;
    this.laidOut = false;
    this.redraw();
    this.o.editor.applyText(text);
  }
}
