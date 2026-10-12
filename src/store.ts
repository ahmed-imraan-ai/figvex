// Diagrams and settings live in localStorage. Every access is guarded: private
// windows and blocked storage must still give a working (if forgetful) app.

import { isEngine, type ChartStyle, type Engine, type GraphvizStyle, type MermaidTheme, type RenderOptions } from "./engines/types";

export interface Doc {
  id: string;
  title: string;
  engine: Engine;
  code: string;
  created: number;
  updated: number;
}

export interface Settings {
  theme: "system" | "light" | "dark";
  diagramTheme: "light" | "dark" | "match";
  plantumlTheme: string;
  mermaidTheme: MermaidTheme;
  mermaidLook: "classic" | "handDrawn";
  graphvizStyle: GraphvizStyle;
  chartStyle: ChartStyle;
  fontSize: number;
  wrap: boolean;
  liveRender: boolean;
  serverFallback: boolean;
  splitRatio: number;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  diagramTheme: "light",
  plantumlTheme: "plain",
  mermaidTheme: "default",
  mermaidLook: "classic",
  graphvizStyle: "plain",
  chartStyle: "default",
  fontSize: 14,
  wrap: false,
  liveRender: true,
  serverFallback: false,
  splitRatio: 0.42,
};

const KEY_DOCS = "figvex.docs.v1";
const KEY_CURRENT = "figvex.current";
const KEY_SETTINGS = "figvex.settings.v1";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

let storageWarned = false;
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    if (!storageWarned) {
      storageWarned = true;
      console.warn("Figvex: could not save to localStorage; changes will be lost on reload.", err);
    }
  }
}

export function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

type Listener = () => void;

class Store {
  docs: Doc[];
  currentId: string;
  settings: Settings;
  private listeners = new Set<Listener>();

  constructor() {
    this.docs = read<Doc[]>(KEY_DOCS, [])
      .filter((d) => d && typeof d.code === "string")
      .map((d) => (isEngine(d.engine) ? d : { ...d, engine: "plantuml" }));
    this.settings = { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(KEY_SETTINGS, {}) };
    this.currentId = read<string>(KEY_CURRENT, "");
  }

  get current(): Doc | undefined {
    return this.docs.find((d) => d.id === this.currentId);
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  private persistDocs() {
    write(KEY_DOCS, this.docs);
  }

  create(init: Pick<Doc, "title" | "engine" | "code">): Doc {
    const now = Date.now();
    const doc: Doc = { id: newId(), created: now, updated: now, ...init };
    this.docs.unshift(doc);
    this.persistDocs();
    this.select(doc.id);
    return doc;
  }

  select(id: string) {
    this.currentId = id;
    write(KEY_CURRENT, id);
    this.emit();
  }

  update(id: string, patch: Partial<Pick<Doc, "title" | "engine" | "code">>) {
    const doc = this.docs.find((d) => d.id === id);
    if (!doc) return;
    Object.assign(doc, patch, { updated: Date.now() });
    this.persistDocs();
    this.emit();
  }

  remove(id: string): { doc: Doc; index: number } | undefined {
    const index = this.docs.findIndex((d) => d.id === id);
    if (index < 0) return;
    const [doc] = this.docs.splice(index, 1);
    this.persistDocs();
    if (this.currentId === id) {
      this.currentId = this.docs[0]?.id ?? "";
      write(KEY_CURRENT, this.currentId);
    }
    this.emit();
    return { doc, index };
  }

  restore(doc: Doc, index: number) {
    this.docs.splice(Math.min(index, this.docs.length), 0, doc);
    this.persistDocs();
    this.select(doc.id);
  }

  setSettings(patch: Partial<Settings>) {
    Object.assign(this.settings, patch);
    write(KEY_SETTINGS, this.settings);
    this.emit();
  }

  /** Titles must be unique enough to tell rows apart: "Class diagram 2". */
  uniqueTitle(base: string): string {
    const taken = new Set(this.docs.map((d) => d.title));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
  }
}

export const store = new Store();

/** Engine options for the current settings. */
export function renderOptions(dark: boolean): RenderOptions {
  const s = store.settings;
  return {
    dark,
    plantumlTheme: s.plantumlTheme,
    serverFallback: s.serverFallback,
    mermaidTheme: s.mermaidTheme,
    look: s.mermaidLook,
    graphvizStyle: s.graphvizStyle,
    chartStyle: s.chartStyle,
  };
}
