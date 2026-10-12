import { APP_NAME, APP_VERSION, DOCS, MERMAID_VERSION, PLANTUML_VERSION, REPO_URL } from "../config";
import { h, modKey } from "../lib/dom";
import { modal } from "./overlay";

const keys = (...parts: string[]) => h("dt", {}, ...parts.map((p) => h("kbd", {}, p)));

export function openHelp() {
  const shortcuts: [HTMLElement, string][] = [
    [keys(modKey, "K"), "Templates"],
    [keys(modKey, "B"), "Show or hide your diagrams"],
    [keys(modKey, "O"), "Open a file"],
    [keys(modKey, "S"), "Download the source file"],
    [keys(modKey, "Shift", "E"), "Export image"],
    [keys(modKey, "Enter"), "Redraw now"],
    [keys(modKey, "/"), "Comment or uncomment lines"],
    [keys(modKey, "F"), "Find and replace"],
    [keys(modKey, "Space"), "Suggestions"],
  ];
  const canvas: [HTMLElement, string][] = [
    [keys("Drag"), "Pan"],
    [keys(modKey, "Scroll"), "Zoom (or pinch)"],
    [keys("0"), "Fit to view"],
    [keys("1"), "Actual size"],
    [keys("Click"), "Find a shape in the code"],
  ];
  const list = (rows: [HTMLElement, string][]) => h("dl", {}, rows.flatMap(([k, v]) => [k, h("dd", {}, v)]));

  const body = h(
    "div",
    { class: "help" },
    h("div", {}, h("h3", {}, "Keyboard"), list(shortcuts)),
    h(
      "div",
      {},
      h("h3", {}, "Diagram"),
      list(canvas),
      h("h3", {}, "Learning the syntax"),
      h(
        "p",
        {},
        "Start from a template and change it bit by bit. The language references cover every option: ",
        h("a", { href: DOCS.plantuml, target: "_blank", rel: "noopener" }, "PlantUML"),
        " and ",
        h("a", { href: DOCS.mermaid, target: "_blank", rel: "noopener" }, "Mermaid"),
        ".",
      ),
      h(
        "p",
        {},
        "Your diagrams are saved in this browser only. Download the source file to keep a copy or move it to another computer.",
      ),
    ),
    h(
      "p",
      { class: "about" },
      `${APP_NAME} ${APP_VERSION} · PlantUML ${PLANTUML_VERSION} · Mermaid ${MERMAID_VERSION} · MIT licence · `,
      h(
        "a",
        { href: `${import.meta.env.BASE_URL}third-party-licenses.txt`, target: "_blank", rel: "noopener" },
        "Third-party licences",
      ),
      REPO_URL ? " · " : "",
      REPO_URL ? h("a", { href: REPO_URL, target: "_blank", rel: "noopener" }, "Source code") : "",
    ),
  );

  modal({ title: "Help", className: "small", body });
}
