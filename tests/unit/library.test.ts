import { describe, expect, it } from "vitest";
import { initials } from "../../src/ui/library";

describe("initials", () => {
  it("takes the first letters of the first two words", () => {
    expect(initials("Library system")).toBe("LS");
    expect(initials("binary search tree")).toBe("BS");
  });

  it("takes two letters of a single word", () => {
    expect(initials("Welcome")).toBe("WE");
    expect(initials("x")).toBe("X");
  });

  it("ignores punctuation and copes with empty titles", () => {
    expect(initials("  (draft) — ER schema")).toBe("DE");
    expect(initials("Café 2")).toBe("C2");
    expect(initials("—")).toBe("?");
  });
});
