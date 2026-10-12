// Compression helpers built on the browser's CompressionStream, so share links
// need no extra library.

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export const deflateRaw = (data: Uint8Array) => pipe(data, new CompressionStream("deflate-raw"));
export const inflateRaw = (data: Uint8Array) => pipe(data, new DecompressionStream("deflate-raw"));

export function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// PlantUML's own text encoding (deflate + a custom base64 alphabet), used by
// plantuml.com URLs: https://plantuml.com/text-encoding
const PUML_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

export async function plantumlEncode(source: string): Promise<string> {
  const data = await deflateRaw(new TextEncoder().encode(source));
  let out = "";
  for (let i = 0; i < data.length; i += 3) {
    const b1 = data[i];
    const b2 = data[i + 1] ?? 0;
    const b3 = data[i + 2] ?? 0;
    out += PUML_ALPHABET[b1 >> 2];
    out += PUML_ALPHABET[((b1 & 0x3) << 4) | (b2 >> 4)];
    out += PUML_ALPHABET[((b2 & 0xf) << 2) | (b3 >> 6)];
    out += PUML_ALPHABET[b3 & 0x3f];
  }
  return out;
}
