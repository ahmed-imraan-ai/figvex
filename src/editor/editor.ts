import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab, redo, toggleComment, undo } from "@codemirror/commands";
import { HighlightStyle, bracketMatching, indentOnInput, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorSelection, EditorState, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  GutterMarker,
  drawSelection,
  gutter,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import type { Engine } from "../engines/types";
import { completionSource } from "./completions";
import { automatonLanguage, chartLanguage, d2Language, dotLanguage, nomnomlLanguage, mermaidLanguage, networkLanguage, orgLanguage, plantumlLanguage, logicLanguage, sketchLanguage, sqlLanguage, structuresLanguage, waveLanguage, wireframeLanguage, xmlLanguage } from "./languages";

// Colours come from CSS variables so light and dark themes share one style.
const highlight = HighlightStyle.define([
  { tag: t.keyword, color: "var(--syn-keyword)" },
  { tag: t.meta, color: "var(--syn-directive)", fontWeight: "600" },
  { tag: t.macroName, color: "var(--syn-macro)" },
  { tag: t.string, color: "var(--syn-string)" },
  { tag: t.comment, color: "var(--syn-comment)", fontStyle: "italic" },
  { tag: t.operator, color: "var(--syn-operator)", fontWeight: "600" },
  { tag: t.number, color: "var(--syn-number)" },
  { tag: t.color, color: "var(--syn-color)" },
  { tag: t.atom, color: "var(--syn-number)" },
  { tag: t.annotation, color: "var(--syn-annotation)" },
  { tag: t.labelName, color: "var(--syn-label)" },
  { tag: t.bracket, color: "var(--ink-3)" },
]);

const baseTheme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "var(--editor-bg)", color: "var(--ink)" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.6" },
  ".cm-content": { padding: "12px 0 40vh", caretColor: "var(--accent)" },
  ".cm-line": { padding: "0 16px 0 10px" },
  ".cm-gutters": {
    backgroundColor: "var(--editor-bg)",
    color: "var(--ink-3)",
    border: "none",
    paddingLeft: "6px",
  },
  ".cm-lineNumbers .cm-gutterElement": { minWidth: "28px", padding: "0 4px 0 0" },
  ".cm-activeLine": { backgroundColor: "var(--active-line)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--ink)" },
  "&.cm-focused .cm-cursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--selection) !important",
  },
  ".cm-matchingBracket": { backgroundColor: "var(--match)", outline: "none" },
  ".cm-selectionMatch": { backgroundColor: "var(--match)" },
  ".cm-placeholder": { color: "var(--ink-3)" },
  ".cm-errorLine": { backgroundColor: "var(--error-line)" },
  ".cm-warnLine": { backgroundColor: "var(--warn-line)" },
  ".cm-warnMarker": {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    backgroundColor: "var(--warn)",
    margin: "8px 0 0 2px",
    cursor: "help",
  },
  ".cm-errorGutter": { width: "10px" },
  ".cm-errorMarker": {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    backgroundColor: "var(--danger)",
    margin: "8px 0 0 2px",
  },
  ".cm-panels": { backgroundColor: "var(--surface)", color: "var(--ink)", borderColor: "var(--rule)" },
  ".cm-panels-top": { borderBottom: "1px solid var(--rule)" },
  ".cm-search": { fontFamily: "var(--font-sans)", fontSize: "13px", padding: "6px 10px" },
  ".cm-search input, .cm-search button": { fontFamily: "inherit", fontSize: "12px" },
  ".cm-textfield": {
    border: "1px solid var(--rule-strong)",
    borderRadius: "3px",
    background: "var(--editor-bg)",
    color: "var(--ink)",
    padding: "2px 6px",
  },
  ".cm-button": {
    backgroundImage: "none",
    background: "var(--surface)",
    border: "1px solid var(--rule-strong)",
    borderRadius: "3px",
    color: "var(--ink)",
  },
  ".cm-tooltip": {
    border: "1px solid var(--rule-strong)",
    backgroundColor: "var(--surface)",
    color: "var(--ink)",
    borderRadius: "4px",
    boxShadow: "var(--shadow-pop)",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete > ul": { fontFamily: "var(--font-mono)", fontSize: "12.5px", maxHeight: "16em" },
  ".cm-tooltip-autocomplete > ul > li": { padding: "2px 10px 2px 8px !important" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--ink)", color: "var(--paper)" },
  ".cm-completionDetail": { color: "var(--ink-3)", fontStyle: "normal", marginLeft: "1em" },
  ".cm-completionIcon": { display: "none" },
});

// Error line: a red dot in its own gutter plus a faint band across the line.
const setErrorLine = StateEffect.define<number | null>();

class ErrorMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-errorMarker";
    return el;
  }
}
const errorMarker = new ErrorMarker();

const errorLineField = StateField.define<{ line: number | null; deco: DecorationSet }>({
  create: () => ({ line: null, deco: Decoration.none }),
  update(value, tr) {
    let line = value.line;
    for (const e of tr.effects) if (e.is(setErrorLine)) line = e.value;
    if (tr.docChanged && line != null) {
      // Keep the marker on the same text while the user edits above it.
      const old = tr.startState.doc;
      if (line <= old.lines) {
        const pos = tr.changes.mapPos(old.line(line).from, 1);
        line = tr.state.doc.lineAt(pos).number;
      } else {
        line = null;
      }
    }
    if (line === value.line && !tr.docChanged) return value;
    if (line == null || line > tr.state.doc.lines) return { line: null, deco: Decoration.none };
    const from = tr.state.doc.line(line).from;
    return { line, deco: Decoration.set([Decoration.line({ class: "cm-errorLine" }).range(from)]) };
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
});

// Warnings: things the engine drew anyway but thinks are wrong, such as an
// address outside its subnet. An amber dot whose tooltip says what's up.
export interface LineWarning {
  line: number;
  message: string;
}

const setWarnings = StateEffect.define<LineWarning[]>();

class WarnMarker extends GutterMarker {
  constructor(readonly message: string) {
    super();
  }
  eq(other: WarnMarker) {
    return other.message === this.message;
  }
  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-warnMarker";
    el.title = this.message;
    return el;
  }
}

const warningField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) {
      if (!e.is(setWarnings)) continue;
      // One decoration per line, carrying every message for it.
      const byLine = new Map<number, string[]>();
      for (const w of e.value) {
        if (w.line < 1 || w.line > tr.state.doc.lines) continue;
        byLine.set(w.line, [...(byLine.get(w.line) ?? []), w.message]);
      }
      return Decoration.set(
        [...byLine]
          .sort((a, b) => a[0] - b[0])
          .map(([line, messages]) => {
            const message = messages.join("\n");
            return Decoration.line({ class: "cm-warnLine", attributes: { title: message }, message }).range(tr.state.doc.line(line).from);
          }),
      );
    }
    return tr.docChanged ? deco.map(tr.changes) : deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const errorGutter = gutter({
  class: "cm-errorGutter",
  lineMarker(view, line) {
    const err = view.state.field(errorLineField).line;
    if (err != null && err <= view.state.doc.lines && view.state.doc.line(err).from === line.from) return errorMarker;
    let message: string | undefined;
    view.state.field(warningField).between(line.from, line.from, (from, _to, d) => {
      if (from === line.from) message = d.spec.message as string;
    });
    return message ? new WarnMarker(message) : null;
  },
  lineMarkerChange: (update) =>
    update.transactions.some((tr) => tr.effects.some((e) => e.is(setErrorLine) || e.is(setWarnings)) || tr.docChanged),
});

export interface EditorCallbacks {
  onChange(code: string): void;
  onCursor(line: number, col: number): void;
}

export class DiagramEditor {
  readonly view: EditorView;
  private language = new Compartment();
  private completion = new Compartment();
  private fontSize = new Compartment();
  private wrapping = new Compartment();
  private silent = false;
  private engine: Engine = "plantuml";
  private size = 14;
  private wrap = false;

  constructor(parent: HTMLElement, private callbacks: EditorCallbacks) {
    this.view = new EditorView({ state: this.createState(""), parent });
  }

  private createState(doc: string): EditorState {
    return EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        errorGutter,
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        indentOnInput(),
        indentUnit.of("  "),
        bracketMatching(),
        closeBrackets(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search({ top: true }),
        errorLineField,
        warningField,
        syntaxHighlighting(highlight),
        baseTheme,
        placeholder("Write a diagram here, or pick a template…"),
        this.language.of(languageFor(this.engine)),
        this.completion.of(completionFor(this.engine)),
        this.fontSize.of(fontTheme(this.size)),
        this.wrapping.of(this.wrap ? EditorView.lineWrapping : []),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...completionKeymap,
          { key: "Mod-/", run: toggleComment },
          indentWithTab,
        ]),
        EditorView.contentAttributes.of({ "aria-label": "Diagram source", spellcheck: "false", autocapitalize: "off" }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !this.silent) this.callbacks.onChange(update.state.doc.toString());
          if (update.selectionSet || update.docChanged) {
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            this.callbacks.onCursor(line.number, head - line.from + 1);
          }
        }),
      ],
    });
  }

  get value(): string {
    return this.view.state.doc.toString();
  }

  /** The 1-based line the cursor is on. */
  get cursorLine(): number {
    return this.view.state.doc.lineAt(this.view.state.selection.main.head).number;
  }

  /** Switch to another document: fresh undo history, cursor at the top. */
  load(code: string, engine: Engine) {
    this.engine = engine;
    this.silent = true;
    this.view.setState(this.createState(code));
    this.silent = false;
    this.view.scrollDOM.scrollTop = 0;
    this.callbacks.onCursor(1, 1);
  }

  /** Replace the text as an undoable edit (used by "replace with template"). */
  replace(code: string) {
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: code },
      selection: EditorSelection.cursor(0),
    });
  }

  /**
   * Change the text to `next` with the smallest edit that gets there, so the
   * cursor and scroll position survive. Used when the sketch canvas writes.
   */
  applyText(next: string) {
    const prev = this.view.state.doc.toString();
    if (prev === next) return;
    let start = 0;
    while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
    let endPrev = prev.length;
    let endNext = next.length;
    while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
      endPrev--;
      endNext--;
    }
    this.view.dispatch({
      changes: { from: start, to: endPrev, insert: next.slice(start, endNext) },
      userEvent: "input.canvas",
    });
  }

  undo() {
    return undo(this.view);
  }

  redo() {
    return redo(this.view);
  }

  setEngine(engine: Engine) {
    if (engine === this.engine) return;
    this.engine = engine;
    this.view.dispatch({
      effects: [this.language.reconfigure(languageFor(engine)), this.completion.reconfigure(completionFor(engine))],
    });
  }

  setFontSize(px: number) {
    this.size = px;
    this.view.dispatch({ effects: this.fontSize.reconfigure(fontTheme(px)) });
  }

  setWrap(on: boolean) {
    this.wrap = on;
    this.view.dispatch({ effects: this.wrapping.reconfigure(on ? EditorView.lineWrapping : []) });
  }

  setErrorLine(line: number | null) {
    const valid = line != null && line >= 1 && line <= this.view.state.doc.lines ? line : null;
    if (this.view.state.field(errorLineField).line === valid) return;
    this.view.dispatch({ effects: setErrorLine.of(valid) });
  }

  setWarnings(list: LineWarning[]) {
    if (!list.length && this.view.state.field(warningField).size === 0) return;
    this.view.dispatch({ effects: setWarnings.of(list) });
  }

  goToLine(line: number, select = true, focus = true) {
    const doc = this.view.state.doc;
    const target = doc.line(Math.max(1, Math.min(line, doc.lines)));
    this.view.dispatch({
      selection: select ? EditorSelection.range(target.from, target.to) : EditorSelection.cursor(target.from),
      effects: EditorView.scrollIntoView(target.from, { y: "center" }),
    });
    if (focus) this.view.focus();
  }

  focus() {
    this.view.focus();
  }
}

const LANGUAGES = { plantuml: plantumlLanguage, mermaid: mermaidLanguage, graphviz: dotLanguage, echarts: chartLanguage, bpmn: xmlLanguage, sketch: sketchLanguage, orgchart: orgLanguage, network: networkLanguage, sql: sqlLanguage, logic: logicLanguage, automaton: automatonLanguage, wavedrom: waveLanguage, structures: structuresLanguage, wireframe: wireframeLanguage, nomnoml: nomnomlLanguage, d2: d2Language } as const;

function languageFor(engine: Engine) {
  return LANGUAGES[engine];
}

function completionFor(engine: Engine) {
  return autocompletion({ override: [completionSource(engine)], icons: false });
}

function fontTheme(px: number) {
  return EditorView.theme({ ".cm-scroller": { fontSize: `${px}px` } });
}
