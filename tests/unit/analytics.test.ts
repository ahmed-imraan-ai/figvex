import { beforeEach, describe, expect, it, vi } from "vitest";

// Both modules keep state (the loaded tag, the settings), so each test
// imports fresh copies.
async function fresh() {
  vi.resetModules();
  const { applyAnalytics } = await import("../../src/analytics");
  const { store } = await import("../../src/store");
  const { showConsentBanner } = await import("../../src/ui/consent-banner");
  return { applyAnalytics, store, showConsentBanner };
}

const ID = "G-TEST123";
type W = Window & Record<string, unknown> & { dataLayer?: IArguments[] };
const w = () => window as unknown as W;
const tags = () => document.head.querySelectorAll('script[src*="googletagmanager"]');

beforeEach(() => {
  // happy-dom refuses to fetch the tag script and logs it; that is expected.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  localStorage.clear();
  document.head.querySelectorAll("script").forEach((s) => s.remove());
  document.body.replaceChildren();
  delete w().dataLayer;
  delete w()[`ga-disable-${ID}`];
});

describe("Google Analytics", () => {
  it("does nothing until the visitor allows it", async () => {
    const { applyAnalytics } = await fresh();
    applyAnalytics(ID, "ask");
    applyAnalytics(ID, "off");
    expect(tags()).toHaveLength(0);
    expect(w().dataLayer).toBeUndefined();
    expect(w()[`ga-disable-${ID}`]).toBe(true);
  });

  it("loads the tag once when allowed, without the share payload", async () => {
    history.replaceState(null, "", "/?x=1#secret-diagram");
    const { applyAnalytics } = await fresh();
    applyAnalytics(ID, "on");
    applyAnalytics(ID, "on");
    expect(tags()).toHaveLength(1);
    expect(w()[`ga-disable-${ID}`]).toBe(false);
    const config = w().dataLayer!.map((a) => Array.from(a)).find((a) => a[0] === "config")!;
    expect(config[1]).toBe(ID);
    expect((config[2] as { page_location: string }).page_location).toBe(`${location.origin}/?x=1`);
    history.replaceState(null, "", "/");
  });

  it("stops sending and removes its cookies when turned off", async () => {
    const { applyAnalytics } = await fresh();
    applyAnalytics(ID, "on");
    document.cookie = "_ga=GA1.1.123; path=/";
    document.cookie = "_ga_TEST123=GS1.1.456; path=/";
    document.cookie = "other=keep; path=/";
    applyAnalytics(ID, "off");
    expect(w()[`ga-disable-${ID}`]).toBe(true);
    expect(document.cookie).not.toMatch(/_ga/);
    expect(document.cookie).toMatch(/other=keep/);
  });

  it("ignores builds without an ID", async () => {
    const { applyAnalytics } = await fresh();
    applyAnalytics("", "on");
    expect(tags()).toHaveLength(0);
  });
});

describe("consent banner", () => {
  it("saves the answer and goes away", async () => {
    const { store, showConsentBanner } = await fresh();
    expect(store.settings.analytics).toBe("ask");
    showConsentBanner();
    const buttons = [...document.querySelectorAll<HTMLButtonElement>(".consent button")];
    expect(buttons.map((b) => b.textContent)).toEqual(["Don't allow", "Allow"]);
    buttons[1].click();
    expect(store.settings.analytics).toBe("on");
    expect(document.querySelector(".consent")).toBeNull();
    expect((await fresh()).store.settings.analytics).toBe("on");
  });

  it("goes away when answered in Settings", async () => {
    const { store, showConsentBanner } = await fresh();
    showConsentBanner();
    store.setSettings({ analytics: "off" });
    expect(document.querySelector(".consent")).toBeNull();
  });
});
