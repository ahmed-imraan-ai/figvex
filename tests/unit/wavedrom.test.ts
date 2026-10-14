import { describe, expect, it } from "vitest";
import { detectEngine } from "../../src/engines/detect";
import type { RenderOptions } from "../../src/engines/types";
import { isWaveJson, renderWaveDrom } from "../../src/engines/wavedrom";
import { wavedromTemplates } from "../../src/templates/wavedrom";

const opts = (dark = false, waveStyle: RenderOptions["waveStyle"] = "default") => ({ dark, waveStyle }) as RenderOptions;

describe("WaveDrom", () => {
  it("tells WaveJSON from a chart option", () => {
    expect(isWaveJson("{ signal: [{ name: 'clk', wave: 'p...' }] }")).toBe(true);
    expect(isWaveJson('// comment\n{\n  "reg": [{ "bits": 8 }]\n}')).toBe(true);
    expect(isWaveJson('{ "series": [{ "type": "bar" }], "signal": 1 }')).toBe(false);
    expect(detectEngine("{ assign: [['a', 'b']] }")).toBe("wavedrom");
    expect(detectEngine('{ "xAxis": {}, "series": [] }')).toBe("echarts");
  });

  it("draws every template, light and dark", async () => {
    for (const t of wavedromTemplates) {
      for (const dark of [false, true]) {
        const r = await renderWaveDrom(t.code, opts(dark));
        expect(r.ok, `${t.id} ${r.ok ? "" : r.message}`).toBe(true);
        if (r.ok) expect(r.svg.startsWith("<svg")).toBe(true);
      }
    }
  });

  it("uses the chosen skin, and the dark skin on dark diagrams", async () => {
    const code = "{ signal: [{ name: 'clk', wave: 'p..' }] }";
    const narrow = await renderWaveDrom(code, opts(false, "narrow"));
    const plain = await renderWaveDrom(code, opts(false, "default"));
    const dark = await renderWaveDrom(code, opts(true, "narrow"));
    expect(narrow.ok && plain.ok && dark.ok).toBe(true);
    if (narrow.ok && plain.ok && dark.ok) {
      expect(narrow.svg).not.toEqual(plain.svg);
      expect(dark.svg).not.toEqual(narrow.svg);
    }
  });

  it("points at JSON mistakes and explains a missing signal list", async () => {
    const bad = await renderWaveDrom("{ signal: [\n  { name: 'a' wave: '01' }\n] }", opts());
    expect(bad).toMatchObject({ ok: false, line: 2 });
    if (!bad.ok) expect(bad.message).toMatch(/isn't valid WaveJSON/);
    const empty = await renderWaveDrom("{ foo: 1 }", opts());
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.message).toMatch(/signal list/);
  });
});
