import { afterEach, describe, expect, it, vi } from "vitest";
import { debounce, h, relativeTime, slugify } from "../../src/lib/dom";

afterEach(() => vi.useRealTimers());

describe("slugify", () => {
  it("makes safe file names", () => {
    expect(slugify("Library management system")).toBe("library-management-system");
    expect(slugify("  Café — v2.0 (final)!  ")).toBe("cafe-v2-0-final");
    expect(slugify("???")).toBe("diagram");
  });
});

describe("relativeTime", () => {
  it("describes recent times in words", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-10T12:00:00Z"));
    const now = Date.now();
    expect(relativeTime(now - 10_000)).toBe("just now");
    expect(relativeTime(now - 5 * 60_000)).toBe("5 min ago");
    expect(relativeTime(now - 3 * 3_600_000)).toBe("3 h ago");
    expect(relativeTime(now - 26 * 3_600_000)).toBe("yesterday");
    expect(relativeTime(now - 4 * 86_400_000)).toBe("4 days ago");
  });
});

describe("debounce", () => {
  it("runs once with the last arguments", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d(1);
    d(2);
    d(3);
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledExactlyOnceWith(3);
  });

  it("can be cancelled", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d();
    d.cancel();
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("h", () => {
  it("sets attributes, listeners and children", () => {
    const onClick = vi.fn();
    const el = h("button", { class: "btn", type: "button", disabled: false, onclick: onClick }, "Go", null, h("span", {}, "!"));
    expect(el.className).toBe("btn");
    expect(el.hasAttribute("disabled")).toBe(false);
    expect(el.textContent).toBe("Go!");
    el.click();
    expect(onClick).toHaveBeenCalledOnce();
  });
});
