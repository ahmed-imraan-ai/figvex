// Editing text diagrams from the preview: click a person, device, node or
// zone to select it, then rename it (double-click, Enter or F2), add one
// under or linked to it (Insert), or remove it (Delete). Every change is
// made to the text, so undo, saving and sharing work as for typing.
//
// Org charts and networks support all three; Graphviz and Mermaid
// flowcharts support renaming.

import { dotLabel, renameDotNode } from "../engines/graphviz-edit";
import { isFlowchart, mermaidLabel, renameMermaidNode } from "../engines/mermaid-edit";
import { addLinkedDevice, labelOf, lineKind, removeDevice, removeLink, setLabel, type NetLineKind } from "../engines/network/edit";
import { addReport, personText, removePerson, renamePerson } from "../engines/orgchart/edit";
import type { Engine } from "../engines/types";
import type { DiagramEditor } from "../editor/editor";
import { h, icon } from "../lib/dom";
import type { Preview } from "../preview";
import { ICONS } from "./icons";

type Target =
  | { engine: "orgchart"; line: number }
  | { engine: "network"; line: number; kind: NetLineKind }
  | { engine: "graphviz"; id: string }
  | { engine: "mermaid"; id: string };

interface Actions {
  /** The text the rename box starts with. */
  text: string;
  /** What the rename box is for, read out to screen readers. */
  what: string;
  rename(text: string): string;
  add?: { label: string; run(): { code: string; line: number } | null };
  remove?: { label: string; run(): string | null; refused: string };
}

export interface PreviewEditorOptions {
  preview: Preview;
  editor: DiagramEditor;
  engine: () => Engine;
  /** Show the clicked element's line in the editor, without moving focus. */
  reveal: (target: Element) => void;
  notify: (message: string) => void;
}

const EDITABLE: Engine[] = ["orgchart", "network", "graphviz", "mermaid"];
const DOUBLE_CLICK_MS = 450;

const keyOf = (t: Target) => ("line" in t ? `${t.engine}:${t.line}` : `${t.engine}:${t.id}`);

/** Node id from a Mermaid flowchart node's element id, e.g. "flowchart-A-0". */
function mermaidId(g: Element): string | null {
  const id = g.getAttribute("id") ?? "";
  return id.match(/^(?:mmd-\d+-)?flowchart-(.+)-\d+$/)?.[1] ?? null;
}

export class PreviewEditor {
  private selected: Target | null = null;
  private element: Element | null = null;
  private lastClick: { key: string; t: number } | null = null;
  private renameAfterRender = false;
  private frame = 0;
  private input: HTMLTextAreaElement | null = null;
  private readonly box: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly stage: HTMLElement;

  constructor(private readonly o: PreviewEditorOptions) {
    this.stage = o.preview.stageElement;
    this.box = h("div", { class: "pe-box", hidden: "" });
    this.bar = h("div", { class: "pe-bar", role: "toolbar", "aria-label": "Edit the selected item", hidden: "" });
    this.stage.append(this.box, this.bar);
    this.stage.addEventListener("keydown", (e) => this.key(e));
  }

  // -- Called by main.ts -----------------------------------------------------

  /** A click on the diagram. Returns true when it selected something editable. */
  click(target: Element): boolean {
    const t = this.targetFor(target);
    if (!t) {
      this.clear();
      return false;
    }
    const key = keyOf(t);
    const now = performance.now();
    const double = this.lastClick?.key === key && now - this.lastClick.t < DOUBLE_CLICK_MS;
    this.lastClick = double ? null : { key, t: now };
    this.select(t);
    this.o.reveal(target);
    this.stage.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    if (double) this.rename();
    return true;
  }

  /** After each drawing: find the selection again in the new SVG. */
  refresh() {
    if (!this.selected) return;
    if (!EDITABLE.includes(this.o.engine())) return this.clear();
    this.element = this.elementFor(this.selected);
    if (!this.element) return this.clear();
    this.showBar();
    if (this.renameAfterRender) {
      // Something was just added: show its line and name it.
      this.renameAfterRender = false;
      this.o.reveal(this.element);
      this.rename();
    }
  }

  clear() {
    this.closeInput(false);
    this.selected = null;
    this.element = null;
    this.renameAfterRender = false;
    this.box.hidden = true;
    this.bar.hidden = true;
    cancelAnimationFrame(this.frame);
  }

  // -- Finding things ----------------------------------------------------------

  private targetFor(el: Element): Target | null {
    const engine = this.o.engine();
    const code = this.o.editor.value;
    if (engine === "orgchart" || engine === "network") {
      const g = el.closest("[data-source-line]");
      const line = Number(g?.getAttribute("data-source-line")) + 1;
      if (!Number.isFinite(line)) return null;
      if (engine === "orgchart") return personText(code, line) === null ? null : { engine, line };
      const kind = lineKind(code.split(/\r?\n/)[line - 1] ?? "");
      return kind ? { engine, line, kind } : null;
    }
    if (engine === "graphviz") {
      const id = el.closest("g.node")?.querySelector(":scope > title")?.textContent;
      return id ? { engine, id } : null;
    }
    if (engine === "mermaid" && isFlowchart(code)) {
      const g = el.closest("g.node");
      const id = g && mermaidId(g);
      return id ? { engine, id } : null;
    }
    return null;
  }

  private elementFor(t: Target): Element | null {
    const svg = this.o.preview.currentSvg;
    if (!svg) return null;
    if ("line" in t) return svg.querySelector(`[data-source-line="${t.line - 1}"]`);
    for (const g of svg.querySelectorAll("g.node")) {
      if (t.engine === "graphviz" && g.querySelector(":scope > title")?.textContent === t.id) return g;
      if (t.engine === "mermaid" && mermaidId(g) === t.id) return g;
    }
    return null;
  }

  private actions(t: Target): Actions {
    const code = this.o.editor.value;
    if (t.engine === "orgchart") {
      return {
        text: personText(code, t.line) ?? "",
        what: "Name: job title",
        rename: (text) => renamePerson(code, t.line, text),
        add: { label: "Add a report", run: () => addReport(code, t.line) },
        remove: { label: "Remove", run: () => removePerson(code, t.line), refused: "An org chart needs at least one person." },
      };
    }
    if (t.engine === "network") {
      const actions: Actions = { text: labelOf(code, t.line), what: "Label", rename: (text) => setLabel(code, t.line, text) };
      if (t.kind === "device") {
        actions.add = { label: "Add a linked device", run: () => addLinkedDevice(code, t.line) };
        actions.remove = { label: "Remove with its links", run: () => removeDevice(code, t.line), refused: "A network needs at least one device." };
      } else if (t.kind === "link") {
        actions.remove = { label: "Remove link", run: () => removeLink(code, t.line), refused: "" };
      }
      return actions;
    }
    if (t.engine === "graphviz") return { text: dotLabel(code, t.id), what: "Label", rename: (text) => renameDotNode(code, t.id, text) };
    return { text: mermaidLabel(code, t.id), what: "Label", rename: (text) => renameMermaidNode(code, t.id, text) };
  }

  // -- Selection and toolbar ---------------------------------------------------

  private select(t: Target) {
    this.closeInput(true);
    this.selected = t;
    this.element = this.elementFor(t);
    if (!this.element) return this.clear();
    this.showBar();
  }

  private showBar() {
    if (!this.selected) return;
    const a = this.actions(this.selected);
    const button = (label: string, paths: string, run: () => void) =>
      h("button", { type: "button", class: "sketch-tool", title: label, "aria-label": label, onclick: run }, icon(paths, 17));
    this.bar.replaceChildren(
      button("Rename (Enter)", ICONS.pencil, () => this.rename()),
      ...(a.add ? [button(`${a.add.label} (Insert)`, ICONS.plus, () => this.add())] : []),
      ...(a.remove ? [button(`${a.remove.label} (Delete)`, ICONS.trash, () => this.remove())] : []),
    );
    this.box.hidden = false;
    this.bar.hidden = false;
    // Follow the element while the view is panned or zoomed.
    cancelAnimationFrame(this.frame);
    const follow = () => {
      this.place();
      this.frame = requestAnimationFrame(follow);
    };
    follow();
  }

  /** Where the element is, relative to the stage. */
  private rect() {
    const r = this.element!.getBoundingClientRect();
    const s = this.stage.getBoundingClientRect();
    return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
  }

  private place() {
    if (!this.element?.isConnected) return;
    const r = this.rect();
    const pad = 4;
    Object.assign(this.box.style, { left: `${r.x - pad}px`, top: `${r.y - pad}px`, width: `${r.w + pad * 2}px`, height: `${r.h + pad * 2}px` });
    const barH = this.bar.offsetHeight || 40;
    const above = r.y - pad - barH - 6;
    Object.assign(this.bar.style, { left: `${r.x + r.w / 2}px`, top: `${above >= 4 ? above : r.y + r.h + pad + 6}px` });
  }

  // -- Actions -----------------------------------------------------------------

  private apply(code: string) {
    if (code !== this.o.editor.value) this.o.editor.applyText(code);
  }

  rename() {
    if (!this.selected || !this.element) return;
    const a = this.actions(this.selected);
    this.closeInput(false);
    const r = this.rect();
    const input = h("textarea", { class: "sketch-label pe-input", rows: "1", spellcheck: "false", "aria-label": a.what }) as HTMLTextAreaElement;
    input.value = a.text;
    Object.assign(input.style, { left: `${r.x + r.w / 2}px`, top: `${r.y + r.h / 2}px`, fontSize: "14px" });
    const fit = () => {
      input.style.height = "auto";
      input.style.height = `${input.scrollHeight}px`;
      input.style.width = `${Math.max(120, Math.max(...input.value.split("\n").map((l) => l.length)) * 8 + 24)}px`;
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
    (input as HTMLTextAreaElement & { save?: (text: string) => void }).save = (text) => {
      if (text.trim() && text !== a.text) this.apply(a.rename(text.trim()));
    };
    this.input = input;
    this.stage.append(input);
    fit();
    input.focus();
    input.select();
  }

  private closeInput(save: boolean) {
    const input = this.input as (HTMLTextAreaElement & { save?: (text: string) => void }) | null;
    if (!input) return;
    this.input = null;
    input.remove();
    this.stage.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    if (save) input.save?.(input.value);
  }

  add() {
    if (!this.selected || !("line" in this.selected)) return;
    const a = this.actions(this.selected);
    const result = a.add?.run();
    if (!result) return;
    // Select the new line once it's drawn, ready to be named.
    this.selected = this.selected.engine === "network" ? { engine: "network", line: result.line, kind: "device" } : { engine: "orgchart", line: result.line };
    this.renameAfterRender = true;
    this.apply(result.code);
  }

  remove() {
    if (!this.selected) return;
    const a = this.actions(this.selected);
    if (!a.remove) return;
    const code = a.remove.run();
    if (code === null) {
      if (a.remove.refused) this.o.notify(a.remove.refused);
      return;
    }
    this.clear();
    this.apply(code);
  }

  private key(e: KeyboardEvent) {
    if (e.target !== this.stage || !this.selected || e.ctrlKey || e.metaKey || e.altKey) return;
    const run: Record<string, () => void> = {
      Enter: () => this.rename(),
      F2: () => this.rename(),
      Insert: () => this.add(),
      Delete: () => this.remove(),
      Backspace: () => this.remove(),
      Escape: () => this.clear(),
    };
    const action = run[e.key];
    if (!action) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    action();
  }
}
