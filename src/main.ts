import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./styles.css";

import { APP_NAME, DEPLOY_LABEL, DOCS, MERMAID_VERSION, PLANTUML_VERSION, REPO_URL } from "./config";
import { DiagramEditor } from "./editor/editor";
import {
  detectEngine,
  diagramKind,
  ENGINE_LABEL,
  renderDiagram,
  type Engine,
  type RenderFailure,
  type RenderResult,
} from "./engines";
import { isPlantUmlLoaded, loadPlantUml } from "./engines/plantuml";
import { MERMAID_STYLES, PLANTUML_STYLES, PLANTUML_THEMES } from "./engines/themes";
import { byId, debounce, h, icon, isMac, modKey } from "./lib/dom";
import { Preview, type SourceHint } from "./preview";
import { hasSharedDiagram, readSharedDiagram } from "./share";
import { renderOptions, store, type Doc, type Settings } from "./store";
import { WELCOME_CODE, type Template } from "./templates";
import { buildExportPanel, downloadSource } from "./ui/export-panel";
import { openHelp } from "./ui/help-dialog";
import { ICONS } from "./ui/icons";
import { Library } from "./ui/library";
import { closePopover, toast, togglePopover } from "./ui/overlay";
import { buildSettingsPanel } from "./ui/settings-panel";
import { buildSharePanel } from "./ui/share-panel";
import { openTemplates } from "./ui/templates-dialog";

const BLANK: Record<Engine, string> = {
  plantuml: "@startuml\n\n@enduml\n",
  mermaid: "flowchart TD\n    A --> B\n",
};
const DEFAULT_TITLE = "Untitled diagram";

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

const ui = {
  workspace: byId("workspace"),
  titleInput: byId<HTMLInputElement>("doc-title"),
  saveState: byId("save-state"),
  engineSwitch: byId("engine-switch"),
  styleSelect: byId<HTMLSelectElement>("style-select"),
  syntaxLink: byId<HTMLAnchorElement>("link-syntax"),
  previewPane: document.querySelector<HTMLElement>(".pane-preview")!,
  previewMessage: byId("preview-message"),
  errorCard: byId("error-card"),
  zoomLevel: byId("zoom-level"),
  statusEngine: byId("status-engine"),
  statusRender: byId("status-render"),
  statusCursor: byId("status-cursor"),
  splitter: byId("splitter"),
  fileInput: byId<HTMLInputElement>("file-input"),
  dropOverlay: byId("drop-overlay"),
  btn: {
    library: byId<HTMLButtonElement>("btn-library"),
    templates: byId<HTMLButtonElement>("btn-templates"),
    open: byId<HTMLButtonElement>("btn-open"),
    share: byId<HTMLButtonElement>("btn-share"),
    export: byId<HTMLButtonElement>("btn-export"),
    settings: byId<HTMLButtonElement>("btn-settings"),
    help: byId<HTMLButtonElement>("btn-help"),
    zoomIn: byId<HTMLButtonElement>("zoom-in"),
    zoomOut: byId<HTMLButtonElement>("zoom-out"),
    zoomFit: byId<HTMLButtonElement>("zoom-fit"),
  },
};

ui.btn.library.append(icon(ICONS.sidebar, 18));
ui.btn.settings.append(icon(ICONS.sliders, 18));
ui.btn.help.append(icon(ICONS.help, 18));
ui.btn.zoomIn.append(icon(ICONS.plus));
ui.btn.zoomOut.append(icon(ICONS.minus));
ui.btn.zoomFit.append(icon(ICONS.fit));
ui.btn.library.title = `Your diagrams (${modKey}+B)`;
ui.btn.templates.title = `Templates (${modKey}+K)`;
ui.btn.open.title = `Open a .puml or .mmd file (${modKey}+O)`;
ui.btn.export.title = `Export (${modKey}+Shift+E)`;
ui.btn.zoomIn.title = "Zoom in (+)";
ui.btn.zoomOut.title = "Zoom out (−)";
ui.btn.zoomFit.title = "Fit to view (0)";

if (DEPLOY_LABEL) {
  const badge = byId("env-badge");
  badge.textContent = DEPLOY_LABEL;
  badge.title = `This is the ${DEPLOY_LABEL} site, not the live one.`;
  badge.hidden = false;
}

if (REPO_URL) {
  const repo = byId<HTMLAnchorElement>("link-repo");
  repo.href = REPO_URL;
  repo.hidden = false;
  repo.append(icon(ICONS.github, 18));
}

// ---------------------------------------------------------------------------
// Editor and preview
// ---------------------------------------------------------------------------

const editor = new DiagramEditor(byId("editor"), {
  onChange: (code) => onCodeChange(code),
  onCursor: (line, col) => (ui.statusCursor.textContent = `Ln ${line}, Col ${col}`),
});

const preview = new Preview(byId("stage"), byId("canvas"), byId("sheet"), {
  onZoom: (scale) => (ui.zoomLevel.textContent = `${Math.round(scale * 100)}%`),
  onPick: (hint) => revealInCode(hint),
});

ui.btn.zoomIn.addEventListener("click", () => preview.zoomBy(1.25));
ui.btn.zoomOut.addEventListener("click", () => preview.zoomBy(0.8));
ui.btn.zoomFit.addEventListener("click", () => preview.fit());
ui.zoomLevel.addEventListener("click", () => preview.actualSize());

// ---------------------------------------------------------------------------
// Current document
// ---------------------------------------------------------------------------

let doc: Doc;
let engine: Engine = "plantuml";

function openDoc(next: Doc) {
  if (doc && doc.id !== next.id) flushSave();
  doc = next;
  engine = next.engine;
  if (store.currentId !== next.id) store.select(next.id);
  editor.load(next.code, engine);
  ui.titleInput.value = next.title;
  updateTitle();
  updateEngineUi();
  lastGood = null;
  preview.clear();
  hideError();
  ui.saveState.textContent = "";
  renderNow();
}

function updateTitle() {
  document.title = `${doc.title} · ${APP_NAME}`;
}

function updateEngineUi() {
  for (const b of ui.engineSwitch.querySelectorAll<HTMLButtonElement>("button")) {
    b.setAttribute("aria-checked", String(b.dataset.engine === engine));
  }
  editor.setEngine(engine);
  fillStylePicker();
  ui.syntaxLink.href = DOCS[engine];
  ui.syntaxLink.textContent = `${ENGINE_LABEL[engine]} syntax`;
  updateStatusEngine();
}

function updateStatusEngine() {
  const kind = diagramKind(editor.value, engine);
  const version = engine === "plantuml" ? PLANTUML_VERSION : MERMAID_VERSION;
  ui.statusEngine.textContent = `${ENGINE_LABEL[engine]} ${version}${kind ? ` · ${kind}` : ""}`;
}

// The style picker lists PlantUML themes or Mermaid themes. A theme chosen
// inside the diagram itself wins, and the picker says so.
function fillStylePicker() {
  const select = ui.styleSelect;
  const option = (value: string, label: string) => h("option", { value }, label);
  select.replaceChildren();
  if (engine === "plantuml") {
    const own = editor.value.match(/^\s*!theme\s+([\w-]+)/m)?.[1];
    if (own) select.append(option("__own", `${own} (set in diagram)`));
    select.append(
      ...PLANTUML_STYLES.map((s) => option(s.value, s.label)),
      h("optgroup", { label: "PlantUML themes" }, ...PLANTUML_THEMES.map((t) => option(t, t))),
    );
    select.value = own ? "__own" : store.settings.plantumlTheme;
    select.disabled = !!own;
  } else {
    select.append(...MERMAID_STYLES.map((s) => option(s.value, s.label)));
    select.value = store.settings.mermaidTheme;
    select.disabled = false;
  }
}

ui.styleSelect.addEventListener("change", () => {
  const value = ui.styleSelect.value;
  if (engine === "plantuml") store.setSettings({ plantumlTheme: value });
  else store.setSettings({ mermaidTheme: value as Settings["mermaidTheme"] });
});

// Saving is debounced; flushSave() runs it immediately (e.g. before switching).
let pendingCode: string | null = null;
const saveSoon = debounce(() => flushSave(), 400);

function flushSave() {
  saveSoon.cancel();
  if (pendingCode == null || !doc) return;
  store.update(doc.id, { code: pendingCode });
  pendingCode = null;
  ui.saveState.textContent = "Saved";
}
window.addEventListener("pagehide", flushSave);
document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flushSave());

function onCodeChange(code: string) {
  pendingCode = code;
  ui.saveState.textContent = "Editing";
  saveSoon();

  const detected = detectEngine(code);
  if (detected && detected !== engine) {
    engine = detected;
    store.update(doc.id, { engine });
    updateEngineUi();
    lastGood = null;
    preview.clear();
  }
  updateStatusEngine();
  if (engine === "plantuml") {
    const hasOwnTheme = /^\s*!theme\s+[\w-]+/m.test(code);
    if (hasOwnTheme !== ui.styleSelect.disabled) fillStylePicker();
  }
  if (store.settings.liveRender) scheduleRender();
}

ui.titleInput.addEventListener("input", () => {
  doc.title = ui.titleInput.value;
  updateTitle();
  saveTitle();
});
const saveTitle = debounce(() => store.update(doc.id, { title: ui.titleInput.value.trim() || DEFAULT_TITLE }), 400);
ui.titleInput.addEventListener("blur", () => {
  if (!ui.titleInput.value.trim()) ui.titleInput.value = DEFAULT_TITLE;
  saveTitle();
});
ui.titleInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === "Escape") editor.focus();
});

ui.engineSwitch.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-engine]");
  const wanted = target?.dataset.engine as Engine | undefined;
  if (!wanted || wanted === engine) return;
  const code = editor.value;
  const isBlank = !code.trim() || code === BLANK[engine];
  if (isBlank) {
    engine = wanted;
    store.update(doc.id, { engine });
    updateEngineUi();
    editor.replace(BLANK[wanted]);
    editor.focus();
    return;
  }
  if (detectEngine(code) === engine) {
    toast(`This diagram is written in ${ENGINE_LABEL[engine]}.`, {
      action: { label: `New ${ENGINE_LABEL[wanted]} diagram`, run: () => createDoc(DEFAULT_TITLE, wanted, BLANK[wanted]) },
    });
    return;
  }
  engine = wanted;
  store.update(doc.id, { engine });
  updateEngineUi();
  renderNow();
});

function createDoc(title: string, eng: Engine, code: string): Doc {
  flushSave();
  const created = store.create({ title: store.uniqueTitle(title), engine: eng, code });
  openDoc(created);
  return created;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** Raw SVG of the last successful render, used for exports. */
let lastGood: { svg: string; tone: "light" | "dark" } | null = null;
/** Maps rendered line numbers back to the editor (styles add a line). */
let mapLine = (line: number) => line;
let renderSeq = 0;
const enginesUsed = new Set<Engine>();

const scheduleRender = debounce(() => renderNow(), 200);

function diagramTone(): "light" | "dark" {
  const setting = store.settings.diagramTheme;
  if (setting !== "match") return setting;
  return appIsDark() ? "dark" : "light";
}

function appIsDark(): boolean {
  const t = store.settings.theme;
  return t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
}

async function renderNow() {
  scheduleRender.cancel();
  const code = editor.value;
  const eng = engine;
  const tone = diagramTone();
  const seq = ++renderSeq;

  if (!code.trim()) {
    lastGood = null;
    preview.clear();
    hideError();
    showMessage("Nothing to draw yet", `Type some ${ENGINE_LABEL[eng]}, or pick a template to start from.`);
    setRenderStatus("", "idle");
    return;
  }

  setRenderStatus("Drawing", "busy");
  const firstTime = !enginesUsed.has(eng) && !(eng === "plantuml" && isPlantUmlLoaded() && enginesUsed.size);
  if (firstTime && !preview.hasDiagram) {
    showMessage(
      `Loading ${ENGINE_LABEL[eng]}`,
      eng === "plantuml" ? "The engine is about 5 MB and is cached after the first visit." : "",
      true,
    );
  }

  let result: RenderResult;
  try {
    result = await renderDiagram(eng, code, renderOptions(tone === "dark"));
  } catch (err) {
    result = { ok: false, message: err instanceof Error ? err.message : String(err), ms: 0 };
  }
  if (seq !== renderSeq) return; // a newer render has started
  enginesUsed.add(eng);
  hideMessage();

  if (!result.ok && !result.message) {
    lastGood = null;
    preview.clear();
    hideError();
    showMessage("Nothing to draw yet", `Add some ${ENGINE_LABEL[eng]} between the start and end lines, or pick a template.`);
    setRenderStatus("", "idle");
    return;
  }

  if (result.ok) {
    mapLine = result.mapLine ?? ((line: number) => line);
    try {
      preview.show(result.svg, tone);
    } catch (err) {
      showError({ ok: false, message: err instanceof Error ? err.message : String(err), ms: 0 });
      return;
    }
    lastGood = { svg: result.svg, tone };
    hideError();
    const where = result.remote ? " on plantuml.com" : "";
    setRenderStatus(`Drawn${where} in ${formatMs(result.ms)}`, "ok");
  } else {
    showError(result);
  }
}

function formatMs(ms: number) {
  return ms < 1000 ? `${Math.max(1, Math.round(ms))} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function setRenderStatus(text: string, state: "idle" | "busy" | "ok" | "error") {
  ui.statusRender.textContent = text;
  ui.statusRender.dataset.state = state;
}

function showMessage(title: string, detail: string, spinner = false) {
  ui.previewMessage.replaceChildren(
    spinner ? h("span", { class: "spinner", "aria-hidden": "true" }) : "",
    h("strong", {}, title),
    detail ? h("span", {}, detail) : "",
  );
  ui.previewMessage.hidden = false;
}

function hideMessage() {
  ui.previewMessage.hidden = true;
}

function hideError() {
  ui.errorCard.hidden = true;
  ui.previewPane.classList.remove("has-error", "is-stale");
  editor.setErrorLine(null);
}

function showError(err: RenderFailure) {
  editor.setErrorLine(err.line ?? null);
  ui.previewPane.classList.add("has-error");
  ui.previewPane.classList.toggle("is-stale", preview.hasDiagram);
  setRenderStatus(err.line ? `Error on line ${err.line}` : err.unsupported ? "Not supported" : "Error", "error");

  const actions: HTMLElement[] = [];
  if (err.line) {
    actions.push(
      h("button", { class: "btn btn-outline", type: "button", onclick: () => editor.goToLine(err.line!) }, `Go to line ${err.line}`),
    );
  }
  if (err.unsupported) {
    actions.push(
      h(
        "button",
        {
          class: "btn btn-outline",
          type: "button",
          onclick: () => {
            store.setSettings({ serverFallback: true });
            toast("Diagram types missing from the browser engine will now be drawn by plantuml.com.");
          },
        },
        "Draw it with plantuml.com",
      ),
    );
  }
  actions.push(h("a", { class: "btn", href: DOCS[engine], target: "_blank", rel: "noopener" }, "Syntax reference"));

  const heading = err.unsupported
    ? "Not in the browser engine yet"
    : err.line
      ? `Problem on line ${err.line}`
      : "Couldn't draw this diagram";
  const detail = err.unsupported
    ? `${err.message} Turn on the PlantUML server option to have plantuml.com draw just these diagrams.`
    : err.message;
  ui.errorCard.replaceChildren(h("h2", {}, heading), h("p", {}, detail), h("div", { class: "error-actions" }, actions));
  ui.errorCard.hidden = false;
}

function revealInCode(hint: SourceHint) {
  const lines = editor.value.split(/\r?\n/);
  let line: number | undefined;
  if (hint.kind === "line") {
    const mapped = mapLine(hint.line);
    const text = lines[mapped - 1] ?? "";
    if (mapped <= lines.length && (!hint.name || text.includes(hint.name) || text.includes(hint.name.split(".").pop()!))) {
      line = mapped;
    }
  }
  const name = hint.kind === "name" ? hint.name : hint.name;
  if (line == null && name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^\\w])${escaped}([^\\w]|$)`);
    const idx = lines.findIndex((l) => re.test(l));
    if (idx >= 0) line = idx + 1;
  }
  if (line == null) return;
  setMobileView("code");
  editor.goToLine(line);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

let appliedSettings: Settings = { ...store.settings };

function applyTheme() {
  const t = store.settings.theme;
  if (t === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

function applySettings(force = false) {
  const s = store.settings;
  const prev = appliedSettings;
  if (force || s.theme !== prev.theme) applyTheme();
  if (force || s.fontSize !== prev.fontSize) editor.setFontSize(s.fontSize);
  if (force || s.wrap !== prev.wrap) editor.setWrap(s.wrap);
  if (force || s.splitRatio !== prev.splitRatio) ui.workspace.style.setProperty("--split", `${s.splitRatio * 100}%`);
  if (s.plantumlTheme !== prev.plantumlTheme || s.mermaidTheme !== prev.mermaidTheme) fillStylePicker();
  const needsRender =
    s.diagramTheme !== prev.diagramTheme ||
    s.plantumlTheme !== prev.plantumlTheme ||
    s.mermaidTheme !== prev.mermaidTheme ||
    s.mermaidLook !== prev.mermaidLook ||
    s.serverFallback !== prev.serverFallback ||
    (s.theme !== prev.theme && s.diagramTheme === "match") ||
    (s.liveRender && !prev.liveRender);
  appliedSettings = { ...s };
  if (!force && needsRender && doc) renderNow();
}

store.subscribe(() => applySettings());
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (store.settings.theme === "system" && store.settings.diagramTheme === "match") renderNow();
});

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

const library = new Library(byId("library"), ui.btn.library, {
  onNew: () => showTemplates(),
  onOpen: (d) => {
    if (d.id !== doc?.id) openDoc(d);
    if (isNarrow()) library.toggle(false);
  },
});

ui.btn.library.addEventListener("click", () => library.toggle());
ui.btn.templates.addEventListener("click", () => showTemplates());
ui.btn.open.addEventListener("click", () => ui.fileInput.click());
ui.btn.help.addEventListener("click", () => openHelp());

ui.btn.export.addEventListener("click", () => showExport());
ui.btn.share.addEventListener("click", () => {
  flushSave();
  togglePopover(ui.btn.share, "Share", () => buildSharePanel({ title: doc.title, engine, code: editor.value }));
});
ui.btn.settings.addEventListener("click", () => togglePopover(ui.btn.settings, "Settings", buildSettingsPanel));

function showExport() {
  togglePopover(ui.btn.export, "Export", () =>
    buildExportPanel({
      title: doc.title,
      engine,
      code: editor.value,
      svg: ui.errorCard.hidden ? (lastGood?.svg ?? null) : null,
      tone: lastGood?.tone ?? diagramTone(),
    }),
  );
}

function showTemplates() {
  openTemplates((t: Template, mode) => {
    if (mode === "new") {
      createDoc(t.category === "Start from scratch" ? DEFAULT_TITLE : t.title, t.engine, t.code);
    } else {
      engine = t.engine;
      store.update(doc.id, { engine });
      updateEngineUi();
      editor.replace(t.code);
      toast("Replaced. Undo with " + `${modKey}+Z.`);
    }
    editor.focus();
  }, engine);
}

// ---------------------------------------------------------------------------
// Opening files
// ---------------------------------------------------------------------------

async function openFile(file: File) {
  if (file.size > 2_000_000) {
    toast(`${file.name} is too large to be a diagram source file.`, { error: true });
    return;
  }
  let text = await file.text();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  let eng: Engine | null = ext === "mmd" || ext === "mermaid" ? "mermaid" : ["puml", "plantuml", "pu", "iuml", "wsd"].includes(ext) ? "plantuml" : null;

  if (ext === "md" || ext === "markdown") {
    const block = text.match(/```(plantuml|puml|mermaid)\s*\n([\s\S]*?)```/);
    if (!block) {
      toast(`No plantuml or mermaid code block found in ${file.name}.`, { error: true });
      return;
    }
    eng = block[1] === "mermaid" ? "mermaid" : "plantuml";
    text = block[2];
  }
  eng = detectEngine(text) ?? eng ?? engine;
  const title = file.name.replace(/\.[^.]+$/, "") || DEFAULT_TITLE;
  createDoc(title, eng, text);
  toast(`Opened ${file.name}`);
}

ui.fileInput.addEventListener("change", () => {
  const file = ui.fileInput.files?.[0];
  if (file) openFile(file);
  ui.fileInput.value = "";
});

let dragDepth = 0;
const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes("Files");
window.addEventListener("dragenter", (e) => {
  if (!hasFiles(e)) return;
  dragDepth++;
  ui.dropOverlay.hidden = false;
});
window.addEventListener("dragleave", (e) => {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) ui.dropOverlay.hidden = true;
});
window.addEventListener("dragover", (e) => {
  if (hasFiles(e)) e.preventDefault();
});
window.addEventListener("drop", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  ui.dropOverlay.hidden = true;
  const file = e.dataTransfer?.files[0];
  if (file) openFile(file);
});

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------

window.addEventListener("keydown", (e) => {
  const mod = isMac ? e.metaKey : e.ctrlKey;
  const key = e.key.toLowerCase();
  if (document.querySelector("dialog[open]") && !(mod && key === "k")) return;

  if (mod && !e.altKey) {
    const handlers: Record<string, () => void> = {
      s: () => (flushSave(), downloadSource({ title: doc.title, engine, code: editor.value })),
      o: () => ui.fileInput.click(),
      k: () => {
        document.querySelector<HTMLDialogElement>("dialog[open]")?.close();
        showTemplates();
      },
      b: () => library.toggle(),
      enter: () => renderNow(),
    };
    if (e.shiftKey && key === "e") {
      e.preventDefault();
      showExport();
      return;
    }
    const run = !e.shiftKey ? handlers[key] : undefined;
    if (run) {
      e.preventDefault();
      run();
    }
    return;
  }

  const typing = (e.target as HTMLElement).closest("input, textarea, select, [contenteditable='true'], .cm-editor");
  if (!typing && (e.key === "?" || e.key === "F1")) {
    e.preventDefault();
    openHelp();
  }
  if (e.key === "F1" && typing) {
    e.preventDefault();
    openHelp();
  }
});

// ---------------------------------------------------------------------------
// Split view and narrow screens
// ---------------------------------------------------------------------------

function setSplit(ratio: number, save = false) {
  const clamped = Math.min(0.75, Math.max(0.2, ratio));
  ui.workspace.style.setProperty("--split", `${clamped * 100}%`);
  if (save) store.setSettings({ splitRatio: Math.round(clamped * 1000) / 1000 });
}

function splitFromX(clientX: number): number {
  const lib = library.isOpen ? byId("library").getBoundingClientRect().width : 0;
  const box = ui.workspace.getBoundingClientRect();
  return (clientX - box.left - lib) / (box.width - lib);
}

ui.splitter.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  ui.splitter.setPointerCapture(e.pointerId);
  ui.splitter.classList.add("is-dragging");
  document.body.classList.add("is-resizing");
  const move = (ev: PointerEvent) => setSplit(splitFromX(ev.clientX));
  const up = (ev: PointerEvent) => {
    ui.splitter.removeEventListener("pointermove", move);
    ui.splitter.removeEventListener("pointerup", up);
    ui.splitter.classList.remove("is-dragging");
    document.body.classList.remove("is-resizing");
    setSplit(splitFromX(ev.clientX), true);
  };
  ui.splitter.addEventListener("pointermove", move);
  ui.splitter.addEventListener("pointerup", up);
});
ui.splitter.addEventListener("dblclick", () => setSplit(0.42, true));
ui.splitter.addEventListener("keydown", (e) => {
  const step = e.key === "ArrowLeft" ? -0.02 : e.key === "ArrowRight" ? 0.02 : 0;
  if (step) {
    e.preventDefault();
    setSplit(store.settings.splitRatio + step, true);
  }
});

const narrowQuery = matchMedia("(max-width: 760px)");
const isNarrow = () => narrowQuery.matches;

function setMobileView(view: "code" | "diagram") {
  if (!isNarrow()) return;
  ui.workspace.dataset.view = view;
  byId("tab-code").setAttribute("aria-selected", String(view === "code"));
  byId("tab-diagram").setAttribute("aria-selected", String(view === "diagram"));
  if (view === "diagram") requestAnimationFrame(() => preview.fit());
}
byId("tab-code").addEventListener("click", () => setMobileView("code"));
byId("tab-diagram").addEventListener("click", () => setMobileView("diagram"));

// ---------------------------------------------------------------------------
// Start-up
// ---------------------------------------------------------------------------

async function importSharedLink(): Promise<boolean> {
  if (!hasSharedDiagram()) return false;
  const shared = await readSharedDiagram();
  history.replaceState(null, "", location.pathname + location.search);
  if (!shared) {
    toast("That share link is incomplete or damaged.", { error: true });
    return false;
  }
  const existing = store.docs.find((d) => d.code === shared.code);
  if (existing) {
    openDoc(existing);
  } else {
    createDoc(shared.title, shared.engine, shared.code);
    toast("Opened a shared diagram. It's now saved in your diagrams.");
  }
  return true;
}

async function start() {
  applySettings(true);
  // Start downloading PlantUML right away; most visitors will need it.
  loadPlantUml().catch(() => undefined);

  if (await importSharedLink()) return;

  let current = store.current ?? store.docs[0];
  if (!current) {
    current = store.create({ title: "Welcome", engine: "plantuml", code: WELCOME_CODE });
  }
  openDoc(current);
}

window.addEventListener("hashchange", () => {
  if (hasSharedDiagram()) {
    flushSave();
    closePopover();
    importSharedLink();
  }
});

start();
