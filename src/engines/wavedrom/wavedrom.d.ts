// The parts of WaveDrom we use; it ships without type declarations.

type Onml = [string, Record<string, unknown>, ...unknown[]];

declare module "wavedrom/lib/render-any.js" {
  export default function renderAny(index: number, source: unknown, skins: Record<string, unknown>): Onml;
}

declare module "onml/stringify.js" {
  export default function stringify(tree: Onml): string;
}

declare module "wavedrom/skins/*" {
  const skin: Record<string, unknown>;
  export default skin;
}
