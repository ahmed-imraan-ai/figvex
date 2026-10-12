import { APP_NAME, APP_VERSION, ISSUES_URL, MERMAID_VERSION, PLANTUML_VERSION, REPO_URL } from "../config";
import { h, icon } from "../lib/dom";
import { ICONS, type IconName } from "./icons";
import { closePopover, modal } from "./overlay";
import { openHelp } from "./help-dialog";

const LICENSES_URL = `${import.meta.env.BASE_URL}third-party-licenses.txt`;

function mark(): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "about-mark");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML =
    '<path d="M5 19C6.5 8 17.5 16 19 5" class="brand-curve"/>' +
    '<rect x="2.6" y="16.6" width="4.8" height="4.8" class="brand-anchor"/>' +
    '<rect x="16.6" y="2.6" width="4.8" height="4.8" class="brand-anchor"/>';
  return svg;
}

function linkRow(iconName: IconName, label: string, href: string, detail?: string) {
  return h(
    "li",
    {},
    h(
      "a",
      { href, target: "_blank", rel: "noopener" },
      icon(ICONS[iconName]),
      h("span", {}, label, detail ? h("span", { class: "menu-sub" }, detail) : ""),
    ),
  );
}

export function openAbout() {
  const links = h("ul", { class: "menu-list about-links" });
  if (REPO_URL) {
    links.append(
      linkRow("github", "Source code on GitHub", REPO_URL, REPO_URL.replace(/^https:\/\//, "")),
      linkRow("flag", "Report a problem or suggest an idea", ISSUES_URL),
      linkRow("scale", "Licence: MIT", `${REPO_URL}/blob/main/LICENSE`),
    );
  }
  links.append(linkRow("file", "Third-party licences", LICENSES_URL, "Every package Figvex ships, with its licence"));
  if (REPO_URL) {
    links.append(linkRow("people", "Code of Conduct", `${REPO_URL}/blob/main/CODE_OF_CONDUCT.md`));
  }

  const body = h(
    "div",
    { class: "about-box" },
    h(
      "div",
      { class: "about-head" },
      mark(),
      h("div", {}, h("p", { class: "about-name" }, APP_NAME.toLowerCase()), h("p", { class: "about-version" }, `Version ${APP_VERSION}`)),
    ),
    h(
      "p",
      { class: "about-text" },
      "A live editor for PlantUML and Mermaid diagrams, built for computer science students. Diagrams are drawn in your browser and stay there unless you share them or turn on the PlantUML server option.",
    ),
    REPO_URL ? null : h("p", { class: "about-text" }, `${APP_NAME} is open source under the MIT licence.`),
    links,
    h("p", { class: "about-foot" }, `PlantUML ${PLANTUML_VERSION} · Mermaid ${MERMAID_VERSION}`),
  );

  modal({ title: `About ${APP_NAME}`, className: "small about", body });
}

/** The menu behind the header's help button. */
export function buildHelpMenu(): HTMLElement {
  const item = (iconName: IconName, label: string, run: () => void) =>
    h(
      "li",
      {},
      h(
        "button",
        {
          type: "button",
          role: "menuitem",
          onclick: () => {
            closePopover();
            run();
          },
        },
        icon(ICONS[iconName]),
        label,
      ),
    );
  const link = (iconName: IconName, label: string, href: string) =>
    h(
      "li",
      {},
      h(
        "a",
        { href, target: "_blank", rel: "noopener", role: "menuitem", onclick: () => closePopover() },
        icon(ICONS[iconName]),
        label,
        icon(ICONS.external, 13),
      ),
    );

  return h(
    "div",
    { class: "panel-section help-menu" },
    h(
      "ul",
      { class: "menu-list", role: "menu" },
      item("keyboard", "Help and shortcuts", openHelp),
      item("info", `About ${APP_NAME}`, openAbout),
      REPO_URL ? link("github", "Source code on GitHub", REPO_URL) : null,
      ISSUES_URL ? link("flag", "Report a problem", ISSUES_URL) : null,
    ),
  );
}
