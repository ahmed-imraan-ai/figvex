// Steps through an automaton's runs on the diagram: the current states and
// the arrows just followed light up, and the tape shows the head. The
// runs come from the data-trace attribute the automaton engine writes.

import type { Engine } from "../engines/types";
import { h, icon } from "../lib/dom";
import type { Preview } from "../preview";
import { ICONS } from "./icons";

interface TraceStep {
  s: string[];
  e: number[];
  p: number;
  t?: string[];
  n: string;
}

interface TraceRun {
  input: string;
  accepted: boolean;
  verdict: string;
  tm: boolean;
  steps: TraceStep[];
}

const PLAY_MS = 700;

export class AutomatonPlayer {
  private runs: TraceRun[] = [];
  private run = 0;
  private step = 0;
  private timer = 0;
  private readonly bar: HTMLElement;
  private readonly select: HTMLSelectElement;
  private readonly status: HTMLElement;
  private readonly playBtn: HTMLButtonElement;

  constructor(
    private readonly o: { preview: Preview; pane: HTMLElement; engine: () => Engine },
  ) {
    const button = (label: string, paths: string, run: () => void) => {
      const b = h("button", { type: "button", class: "icon-btn", title: label, "aria-label": label }, icon(paths, 16)) as HTMLButtonElement;
      b.addEventListener("click", run);
      return b;
    };
    this.select = h("select", { class: "field player-input", "aria-label": "Input to step through" }) as HTMLSelectElement;
    this.select.addEventListener("change", () => {
      this.run = Number(this.select.value);
      this.go(0);
    });
    this.playBtn = button("Play", ICONS.play, () => this.toggle());
    this.status = h("span", { class: "player-status", role: "status", "aria-live": "polite" });
    this.bar = h(
      "div",
      { class: "player", role: "group", "aria-label": "Step through the input", hidden: "" },
      this.select,
      button("First step", ICONS.first, () => this.go(0)),
      button("Previous step", ICONS.prev, () => this.go(this.step - 1)),
      this.playBtn,
      button("Next step", ICONS.next, () => this.go(this.step + 1)),
      button("Last step", ICONS.last, () => this.go(this.steps.length - 1)),
      this.status,
    );
    o.pane.append(this.bar);
  }

  private get steps() {
    return this.runs[this.run]?.steps ?? [];
  }

  /** After each drawing: pick up the runs and show the current step again. */
  refresh() {
    const svg = this.o.preview.currentSvg;
    const raw = this.o.engine() === "automaton" ? svg?.getAttribute("data-trace") : null;
    let runs: TraceRun[] = [];
    try {
      runs = raw ? (JSON.parse(raw) as TraceRun[]) : [];
    } catch {
      runs = [];
    }
    if (!runs.length) return this.clear();
    // Keep the place when the same input is still there.
    const same = runs.findIndex((r) => r.input === this.runs[this.run]?.input);
    this.run = same >= 0 ? same : 0;
    this.runs = runs;
    this.select.replaceChildren(...runs.map((r, i) => h("option", { value: String(i) }, `${r.accepted ? "✓" : "✗"} ${r.input}`)));
    this.select.value = String(this.run);
    this.select.hidden = runs.length < 2;
    this.bar.hidden = false;
    this.go(Math.min(this.step, this.steps.length - 1));
  }

  clear() {
    this.stop();
    this.runs = [];
    this.bar.hidden = true;
  }

  private toggle() {
    if (this.timer) return this.stop();
    if (this.step >= this.steps.length - 1) this.go(0);
    this.playBtn.replaceChildren(icon(ICONS.pause, 16));
    this.playBtn.title = this.playBtn.ariaLabel = "Pause";
    this.timer = window.setInterval(() => {
      if (this.step >= this.steps.length - 1) return this.stop();
      this.go(this.step + 1);
    }, PLAY_MS);
  }

  private stop() {
    window.clearInterval(this.timer);
    this.timer = 0;
    this.playBtn.replaceChildren(icon(ICONS.play, 16));
    this.playBtn.title = this.playBtn.ariaLabel = "Play";
  }

  private go(step: number) {
    const steps = this.steps;
    if (!steps.length) return;
    this.step = Math.max(0, Math.min(steps.length - 1, step));
    const run = this.runs[this.run];
    const s = steps[this.step];
    const last = this.step === steps.length - 1;
    this.status.textContent = `${this.step}/${steps.length - 1}  ${s.n}${last ? `. ${run.accepted ? "✓" : "✗"} ${run.verdict}` : ""}`;
    this.highlight(run, s);
  }

  private highlight(run: TraceRun, s: TraceStep) {
    const svg = this.o.preview.currentSvg;
    if (!svg) return;
    for (const el of svg.querySelectorAll("[data-on], [data-done]")) {
      el.removeAttribute("data-on");
      el.removeAttribute("data-done");
    }
    for (const name of s.s) svg.querySelector(`.fa-state[data-state="${CSS.escape(name)}"]`)?.setAttribute("data-on", "");
    for (const k of s.e) svg.querySelector(`.fa-edge[data-edge="${k}"]`)?.setAttribute("data-on", "");
    for (const tape of svg.querySelectorAll<SVGGElement>(".fa-tape")) {
      const mine = tape.getAttribute("data-run") === String(this.run);
      if (mine) tape.removeAttribute("display");
      else tape.setAttribute("display", "none");
      if (!mine) continue;
      tape.querySelectorAll(".fa-cell").forEach((cell, i) => {
        if (run.tm && s.t) {
          const text = cell.querySelector("text");
          if (text) text.textContent = s.t[i] ?? "";
        }
        // A finite automaton has read the cells before p; the head is on p.
        if (i === s.p) cell.setAttribute("data-on", "");
        else if (!run.tm && i < s.p) cell.setAttribute("data-done", "");
      });
    }
  }
}
