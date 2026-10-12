import { PLANTUML_SERVER } from "../config";
import { h } from "../lib/dom";
import { store, type Settings } from "../store";

function segmented<K extends keyof Settings>(key: K, options: [Settings[K], string][], label: string) {
  const buttons = options.map(([value, text]) =>
    h(
      "button",
      {
        type: "button",
        role: "radio",
        "aria-checked": String(store.settings[key] === value),
        onclick: (e: Event) => {
          store.setSettings({ [key]: value } as Partial<Settings>);
          for (const b of buttons) b.setAttribute("aria-checked", String(b === e.currentTarget));
        },
      },
      text,
    ),
  );
  return h("div", { class: "segmented", role: "radiogroup", "aria-label": label }, buttons);
}

function toggle<K extends keyof Settings>(key: K, id: string) {
  const input = h("input", { class: "switch", type: "checkbox", id, role: "switch" });
  input.checked = Boolean(store.settings[key]);
  input.addEventListener("change", () => store.setSettings({ [key]: input.checked } as Partial<Settings>));
  return input;
}

export function buildSettingsPanel(): HTMLElement {
  const fontSize = h("select", { class: "field", "aria-label": "Editor font size" });
  for (const px of [12, 13, 14, 15, 16, 18, 20]) {
    const opt = h("option", { value: String(px) }, `${px} px`);
    opt.selected = store.settings.fontSize === px;
    fontSize.append(opt);
  }
  fontSize.addEventListener("change", () => store.setSettings({ fontSize: Number(fontSize.value) }));

  const server = new URL(PLANTUML_SERVER).host;

  return h(
    "div",
    {},
    h(
      "div",
      { class: "panel-section" },
      h("h3", { class: "panel-title" }, "Appearance"),
      h(
        "div",
        { class: "panel-row" },
        h("span", {}, "App"),
        segmented("theme", [["system", "Auto"], ["light", "Light"], ["dark", "Dark"]], "App theme"),
      ),
      h(
        "div",
        { class: "panel-row" },
        h("span", {}, "Diagrams"),
        segmented("diagramTheme", [["light", "Light"], ["dark", "Dark"], ["match", "Match app"]], "Diagram theme"),
      ),
      h(
        "div",
        { class: "panel-row" },
        h("span", {}, "Mermaid style"),
        segmented("mermaidLook", [["classic", "Classic"], ["handDrawn", "Sketch"]], "Mermaid look"),
      ),
    ),
    h(
      "div",
      { class: "panel-section" },
      h("h3", { class: "panel-title" }, "Editor"),
      h("div", { class: "panel-row" }, h("label", {}, "Font size"), fontSize),
      h("div", { class: "panel-row" }, h("label", { for: "set-wrap" }, "Wrap long lines"), toggle("wrap", "set-wrap")),
      h(
        "div",
        { class: "panel-row" },
        h("label", { for: "set-live" }, "Redraw while typing"),
        toggle("liveRender", "set-live"),
      ),
      store.settings.liveRender ? null : h("p", { class: "panel-hint" }, "Press Ctrl+Enter to redraw."),
    ),
    h(
      "div",
      { class: "panel-section" },
      h("h3", { class: "panel-title" }, "PlantUML"),
      h(
        "div",
        { class: "panel-row" },
        h("label", { for: "set-server" }, "Use server for missing types"),
        toggle("serverFallback", "set-server"),
      ),
      h(
        "p",
        { class: "panel-hint" },
        `Salt, ditaa, math, nwdiag and a few other types aren't in the browser engine yet. With this on, only those diagrams are sent to ${server} to be drawn.`,
      ),
    ),
  );
}
