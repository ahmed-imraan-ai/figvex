import { beforeEach, describe, expect, it, vi } from "vitest";

// The store is a module-level singleton that reads localStorage on import,
// so each test imports a fresh copy.
async function freshStore() {
  vi.resetModules();
  return (await import("../../src/store")).store;
}

beforeEach(() => localStorage.clear());

describe("store", () => {
  it("starts empty with default settings", async () => {
    const store = await freshStore();
    expect(store.docs).toEqual([]);
    expect(store.current).toBeUndefined();
    expect(store.settings.diagramTheme).toBe("light");
  });

  it("creates, selects and persists diagrams", async () => {
    const store = await freshStore();
    const doc = store.create({ title: "A", engine: "plantuml", code: "@startuml\n@enduml" });
    expect(store.current?.id).toBe(doc.id);

    const reloaded = await freshStore();
    expect(reloaded.docs).toHaveLength(1);
    expect(reloaded.current?.title).toBe("A");
  });

  it("updates fields and bumps the timestamp", async () => {
    const store = await freshStore();
    const doc = store.create({ title: "A", engine: "plantuml", code: "" });
    const before = doc.updated;
    await new Promise((r) => setTimeout(r, 5));
    store.update(doc.id, { code: "flowchart TD", engine: "mermaid" });
    expect(store.current).toMatchObject({ code: "flowchart TD", engine: "mermaid" });
    expect(store.current!.updated).toBeGreaterThan(before);
  });

  it("removes and restores a diagram in its old position", async () => {
    const store = await freshStore();
    const a = store.create({ title: "A", engine: "plantuml", code: "" });
    const b = store.create({ title: "B", engine: "plantuml", code: "" });
    const removed = store.remove(a.id)!;
    expect(store.docs.map((d) => d.title)).toEqual(["B"]);
    expect(store.currentId).toBe(b.id);
    store.restore(removed.doc, removed.index);
    expect(store.docs.map((d) => d.title)).toEqual(["B", "A"]);
    expect(store.currentId).toBe(a.id);
  });

  it("numbers duplicate titles", async () => {
    const store = await freshStore();
    store.create({ title: "Class diagram", engine: "plantuml", code: "" });
    expect(store.uniqueTitle("Class diagram")).toBe("Class diagram 2");
    store.create({ title: "Class diagram 2", engine: "plantuml", code: "" });
    expect(store.uniqueTitle("Class diagram")).toBe("Class diagram 3");
    expect(store.uniqueTitle("Sequence")).toBe("Sequence");
  });

  it("merges saved settings over the defaults and notifies listeners", async () => {
    localStorage.setItem("figvex.settings.v1", JSON.stringify({ fontSize: 18 }));
    const store = await freshStore();
    expect(store.settings.fontSize).toBe(18);
    expect(store.settings.wrap).toBe(false);

    const listener = vi.fn();
    store.subscribe(listener);
    store.setSettings({ wrap: true });
    expect(listener).toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("figvex.settings.v1")!).wrap).toBe(true);
  });

  it("survives corrupt storage", async () => {
    localStorage.setItem("figvex.docs.v1", "{not json");
    const store = await freshStore();
    expect(store.docs).toEqual([]);
  });
});
