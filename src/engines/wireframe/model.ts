// Wireframes: screens of common controls, one per line, nested by
// indentation, with arrows between screens for a user flow.
//
//   wireframe
//   title "Sign in"
//   screen login "Sign in" phone
//     header "Shop"
//     field "Email" "you@example.com"
//     password "Password"
//     row
//       checkbox "Remember me" on
//       link "Forgot password?"
//     button "Sign in" primary
//   login -> home "Signed in"

export type ScreenKind = "phone" | "tablet" | "desktop" | "browser" | "window";

export const SCREEN_KINDS: ScreenKind[] = ["phone", "tablet", "desktop", "browser", "window"];

export const CONTROLS = [
  "header", "nav", "tabs", "heading", "text", "field", "password", "textarea", "search", "dropdown", "checkbox", "radio",
  "toggle", "slider", "progress", "button", "link", "image", "avatar", "list", "table", "row", "divider", "space", "alert",
  "card", "box", "columns",
] as const;

export type ControlKind = (typeof CONTROLS)[number];

export interface Control {
  kind: ControlKind;
  /** Quoted texts in order. */
  texts: string[];
  /** Bare words after the texts: primary, on, back, success... */
  flags: Set<string>;
  /** A number: slider and progress percentages, image height, space size. */
  value?: number;
  line: number;
  children: Control[];
  /** Selected item in nav and tabs, marked with *. */
  selected?: number;
}

export interface Screen {
  id: string;
  title: string;
  kind: ScreenKind;
  width?: number;
  height?: number;
  line: number;
  controls: Control[];
}

export interface Flow {
  from: string;
  to: string;
  label?: string;
  line: number;
}

export interface WireframeDoc {
  title?: string;
  screens: Screen[];
  flows: Flow[];
  warnings: { message: string; line: number }[];
}

export class WireframeError extends Error {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(message);
  }
}

/** Splits a line into "quoted texts", *"selected texts" and bare words. */
export function words(text: string): { texts: string[]; selected: number; bare: string[] } {
  const texts: string[] = [];
  const bare: string[] = [];
  let selected = -1;
  const re = /(\*?)"((?:[^"\\]|\\.)*)"|(\S+)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[2] !== undefined) {
      if (m[1]) selected = texts.length;
      texts.push(m[2].replace(/\\"/g, '"'));
    } else bare.push(m[3]);
  }
  return { texts, selected, bare };
}

const SIZES: Record<ScreenKind, [number, number]> = {
  phone: [360, 640],
  tablet: [600, 800],
  desktop: [880, 560],
  browser: [880, 560],
  window: [640, 440],
};

export const screenSize = (s: Screen) => [s.width ?? SIZES[s.kind][0], s.height ?? SIZES[s.kind][1]] as const;

/** Controls that hold other controls, indented under them. */
export const CONTAINERS = new Set<ControlKind>(["row", "columns", "card", "box", "list", "table"]);

export function parseWireframe(src: string): WireframeDoc {
  const doc: WireframeDoc = { screens: [], flows: [], warnings: [] };
  let header = false;
  // The open containers, by indentation.
  let stack: { indent: number; children: Control[] }[] = [];
  let screen: Screen | undefined;
  src.split(/\r?\n/).forEach((raw, k) => {
    const line = k + 1;
    const noComment = raw.replace(/(^|\s)#.*$/, "");
    const text = noComment.trim();
    if (!text) return;
    if (!header) {
      if (text !== "wireframe") throw new WireframeError('A wireframe starts with the word "wireframe" on the first line.', line);
      header = true;
      return;
    }
    const indent = noComment.length - noComment.trimStart().length;
    const title = text.match(/^title\s+(.*)$/);
    if (title && indent === 0) {
      doc.title = words(title[1]).texts[0] ?? title[1].trim();
      return;
    }
    const flow = text.match(/^([\w-]+)\s*->\s*([\w-]+)(.*)$/);
    if (flow && indent === 0) {
      doc.flows.push({ from: flow[1], to: flow[2], label: words(flow[3]).texts[0], line });
      return;
    }
    const sc = text.match(/^screen\s+([\w-]+)(.*)$/);
    if (sc && indent === 0) {
      const w = words(sc[2]);
      let kind: ScreenKind = "phone";
      let width: number | undefined;
      let height: number | undefined;
      for (const b of w.bare) {
        if (SCREEN_KINDS.includes(b as ScreenKind)) kind = b as ScreenKind;
        else if (/^\d+x\d+$/.test(b)) [width, height] = b.split("x").map(Number);
        else throw new WireframeError(`"${b}" isn't a screen size. Use ${SCREEN_KINDS.join(", ")} or a size like 400x600.`, line);
      }
      if (doc.screens.some((s) => s.id === sc[1])) throw new WireframeError(`There's already a screen called ${sc[1]}.`, line);
      screen = { id: sc[1], title: w.texts[0] ?? sc[1], kind, width, height, line, controls: [] };
      doc.screens.push(screen);
      stack = [{ indent: -1, children: screen.controls }];
      return;
    }
    if (!screen) throw new WireframeError("Start a screen first: screen login \"Sign in\" phone", line);
    if (indent === 0) throw new WireframeError("Indent the controls under their screen.", line);
    const [first, ...rest] = text.split(/\s+/);
    if (!(CONTROLS as readonly string[]).includes(first)) throw new WireframeError(`"${first}" isn't a control. Try ${CONTROLS.slice(0, 12).join(", ")} and more.`, line);
    const w = words(rest.join(" "));
    const numbers = w.bare.filter((b) => /^\d+%?$/.test(b));
    const control: Control = {
      kind: first as ControlKind,
      texts: w.texts,
      flags: new Set(w.bare.filter((b) => !/^\d+%?$/.test(b))),
      value: numbers.length ? parseFloat(numbers[0]) : undefined,
      line,
      children: [],
      selected: w.selected >= 0 ? w.selected : undefined,
    };
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    stack[stack.length - 1].children.push(control);
    if (CONTAINERS.has(control.kind)) stack.push({ indent, children: control.children });
  });
  if (!header) throw new WireframeError('A wireframe starts with the word "wireframe" on the first line.');
  if (!doc.screens.length) throw new WireframeError('Add a screen: screen login "Sign in" phone', 2);
  for (const f of doc.flows)
    for (const id of [f.from, f.to])
      if (!doc.screens.some((s) => s.id === id)) throw new WireframeError(`There's no screen called ${id}.`, f.line);
  return doc;
}
