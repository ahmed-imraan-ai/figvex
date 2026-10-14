// The language picker in the editor head: a text box that filters the
// languages as you type (ARIA combobox with a listbox popup).

import { ENGINE_FILE_EXTS, ENGINE_LABEL, ENGINE_TAG, ENGINES, type Engine } from "../engines/types";
import { h } from "../lib/dom";

/** One line under each language, and extra words it can be found by. */
const ABOUT: Record<Engine, { blurb: string; words: string }> = {
  plantuml: { blurb: "Sequence, class, activity, use case, C4", words: "uml state component deployment er gantt mindmap wbs" },
  mermaid: { blurb: "Flowcharts, sequence, Gantt, journeys", words: "flow chart timeline pie git kanban er mindmap" },
  graphviz: { blurb: "Graphs and trees in DOT", words: "graph digraph network tree neato" },
  echarts: { blurb: "Bar, line, pie and other data charts", words: "chart data csv plot scatter graph" },
  bpmn: { blurb: "Business processes, pools and lanes", words: "process workflow camunda swimlane" },
  sketch: { blurb: "Draw boxes and arrows by hand", words: "draw whiteboard freeform canvas pen" },
  orgchart: { blurb: "People and who they report to", words: "organisation organization team people hierarchy staff" },
  network: { blurb: "Devices, subnets, VLANs and links", words: "lan wan ip subnet vlan router switch firewall topology infrastructure" },
  logic: { blurb: "Truth tables, Karnaugh maps and gate circuits", words: "boolean truth table karnaugh kmap k-map gates circuit minterm algebra digital electronics" },
  sql: { blurb: "ER diagrams from CREATE TABLE statements", words: "er erd entity relationship database schema table ddl postgres mysql sqlite" },
};

function matches(engine: Engine, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const label = ENGINE_LABEL[engine].toLowerCase();
  if (label.startsWith(q) || ENGINE_TAG[engine].startsWith(q)) return 3;
  if (label.includes(q) || ENGINE_FILE_EXTS[engine].some((ext) => ext.startsWith(q))) return 2;
  const { blurb, words } = ABOUT[engine];
  return `${blurb} ${words}`.toLowerCase().split(/[\s,]+/).some((w) => w.startsWith(q)) ? 1 : 0;
}

/** Languages matching the query, best first, in their usual order otherwise. */
export function filterLanguages(query: string): Engine[] {
  return ENGINES.map((e) => [e, matches(e, query)] as const)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([e]) => e);
}

export class LanguagePicker {
  readonly element: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly list: HTMLUListElement;
  private engine: Engine = "plantuml";
  private shown: Engine[] = [];
  private active = 0;

  constructor(private readonly onPick: (engine: Engine) => void) {
    this.list = h("ul", { class: "lang-list", id: "lang-list", role: "listbox", "aria-label": "Languages" });
    this.list.hidden = true;
    this.input = h("input", {
      class: "field lang-input",
      id: "lang-input",
      type: "text",
      role: "combobox",
      "aria-label": "Language",
      "aria-autocomplete": "list",
      "aria-expanded": "false",
      "aria-controls": "lang-list",
      autocomplete: "off",
      spellcheck: "false",
    });
    this.element = h("div", { class: "lang-picker", title: "Language of this diagram. Type to search." }, this.input, this.list);

    this.input.addEventListener("focus", () => {
      this.input.select();
      this.open("");
    });
    this.input.addEventListener("click", () => {
      if (this.list.hidden) this.open("");
    });
    this.input.addEventListener("input", () => this.open(this.input.value));
    this.input.addEventListener("blur", () => this.close());
    this.input.addEventListener("keydown", (e) => this.key(e));
    // Pick on pointerdown so the input keeps focus until the choice is made.
    this.list.addEventListener("pointerdown", (e) => {
      const li = (e.target as HTMLElement).closest<HTMLElement>("[data-engine]");
      if (!li) return;
      e.preventDefault();
      this.pick(li.dataset.engine as Engine);
    });
  }

  set(engine: Engine) {
    this.engine = engine;
    this.element.dataset.engine = engine;
    if (document.activeElement !== this.input) this.input.value = ENGINE_LABEL[engine];
  }

  private open(query: string) {
    this.shown = filterLanguages(query);
    const current = this.shown.indexOf(this.engine);
    this.active = query.trim() || current < 0 ? 0 : current;
    this.list.replaceChildren(
      ...this.shown.map((e, i) =>
        h(
          "li",
          { role: "option", id: `lang-opt-${e}`, "data-engine": e, "aria-selected": String(i === this.active), "aria-current": e === this.engine ? "true" : null },
          h("span", { class: "engine-tag", "data-engine": e }, ENGINE_TAG[e]),
          h("span", { class: "lang-name" }, ENGINE_LABEL[e]),
          h("span", { class: "lang-blurb" }, ABOUT[e].blurb),
        ),
      ),
    );
    if (!this.shown.length) this.list.append(h("li", { class: "lang-none" }, "No language matches"));
    this.list.hidden = false;
    this.input.setAttribute("aria-expanded", "true");
    this.highlight();
  }

  private close() {
    this.list.hidden = true;
    this.input.setAttribute("aria-expanded", "false");
    this.input.removeAttribute("aria-activedescendant");
    this.input.value = ENGINE_LABEL[this.engine];
  }

  private highlight() {
    this.list.querySelectorAll<HTMLElement>("[role=option]").forEach((li, i) => {
      li.setAttribute("aria-selected", String(i === this.active));
      if (i === this.active) li.scrollIntoView({ block: "nearest" });
    });
    const e = this.shown[this.active];
    if (e) this.input.setAttribute("aria-activedescendant", `lang-opt-${e}`);
    else this.input.removeAttribute("aria-activedescendant");
  }

  private key(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (this.list.hidden) return this.open("");
      if (!this.shown.length) return;
      this.active = (this.active + (e.key === "ArrowDown" ? 1 : -1) + this.shown.length) % this.shown.length;
      this.highlight();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const choice = this.shown[this.active];
      if (!this.list.hidden && choice) this.pick(choice);
    } else if (e.key === "Escape") {
      e.preventDefault();
      this.close();
      this.input.blur();
    }
  }

  private pick(engine: Engine) {
    this.close();
    this.input.blur();
    if (engine !== this.engine) this.onPick(engine);
  }
}
