// Searches the cloud icons in PlantUML's standard library (AWS, Azure,
// Google Cloud, Kubernetes) and inserts one into the diagram. The index is
// fetched the first time the dialog opens; the preview draws the icon with
// PlantUML, which loads it from the official PlantUML host.

import DOMPurify from "dompurify";
import { renderDiagram } from "../engines";
import { iconLabel, searchIcons, type IconIndex } from "../engines/icon-insert";
import { debounce, h } from "../lib/dom";
import { renderOptions } from "../store";
import { modal } from "./overlay";

type Icon = IconIndex["icons"][number];

let indexPromise: Promise<IconIndex> | undefined;

function loadIndex(): Promise<IconIndex> {
  indexPromise ??= fetch(`${import.meta.env.BASE_URL}icon-index.json`).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<IconIndex>;
  });
  indexPromise.catch(() => (indexPromise = undefined));
  return indexPromise;
}

export function openIconSearch(onPick: (index: IconIndex, icon: Icon) => void) {
  const search = h("input", { class: "field", type: "search", placeholder: "Search AWS, Azure, Google Cloud and Kubernetes icons", "aria-label": "Search icons", autocomplete: "off" });
  const list = h("ul", { class: "template-list", role: "listbox", "aria-label": "Icons" });
  const title = h("h3");
  const summary = h("p");
  const preview = h("div", { class: "template-preview", "aria-live": "polite" });
  const insert = h("button", { class: "btn btn-ink", type: "button" }, "Insert");
  const body = h(
    "div",
    { class: "templates" },
    list,
    h("div", { class: "template-detail" }, h("div", { class: "template-info" }, title, summary), preview, h("div", { class: "template-actions" }, insert)),
  );
  const { close } = modal({ title: "Cloud icons", body, headExtra: search });

  let index: IconIndex | undefined;
  let visible: Icon[] = [];
  let selected: Icon | undefined;
  let token = 0;
  const key = (i: Icon) => `${i[0]}/${i[1]}`;
  const libraryOf = (i: Icon) => index!.libraries.find((l) => l.id === i[0])!;

  const pick = () => {
    if (!selected || !index) return;
    close();
    onPick(index, selected);
  };
  insert.addEventListener("click", pick);

  const renderPreview = debounce(async (icon: Icon) => {
    const mine = ++token;
    const lib = libraryOf(icon);
    preview.replaceChildren(h("span", { class: "preview-note" }, "Loading the icon…"));
    const code = `@startuml\n!include <${lib.common}>\n!include <${lib.id}/${icon[1]}>\n${icon[2]}(icon, "${iconLabel(icon[2])}", "${lib.label}")\n@enduml`;
    const result = await renderDiagram("plantuml", code, { ...renderOptions(false), serverFallback: false });
    if (mine !== token) return;
    if (result.ok) {
      preview.innerHTML = DOMPurify.sanitize(result.svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ["style"] });
      preview.querySelector("svg")?.style.removeProperty("max-width");
    } else preview.replaceChildren(h("span", { class: "preview-note" }, "The icon couldn't be loaded. Check the connection to plantuml.github.io."));
  }, 150);

  function select(icon: Icon | undefined, scroll = false) {
    selected = icon;
    for (const el of list.querySelectorAll<HTMLElement>(".template-item")) {
      const on = !!icon && el.dataset.id === key(icon);
      el.setAttribute("aria-selected", String(on));
      if (on && scroll) el.scrollIntoView({ block: "nearest" });
    }
    insert.disabled = !icon;
    title.textContent = icon ? iconLabel(icon[2]) : "No matches";
    summary.textContent = icon ? `${libraryOf(icon).label} · ${icon[1]} · ${icon[2]}(alias, "label", "technology")` : "Try another word, like “database”, “queue” or “pod”.";
    if (icon) renderPreview(icon);
    else preview.replaceChildren();
  }

  function fill() {
    if (!index) return;
    visible = searchIcons(index, search.value);
    list.replaceChildren(
      ...visible.map((icon) =>
        h(
          "li",
          { role: "presentation" },
          h(
            "button",
            { class: "template-item", type: "button", role: "option", "data-id": key(icon), tabindex: "-1", onclick: () => select(icon), ondblclick: pick },
            h("span", {}, iconLabel(icon[2])),
            h("span", { class: "engine-tag" }, libraryOf(icon).label),
          ),
        ),
      ),
    );
    select(visible[0], true);
  }

  search.addEventListener("input", debounce(fill, 80));
  search.addEventListener("keydown", (e) => {
    const i = selected ? visible.indexOf(selected) : -1;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      select(visible[Math.max(0, Math.min(visible.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))], true);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick();
    }
  });

  title.textContent = "Loading icons…";
  loadIndex()
    .then((loaded) => {
      index = loaded;
      fill();
    })
    .catch(() => {
      title.textContent = "The icon list couldn't be loaded";
      summary.textContent = "Check your connection and try again.";
    });
  search.focus();
}
