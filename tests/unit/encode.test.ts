import { describe, expect, it } from "vitest";
import { deflateRaw, fromBase64Url, inflateRaw, plantumlEncode, toBase64Url } from "../../src/lib/encode";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

/** Reverse of plantumlEncode, used only to check the round trip. */
async function plantumlDecode(text: string): Promise<string> {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 4) {
    const [c1, c2, c3, c4] = [...text.slice(i, i + 4)].map((c) => ALPHABET.indexOf(c));
    bytes.push((c1 << 2) | (c2 >> 4), ((c2 & 0xf) << 4) | (c3 >> 2), ((c3 & 0x3) << 6) | c4);
  }
  // Trailing padding bytes are harmless to the inflater.
  return new TextDecoder().decode(await inflateRaw(new Uint8Array(bytes)));
}

describe("base64url", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = Uint8Array.from({ length: 300 }, (_, i) => (i * 37) % 256);
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
  });

  it("uses only URL-safe characters and no padding", () => {
    const encoded = toBase64Url(Uint8Array.from([251, 255, 191, 0, 1]));
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("deflate", () => {
  it("round-trips text, including non-ASCII", async () => {
    const text = "Student → Portal : “upload” ✓ ".repeat(50);
    const packed = await deflateRaw(new TextEncoder().encode(text));
    expect(packed.length).toBeLessThan(text.length);
    expect(new TextDecoder().decode(await inflateRaw(packed))).toBe(text);
  });
});

describe("plantumlEncode", () => {
  it("produces PlantUML's URL alphabet and decodes back to the source", async () => {
    const source = "@startuml\nBob -> Alice : hello\n@enduml";
    const encoded = await plantumlEncode(source);
    expect(encoded).toMatch(/^[0-9A-Za-z_-]+$/);
    expect(encoded.length % 4).toBe(0);
    expect(await plantumlDecode(encoded)).toBe(source);
  });
});
