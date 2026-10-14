// WaveDrom (MIT) and its skins, loaded only when a timing diagram is drawn.
// Only the renderer is imported: WaveDrom's main entry also brings in a
// helper that reads diagrams from the page with eval, which we don't need.
// vite.config.ts maps wavedrom/lib/* past the package's export list.

import JSON5 from "json5";
import stringify from "onml/stringify.js";
import renderAny from "wavedrom/lib/render-any.js";
import dark from "wavedrom/skins/dark.js";
import def from "wavedrom/skins/default.js";
import lowkey from "wavedrom/skins/lowkey.js";
import narrow from "wavedrom/skins/narrow.js";

export const skins = { ...def, ...dark, ...lowkey, ...narrow } as Record<string, unknown>;

export const wavedrom = { renderAny, onml: { stringify } };

export { JSON5 };
