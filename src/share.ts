// Share links carry the whole diagram in the URL fragment, compressed. The
// fragment never reaches the server, so links work on any static host.

import type { Engine } from "./engines/types";
import { deflateRaw, fromBase64Url, inflateRaw, toBase64Url } from "./lib/encode";

const PREFIX = "#u1:";

export interface SharedDiagram {
  engine: Engine;
  title: string;
  code: string;
}

export async function shareUrl(diagram: SharedDiagram): Promise<string> {
  const json = JSON.stringify({ e: diagram.engine, t: diagram.title, c: diagram.code });
  const packed = toBase64Url(await deflateRaw(new TextEncoder().encode(json)));
  const url = new URL(location.href);
  url.search = "";
  url.hash = PREFIX.slice(1) + packed;
  return url.href;
}

export function hasSharedDiagram(hash = location.hash): boolean {
  return hash.startsWith(PREFIX);
}

export async function readSharedDiagram(hash = location.hash): Promise<SharedDiagram | null> {
  if (!hasSharedDiagram(hash)) return null;
  try {
    const bytes = await inflateRaw(fromBase64Url(hash.slice(PREFIX.length)));
    const data = JSON.parse(new TextDecoder().decode(bytes)) as { e?: string; t?: string; c?: string };
    if (typeof data.c !== "string") return null;
    return {
      engine: data.e === "mermaid" ? "mermaid" : "plantuml",
      title: typeof data.t === "string" && data.t.trim() ? data.t.slice(0, 120) : "Shared diagram",
      code: data.c,
    };
  } catch {
    return null;
  }
}

export function markdownBlock(engine: Engine, code: string): string {
  return "```" + engine + "\n" + code.replace(/\s+$/, "") + "\n```\n";
}
