// The preview: a pannable, zoomable sheet holding the rendered SVG.
//
// Until the user zooms or pans, the view stays in "fit" mode and re-fits after
// every render. Once they take control it stops moving under them.

import DOMPurify from "dompurify";

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const FIT_MAX_SCALE = 1.25;
const FIT_PADDING = 40;

export interface PreviewCallbacks {
  onZoom(scale: number): void;
  /** Clicked a diagram element; `hint` describes what was clicked. */
  onPick(hint: SourceHint): void;
}

export type SourceHint = { kind: "line"; line: number; name?: string } | { kind: "name"; name: string };

export class Preview {
  private x = 0;
  private y = 0;
  private scale = 1;
  private fitMode = true;
  private size = { width: 0, height: 0 };
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { x: number; y: number; moved: boolean; target: Element } | null = null;
  private pinch: { dist: number; scale: number } | null = null;

  constructor(
    private stage: HTMLElement,
    private canvas: HTMLElement,
    private sheet: HTMLElement,
    private callbacks: PreviewCallbacks,
  ) {
    stage.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    stage.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    stage.addEventListener("pointermove", (e) => this.onPointerMove(e));
    stage.addEventListener("pointerup", (e) => this.onPointerUp(e));
    stage.addEventListener("pointercancel", (e) => this.onPointerUp(e));
    stage.addEventListener("dblclick", (e) => {
      if ((e.target as Element).closest(".sheet")) return;
      this.fit();
    });
    stage.addEventListener("keydown", (e) => this.onKey(e));
    new ResizeObserver(() => {
      if (this.fitMode) this.fit();
    }).observe(stage);
  }

  get hasDiagram() {
    return this.sheet.firstElementChild instanceof SVGSVGElement;
  }

  get currentSvg(): SVGSVGElement | null {
    const el = this.sheet.firstElementChild;
    return el instanceof SVGSVGElement ? el : null;
  }

  show(svgMarkup: string, background: "light" | "dark") {
    const clean = DOMPurify.sanitize(svgMarkup, {
      USE_PROFILES: { svg: true, svgFilters: true },
      ADD_TAGS: ["style", "foreignObject"],
      ADD_ATTR: ["data-source-line", "data-qualified-name", "xml:space", "dominant-baseline", "target"],
      FORBID_ATTR: ["onload", "onclick"],
    });
    const doc = new DOMParser().parseFromString(clean, "image/svg+xml");
    const svg = doc.documentElement;
    if (!(svg instanceof SVGSVGElement) || doc.querySelector("parsererror")) {
      throw new Error("The engine returned an unreadable SVG.");
    }
    const { width, height } = intrinsicSize(svg);
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.style.removeProperty("max-width");
    svg.style.removeProperty("background-color");
    // Links inside diagrams open in a new tab instead of replacing the app.
    for (const a of svg.querySelectorAll("a")) {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    }
    this.sheet.replaceChildren(document.importNode(svg, true));
    this.sheet.dataset.tone = background;
    this.size = { width, height };
    if (this.fitMode) this.fit();
    else this.apply();
  }

  /** Remove the diagram. The next one is fitted to the view again. */
  clear() {
    this.sheet.replaceChildren();
    this.size = { width: 0, height: 0 };
    this.fitMode = true;
  }

  fit() {
    this.fitMode = true;
    const { width, height } = this.size;
    const box = this.stage.getBoundingClientRect();
    if (!width || !height || !box.width || !box.height) return;
    const s = Math.min((box.width - FIT_PADDING * 2) / width, (box.height - FIT_PADDING * 2) / height, FIT_MAX_SCALE);
    this.scale = Math.max(MIN_SCALE, s);
    this.x = (box.width - width * this.scale) / 2;
    this.y = Math.max(FIT_PADDING, (box.height - height * this.scale) / 2);
    this.apply();
  }

  zoomBy(factor: number, cx?: number, cy?: number) {
    const box = this.stage.getBoundingClientRect();
    this.zoomTo(this.scale * factor, cx ?? box.width / 2, cy ?? box.height / 2);
  }

  /** 100%, centred on the middle of the view. */
  actualSize() {
    const box = this.stage.getBoundingClientRect();
    this.zoomTo(1, box.width / 2, box.height / 2);
  }

  private zoomTo(next: number, cx: number, cy: number) {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    this.x = cx - ((cx - this.x) * scale) / this.scale;
    this.y = cy - ((cy - this.y) * scale) / this.scale;
    this.scale = scale;
    this.fitMode = false;
    this.apply();
  }

  private apply() {
    this.canvas.style.transform = `translate(${Math.round(this.x)}px, ${Math.round(this.y)}px) scale(${this.scale})`;
    this.callbacks.onZoom(this.scale);
  }

  private local(e: { clientX: number; clientY: number }) {
    const box = this.stage.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  }

  // Trackpad pinch and Ctrl/⌘ + wheel zoom; a plain wheel pans, like most
  // design tools.
  private onWheel(e: WheelEvent) {
    if (!this.hasDiagram) return;
    e.preventDefault();
    const p = this.local(e);
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025));
      this.zoomTo(this.scale * factor, p.x, p.y);
    } else {
      const unit = e.deltaMode === 1 ? 16 : 1;
      this.x -= (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * unit;
      this.y -= (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * unit;
      this.fitMode = false;
      this.apply();
    }
  }

  private onPointerDown(e: PointerEvent) {
    if (e.button !== 0 || !this.hasDiagram) return;
    if ((e.target as Element).closest("a")) return;
    this.stage.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, this.local(e));
    if (this.pointers.size === 1) {
      const p = this.local(e);
      this.drag = { x: p.x, y: p.y, moved: false, target: e.target as Element };
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: this.scale };
      this.drag = null;
    }
  }

  private onPointerMove(e: PointerEvent) {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      this.zoomTo((this.pinch.scale * dist) / this.pinch.dist, (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    if (!this.drag) return;
    const dx = p.x - this.drag.x;
    const dy = p.y - this.drag.y;
    if (!this.drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!this.drag.moved) this.stage.classList.add("is-panning");
    this.drag.moved = true;
    this.x += dx;
    this.y += dy;
    this.drag.x = p.x;
    this.drag.y = p.y;
    this.fitMode = false;
    this.apply();
  }

  private onPointerUp(e: PointerEvent) {
    // Pointer capture retargets pointerup to the stage, so use the element
    // that was pressed.
    const clicked = this.drag && !this.drag.moved && this.pointers.size === 1 ? this.drag.target : null;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    this.stage.classList.remove("is-panning");
    this.drag = null;
    if (clicked && e.type === "pointerup") {
      const hint = sourceHint(clicked);
      if (hint) this.callbacks.onPick(hint);
    }
  }

  private onKey(e: KeyboardEvent) {
    if (e.target !== this.stage || e.ctrlKey || e.metaKey || e.altKey) return;
    const step = e.shiftKey ? 120 : 40;
    const actions: Record<string, () => void> = {
      "+": () => this.zoomBy(1.25),
      "=": () => this.zoomBy(1.25),
      "-": () => this.zoomBy(0.8),
      "0": () => this.fit(),
      "1": () => this.actualSize(),
      ArrowLeft: () => this.panBy(step, 0),
      ArrowRight: () => this.panBy(-step, 0),
      ArrowUp: () => this.panBy(0, step),
      ArrowDown: () => this.panBy(0, -step),
    };
    const action = actions[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  }

  private panBy(dx: number, dy: number) {
    this.x += dx;
    this.y += dy;
    this.fitMode = false;
    this.apply();
  }
}

/** Width and height in CSS pixels, from attributes or the viewBox. */
export function intrinsicSize(svg: SVGSVGElement): { width: number; height: number } {
  const vb = svg.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
  const attr = (name: string) => {
    const v = svg.getAttribute(name);
    return v && !v.endsWith("%") ? parseFloat(v) : NaN;
  };
  let width = attr("width");
  let height = attr("height");
  if (vb && vb.length === 4 && vb.every(Number.isFinite)) {
    if (!Number.isFinite(width)) width = vb[2];
    if (!Number.isFinite(height)) height = vb[3];
  }
  return { width: Math.ceil(width || 300), height: Math.ceil(height || 150) };
}

/**
 * Work out what source text a clicked element came from. PlantUML marks
 * entities with data-source-line (0-based); Mermaid nodes carry ids such as
 * "flowchart-Login-3".
 */
function sourceHint(target: Element | null): SourceHint | null {
  if (!target) return null;
  const withLine = target.closest("[data-source-line]");
  if (withLine) {
    const line = Number(withLine.getAttribute("data-source-line")) + 1;
    const name = withLine.getAttribute("data-qualified-name") ?? undefined;
    if (Number.isFinite(line)) return { kind: "line", line, name };
  }
  const titled = target.closest("g")?.querySelector(":scope > title");
  if (titled?.textContent) return { kind: "name", name: titled.textContent.trim() };

  const node = target.closest("g.node, g[id^='state-'], g.classGroup, g[id^='entity-']");
  const id = node?.getAttribute("id") ?? node?.getAttribute("data-id") ?? "";
  const m =
    id.match(/^(?:mmd-\d+-)?(?:flowchart|state|classId|entity)-(.+?)-\d+$/) ??
    id.match(/^(?:mmd-\d+-)?(?:flowchart|state|classId|entity)-(.+)$/);
  if (m) return { kind: "name", name: m[1] };
  const label = node?.querySelector("text")?.textContent?.trim();
  return label ? { kind: "name", name: label } : null;
}
