import DOMPurify from "dompurify";
import { renderDiagram } from "../engines";
import { ENGINE_LABEL } from "../engines/types";
import { debounce, h } from "../lib/dom";
import { renderOptions } from "../store";
import { CATEGORIES, TEMPLATES, type Template } from "../templates";
import { modal } from "./overlay";

export type TemplateMode = "new" | "replace";

export function openTemplates(onPick: (template: Template, mode: TemplateMode) => void, initialEngine?: string) {
  const search = h("input", {
    class: "field",
    type: "search",
    placeholder: "Search templates",
    "aria-label": "Search templates",
    autocomplete: "off",
  });
  const list = h("ul", { class: "template-list", role: "listbox", "aria-label": "Templates" });
  const title = h("h3");
  const summary = h("p");
  const preview = h("div", { class: "template-preview", "aria-live": "polite" });
  const useNew = h("button", { class: "btn btn-ink", type: "button" }, "Open as new diagram");
  const useReplace = h("button", { class: "btn btn-outline", type: "button" }, "Replace current");

  let visible: Template[] = [];
  let selected: Template | undefined;
  let renderToken = 0;

  const body = h(
    "div",
    { class: "templates" },
    list,
    h(
      "div",
      { class: "template-detail" },
      h("div", { class: "template-info" }, title, summary),
      preview,
      h("div", { class: "template-actions" }, useReplace, useNew),
    ),
  );

  const { close } = modal({ title: "Templates", body, headExtra: search });

  const pick = (mode: TemplateMode) => {
    if (!selected) return;
    close();
    onPick(selected, mode);
  };
  useNew.addEventListener("click", () => pick("new"));
  useReplace.addEventListener("click", () => pick("replace"));

  const renderPreview = debounce(async (t: Template) => {
    const token = ++renderToken;
    preview.replaceChildren(h("span", { class: "preview-note" }, "Drawing…"));
    const result = await renderDiagram(t.engine, t.code, { ...renderOptions(false), serverFallback: false });
    if (token !== renderToken) return;
    if (result.ok) {
      preview.innerHTML = DOMPurify.sanitize(result.svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
        ADD_TAGS: ["style"],
      });
      const svg = preview.querySelector("svg");
      svg?.style.removeProperty("max-width");
      svg?.removeAttribute("height");
    } else {
      preview.replaceChildren(h("span", { class: "preview-note" }, result.message || "Nothing to preview"));
    }
  }, 120);

  function select(t: Template | undefined, scroll = false) {
    selected = t;
    for (const el of list.querySelectorAll<HTMLElement>(".template-item")) {
      const on = el.dataset.id === t?.id;
      el.setAttribute("aria-selected", String(on));
      if (on && scroll) el.scrollIntoView({ block: "nearest" });
    }
    useNew.disabled = useReplace.disabled = !t;
    title.textContent = t ? t.title : "No matches";
    summary.textContent = t ? `${ENGINE_LABEL[t.engine]} · ${t.summary}` : "Try a different word, like “sequence” or “gantt”.";
    if (t) renderPreview(t);
    else preview.replaceChildren();
  }

  function fill() {
    const q = search.value.trim().toLowerCase();
    visible = TEMPLATES.filter((t) =>
      !q ? true : `${t.title} ${t.summary} ${t.category} ${ENGINE_LABEL[t.engine]}`.toLowerCase().includes(q),
    );
    list.replaceChildren();
    for (const category of CATEGORIES) {
      const items = visible.filter((t) => t.category === category);
      if (!items.length) continue;
      list.append(h("li", { class: "template-group", role: "presentation" }, category));
      for (const t of items) {
        list.append(
          h(
            "li",
            { role: "presentation" },
            h(
              "button",
              {
                class: "template-item",
                type: "button",
                role: "option",
                "data-id": t.id,
                tabindex: "-1",
                onclick: () => select(t),
                ondblclick: () => pick("new"),
              },
              h("span", {}, t.title),
              h("span", { class: "engine-tag", "data-engine": t.engine }, t.engine === "plantuml" ? "puml" : "mmd"),
            ),
          ),
        );
      }
    }
    // Order of the list on screen, for arrow-key navigation.
    visible = [...list.querySelectorAll<HTMLElement>(".template-item")].map(
      (el) => TEMPLATES.find((t) => t.id === el.dataset.id)!,
    );
    if (!selected || !visible.includes(selected)) select(visible[0], true);
    else select(selected);
  }

  function move(delta: number) {
    if (!visible.length) return;
    const i = selected ? visible.indexOf(selected) : -1;
    select(visible[Math.max(0, Math.min(visible.length - 1, i + delta))], true);
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter" && (e.target === search || (e.target as HTMLElement).classList.contains("template-item"))) {
      e.preventDefault();
      pick("new");
    }
  };
  search.addEventListener("input", fill);
  search.addEventListener("keydown", onKey);
  list.addEventListener("keydown", onKey);

  fill();
  // Start on a template of the current language, skipping the blank ones.
  const first = TEMPLATES.find((t) => t.engine === initialEngine && t.category !== CATEGORIES[0]);
  if (first) select(first, true);
  search.focus();
}
