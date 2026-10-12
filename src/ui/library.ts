// The "Your diagrams" drawer: every diagram saved in this browser.

import { ENGINE_LABEL, ENGINE_TAG } from "../engines/types";
import { h, icon, modKey, relativeTime } from "../lib/dom";
import { store, type Doc } from "../store";
import { BLANK_CODE } from "../templates";
import { ICONS } from "./icons";
import { toast } from "./overlay";

const RAIL_LIMIT = 8;

/** Up to two letters for a rail tile: "Library system" -> "LS", "Welcome" -> "WE". */
export function initials(title: string): string {
  const words = title.match(/[\p{L}\p{N}]+/gu) ?? [];
  const [first = "?", second] = words;
  return (second ? first[0] + second[0] : first.slice(0, 2)).toUpperCase();
}

export interface LibraryActions {
  onNew(): void;
  onOpen(doc: Doc): void;
}

export class Library {
  private list = h("ul", { class: "library-list" });
  private search = h("input", {
    class: "field",
    type: "search",
    placeholder: "Filter",
    "aria-label": "Filter diagrams",
    autocomplete: "off",
  });
  /** Shown instead of the panel when it's collapsed: recent diagrams as tiles. */
  private recent = h("ul", { class: "rail-list", "aria-label": "Recent diagrams" });
  private renaming: string | null = null;

  constructor(
    private root: HTMLElement,
    private toggleButton: HTMLButtonElement,
    private actions: LibraryActions,
  ) {
    root.append(
      h(
        "div",
        { class: "library-panel" },
        h(
          "div",
          { class: "library-head" },
          h("h2", {}, "Your diagrams"),
          h(
            "button",
            { class: "icon-btn", type: "button", "aria-label": "New diagram", title: "New diagram", onclick: () => actions.onNew() },
            icon(ICONS.plus),
          ),
          h(
            "button",
            { class: "icon-btn", type: "button", "aria-label": "Collapse", title: `Collapse (${modKey}+B)`, onclick: () => this.toggle(false) },
            icon(ICONS.close),
          ),
        ),
        h("div", { class: "library-search" }, this.search),
        this.list,
        h("p", { class: "library-foot" }, "Saved in this browser only."),
      ),
      h(
        "div",
        { class: "library-rail" },
        h(
          "button",
          { class: "icon-btn", type: "button", "aria-label": "New diagram", title: "New diagram", onclick: () => actions.onNew() },
          icon(ICONS.plus),
        ),
        this.recent,
      ),
    );
    this.search.addEventListener("input", () => this.render());
    store.subscribe(() => this.render());
    this.toggle(false);
  }

  get isOpen() {
    return this.root.dataset.open === "true";
  }

  toggle(open = !this.isOpen) {
    this.root.dataset.open = String(open);
    this.toggleButton.setAttribute("aria-expanded", String(open));
    this.render();
    if (open) this.list.querySelector<HTMLElement>("[aria-current='true'] .library-open")?.focus({ preventScroll: true });
  }

  render() {
    if (!this.isOpen) {
      this.renderRail();
      return;
    }
    const q = this.search.value.trim().toLowerCase();
    const docs = [...store.docs]
      .sort((a, b) => b.updated - a.updated)
      .filter((d) => !q || d.title.toLowerCase().includes(q) || d.code.toLowerCase().includes(q));

    this.list.replaceChildren(
      ...docs.map((doc) => (doc.id === this.renaming ? this.renameRow(doc) : this.row(doc))),
    );
    if (!docs.length) {
      this.list.append(h("li", { class: "library-empty" }, q ? "No diagrams match." : "Nothing here yet."));
    }
  }

  private row(doc: Doc) {
    return h(
      "li",
      { class: "library-item", "aria-current": String(doc.id === store.currentId) },
      h(
        "button",
        { class: "library-open", type: "button", onclick: () => this.actions.onOpen(doc), ondblclick: () => this.startRename(doc) },
        h("span", { class: "name" }, doc.title),
        h(
          "span",
          { class: "meta" },
          h("span", { class: "engine-tag", "data-engine": doc.engine }, ENGINE_TAG[doc.engine]),
          relativeTime(doc.updated),
        ),
      ),
      h(
        "span",
        { class: "item-actions" },
        h("button", { class: "icon-btn", type: "button", "aria-label": `Rename ${doc.title}`, title: "Rename", onclick: () => this.startRename(doc) }, icon(ICONS.pencil, 15)),
        h("button", { class: "icon-btn", type: "button", "aria-label": `Duplicate ${doc.title}`, title: "Duplicate", onclick: () => this.duplicate(doc) }, icon(ICONS.duplicate, 15)),
        h("button", { class: "icon-btn", type: "button", "aria-label": `Delete ${doc.title}`, title: "Delete", onclick: () => this.remove(doc) }, icon(ICONS.trash, 15)),
      ),
    );
  }

  private renderRail() {
    const docs = [...store.docs].sort((a, b) => b.updated - a.updated).slice(0, RAIL_LIMIT);
    this.recent.replaceChildren(
      ...docs.map((doc) =>
        h(
          "li",
          {},
          h(
            "button",
            {
              class: "rail-doc engine-tag",
              type: "button",
              "data-engine": doc.engine,
              "aria-current": String(doc.id === store.currentId),
              "aria-label": doc.title,
              title: `${doc.title} (${ENGINE_LABEL[doc.engine]})`,
              onclick: () => this.actions.onOpen(doc),
            },
            initials(doc.title),
          ),
        ),
      ),
    );
  }

  private renameRow(doc: Doc) {
    const input = h("input", { class: "field library-rename", type: "text", "aria-label": "New name", maxlength: "120" });
    input.value = doc.title;
    let done = false;
    const finish = (save: boolean) => {
      if (done) return;
      done = true;
      this.renaming = null;
      const title = input.value.trim();
      if (save && title && title !== doc.title) store.update(doc.id, { title });
      else this.render();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish(true);
      if (e.key === "Escape") {
        e.stopPropagation();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(true));
    queueMicrotask(() => {
      input.focus();
      input.select();
    });
    return h("li", {}, input);
  }

  private startRename(doc: Doc) {
    this.renaming = doc.id;
    this.render();
  }

  private duplicate(doc: Doc) {
    const copy = store.create({ title: store.uniqueTitle(`${doc.title} copy`), engine: doc.engine, code: doc.code });
    this.actions.onOpen(copy);
  }

  private remove(doc: Doc) {
    const removed = store.remove(doc.id);
    if (!removed) return;
    if (!store.docs.length) {
      this.actions.onOpen(store.create({ title: "Untitled diagram", engine: doc.engine, code: BLANK_CODE[doc.engine] }));
    } else if (store.current) {
      this.actions.onOpen(store.current);
    }
    toast(`Deleted “${doc.title}”`, {
      action: {
        label: "Undo",
        run: () => {
          store.restore(removed.doc, removed.index);
          this.actions.onOpen(removed.doc);
        },
      },
    });
  }
}
