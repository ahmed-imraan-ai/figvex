// Draws wireframes: each screen in a device frame, its controls stacked
// top to bottom (side by side in a row), and arrows between screens.
// "Sketchy" draws every line by hand, like a paper prototype.

import { hash, rng, roughEllipse, roughLine, roughPolygon } from "../sketch/render";
import { screenSize, type Control, type Screen, type WireframeDoc } from "./model";

export type WireStyle = "clean" | "sketchy";

interface Ctx {
  out: string[];
  sketchy: boolean;
  rand: () => number;
  c: { ink: string; muted: string; line: string; fill: string; paper: string; accent: string; accentInk: string; frame: string };
  font: string;
}

const n = (v: number) => Math.round(v * 10) / 10;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const CLEAN_FONT = "Helvetica, Arial, sans-serif";
const HAND_FONT = '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
const PAD = 16;
const GAP = 12;
const charW = (size: number, sketchy: boolean) => size * (sketchy ? 0.6 : 0.55);

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, o: { rx?: number; fill?: string; stroke?: string; width?: number; dash?: boolean } = {}) {
  const stroke = o.stroke ?? ctx.c.line;
  const fill = o.fill ?? "none";
  if (ctx.sketchy) {
    if (fill !== "none") ctx.out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${o.rx ?? 2}" fill="${fill}" stroke="none"/>`);
    const d = roughPolygon([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], ctx.rand);
    ctx.out.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${o.width ?? 1.3}"${o.dash ? ' stroke-dasharray="5 4"' : ""} stroke-linecap="round"/>`);
  } else {
    ctx.out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${o.rx ?? 4}" fill="${fill}" stroke="${stroke}" stroke-width="${o.width ?? 1.2}"${o.dash ? ' stroke-dasharray="5 4"' : ""}/>`);
  }
}

function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, o: { stroke?: string; width?: number } = {}) {
  const d = ctx.sketchy ? roughLine({ x: x1, y: y1 }, { x: x2, y: y2 }, ctx.rand) : `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`;
  ctx.out.push(`<path d="${d}" fill="none" stroke="${o.stroke ?? ctx.c.line}" stroke-width="${o.width ?? 1.2}" stroke-linecap="round"/>`);
}

function circle(ctx: Ctx, cx: number, cy: number, r: number, o: { fill?: string; stroke?: string } = {}) {
  if (ctx.sketchy) {
    if (o.fill) ctx.out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${o.fill}"/>`);
    ctx.out.push(`<path d="${roughEllipse(cx, cy, r, r, ctx.rand)}" fill="none" stroke="${o.stroke ?? ctx.c.line}" stroke-width="1.2"/>`);
  } else ctx.out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${o.fill ?? "none"}" stroke="${o.stroke ?? ctx.c.line}" stroke-width="1.2"/>`);
}

function text(ctx: Ctx, x: number, y: number, s: string, o: { size?: number; weight?: number; fill?: string; anchor?: "start" | "middle" | "end"; halo?: string } = {}) {
  const halo = o.halo ? ` stroke="${o.halo}" stroke-width="5" paint-order="stroke"` : "";
  ctx.out.push(
    `<text x="${n(x)}" y="${n(y)}" font-family='${ctx.font}' font-size="${o.size ?? 13}"${o.weight ? ` font-weight="${o.weight}"` : ""} fill="${o.fill ?? ctx.c.ink}"${o.anchor && o.anchor !== "start" ? ` text-anchor="${o.anchor}"` : ""}${halo}>${esc(s)}</text>`,
  );
}

/** Splits text into lines that fit the width. */
function wrap(s: string, width: number, size: number, sketchy: boolean): string[] {
  const max = Math.max(4, Math.floor(width / charW(size, sketchy)));
  const out: string[] = [];
  let cur = "";
  for (const word of s.split(/\s+/)) {
    if (cur && (cur + " " + word).length > max) {
      out.push(cur);
      cur = word;
    } else cur = cur ? `${cur} ${word}` : word;
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}

/** Height a control needs at a given width. */
function heightOf(c: Control, w: number, sketchy: boolean): number {
  const t = c.texts;
  switch (c.kind) {
    case "header":
      return 48;
    case "nav":
    case "tabs":
      return 40;
    case "heading":
      return wrap(t[0] ?? "", w, 20, sketchy).length * 26;
    case "text":
      return wrap(t[0] ?? "", w, 13, sketchy).length * 18;
    case "field":
    case "password":
    case "dropdown":
      return t[0] ? 58 : 36;
    case "search":
      return 36;
    case "textarea":
      return (t[0] ? 22 : 0) + (c.value ?? 84);
    case "checkbox":
    case "radio":
    case "toggle":
    case "link":
      return 24;
    case "slider":
    case "progress":
      return t[0] ? 40 : 22;
    case "button":
      return 38;
    case "image":
      return c.value ?? 140;
    case "avatar":
      return 44;
    case "list":
      return Math.max(1, t.length + c.children.length) * 44;
    case "table":
      return 34 * (1 + c.children.length);
    case "divider":
      return 9;
    case "space":
      return c.value ?? 16;
    case "alert":
      return 18 * wrap(t[0] ?? "", w - 40, 13, sketchy).length + 22;
    case "row":
    case "columns":
      return c.children.length ? Math.max(...rowWidths(c, w).map((cw, i) => heightOf(c.children[i], cw, sketchy))) : 0;
    case "card":
    case "box": {
      const inner = stackHeight(c.children, w - PAD * 2, sketchy);
      return inner + PAD * 2 + (t[0] ? 26 : 0);
    }
  }
}

function rowWidths(c: Control, w: number): number[] {
  const k = c.children.length;
  const gap = 10;
  return c.children.map(() => (w - gap * (k - 1)) / k);
}

function stackHeight(controls: Control[], w: number, sketchy: boolean): number {
  return controls.reduce((sum, c, i) => sum + heightOf(c, w, sketchy) + (i ? GAP : 0), 0);
}

function drawControl(ctx: Ctx, c: Control, x: number, y: number, w: number): void {
  const h = heightOf(c, w, ctx.sketchy);
  const { c: col } = ctx;
  const t = c.texts;
  ctx.out.push(`<g data-source-line="${c.line - 1}">`);
  switch (c.kind) {
    case "header": {
      rect(ctx, x - PAD, y - PAD, w + PAD * 2, h + PAD - 4, { fill: col.fill, stroke: col.fill, rx: 0 });
      line(ctx, x - PAD, y + h - 4, x + w + PAD, y + h - 4);
      let tx = x;
      if (c.flags.has("back")) {
        text(ctx, x, y + 20, "‹", { size: 22 });
        tx += 22;
      }
      if (c.flags.has("menu")) {
        for (let i = 0; i < 3; i++) line(ctx, x, y + 8 + i * 6, x + 16, y + 8 + i * 6);
        tx += 28;
      }
      text(ctx, tx, y + 20, t[0] ?? "", { size: 16, weight: 600 });
      break;
    }
    case "nav":
    case "tabs": {
      const k = Math.max(1, t.length);
      const iw = w / k;
      t.forEach((s, i) => {
        const on = i === (c.selected ?? 0);
        text(ctx, x + iw * i + iw / 2, y + 24, s, { anchor: "middle", weight: on ? 700 : undefined, fill: on ? col.ink : col.muted });
        if (on) line(ctx, x + iw * i + 8, y + 36, x + iw * (i + 1) - 8, y + 36, { stroke: col.ink, width: 2.5 });
      });
      line(ctx, x, y + 38, x + w, y + 38, { stroke: col.muted, width: 0.8 });
      break;
    }
    case "heading":
      wrap(t[0] ?? "", w, 20, ctx.sketchy).forEach((l, i) => text(ctx, x, y + 20 + i * 26, l, { size: 20, weight: 700 }));
      break;
    case "text":
      wrap(t[0] ?? "", w, 13, ctx.sketchy).forEach((l, i) => text(ctx, x, y + 13 + i * 18, l, { fill: col.muted }));
      break;
    case "field":
    case "password":
    case "dropdown":
    case "search": {
      let top = y;
      if (t[0] && c.kind !== "search") {
        text(ctx, x, y + 13, t[0], { size: 12, weight: 600 });
        top += 22;
      }
      rect(ctx, x, top, w, 36, { fill: col.paper });
      const value = c.kind === "search" ? (t[0] ?? "Search") : c.kind === "password" ? "••••••••" : (t[1] ?? "");
      if (c.kind === "search") {
        circle(ctx, x + 16, top + 16, 5);
        line(ctx, x + 20, top + 20, x + 24, top + 24);
      }
      text(ctx, x + (c.kind === "search" ? 32 : 10), top + 23, value, { fill: c.kind === "password" || c.flags.has("filled") ? col.ink : col.muted });
      if (c.kind === "dropdown") ctx.out.push(`<path d="M${n(x + w - 22)} ${n(top + 15)}l6 6l6 -6" fill="none" stroke="${col.ink}" stroke-width="1.5"/>`);
      break;
    }
    case "textarea": {
      let top = y;
      if (t[0]) {
        text(ctx, x, y + 13, t[0], { size: 12, weight: 600 });
        top += 22;
      }
      rect(ctx, x, top, w, c.value ?? 84, { fill: col.paper });
      if (t[1]) text(ctx, x + 10, top + 22, t[1], { fill: col.muted });
      break;
    }
    case "checkbox":
    case "radio":
    case "toggle": {
      const on = c.flags.has("on") || c.flags.has("checked");
      if (c.kind === "checkbox") {
        rect(ctx, x, y + 4, 16, 16, { rx: 2, fill: on ? col.accent : col.paper, stroke: on ? col.accent : col.line });
        if (on) ctx.out.push(`<path d="M${x + 4} ${y + 12}l3 3l6 -7" fill="none" stroke="${col.accentInk}" stroke-width="2"/>`);
      } else if (c.kind === "radio") {
        circle(ctx, x + 8, y + 12, 8, { fill: col.paper });
        if (on) ctx.out.push(`<circle cx="${x + 8}" cy="${y + 12}" r="4" fill="${col.accent}"/>`);
      } else {
        rect(ctx, x, y + 3, 34, 18, { rx: 9, fill: on ? col.accent : col.fill, stroke: on ? col.accent : col.line });
        ctx.out.push(`<circle cx="${on ? x + 25 : x + 9}" cy="${y + 12}" r="6" fill="${col.paper}" stroke="${col.line}" stroke-width="0.8"/>`);
      }
      text(ctx, x + (c.kind === "toggle" ? 44 : 26), y + 17, t[0] ?? "");
      break;
    }
    case "slider":
    case "progress": {
      let top = y;
      if (t[0]) {
        text(ctx, x, y + 13, t[0], { size: 12, weight: 600 });
        top += 18;
      }
      const v = Math.max(0, Math.min(100, c.value ?? 50)) / 100;
      if (c.kind === "progress") {
        rect(ctx, x, top + 6, w, 10, { rx: 5, fill: col.fill });
        rect(ctx, x, top + 6, Math.max(10, w * v), 10, { rx: 5, fill: col.accent, stroke: col.accent });
      } else {
        line(ctx, x, top + 11, x + w, top + 11, { stroke: col.muted, width: 3 });
        line(ctx, x, top + 11, x + w * v, top + 11, { stroke: col.accent, width: 3 });
        circle(ctx, x + w * v, top + 11, 8, { fill: col.paper });
      }
      break;
    }
    case "button": {
      const primary = c.flags.has("primary");
      const danger = c.flags.has("danger");
      const label = t[0] ?? "Button";
      const bw = c.flags.has("small") ? Math.min(w, label.length * charW(13, ctx.sketchy) + 32) : w;
      const fill = primary ? col.accent : danger ? "#d64545" : col.paper;
      rect(ctx, x, y, bw, h, { rx: 6, fill, stroke: primary ? col.accent : danger ? "#d64545" : col.line });
      text(ctx, x + bw / 2, y + 24, label, { anchor: "middle", weight: 600, fill: primary || danger ? col.accentInk : col.ink });
      break;
    }
    case "link":
      text(ctx, x, y + 16, t[0] ?? "Link", { fill: col.accent });
      line(ctx, x, y + 19, x + (t[0] ?? "Link").length * charW(13, ctx.sketchy), y + 19, { stroke: col.accent, width: 0.8 });
      break;
    case "image":
      rect(ctx, x, y, w, h, { fill: col.fill });
      line(ctx, x, y, x + w, y + h, { stroke: col.muted, width: 0.8 });
      line(ctx, x + w, y, x, y + h, { stroke: col.muted, width: 0.8 });
      if (t[0]) text(ctx, x + w / 2, y + h / 2 + 4, t[0], { anchor: "middle", fill: col.muted, size: 12, halo: col.fill });
      break;
    case "avatar":
      circle(ctx, x + 20, y + 22, 18, { fill: col.fill });
      circle(ctx, x + 20, y + 17, 6);
      ctx.out.push(`<path d="M${x + 9} ${y + 34}q11 -12 22 0" fill="none" stroke="${col.line}" stroke-width="1.2"/>`);
      if (t[0]) text(ctx, x + 50, y + (t[1] ? 19 : 27), t[0], { weight: 600 });
      if (t[1]) text(ctx, x + 50, y + 36, t[1], { size: 12, fill: col.muted });
      break;
    case "list": {
      const items = [...t.map((s) => ({ s, child: undefined as Control | undefined })), ...c.children.map((ch) => ({ s: "", child: ch }))];
      items.forEach((it, i) => {
        const iy = y + i * 44;
        if (it.child) drawControl(ctx, it.child, x, iy + 4, w);
        else {
          circle(ctx, x + 14, iy + 22, 12, { fill: col.fill });
          text(ctx, x + 36, iy + 26, it.s);
          ctx.out.push(`<path d="M${n(x + w - 12)} ${iy + 17}l5 5l-5 5" fill="none" stroke="${col.muted}" stroke-width="1.5"/>`);
        }
        line(ctx, x, iy + 44, x + w, iy + 44, { stroke: col.muted, width: 0.6 });
      });
      break;
    }
    case "table": {
      const cols = Math.max(1, t.length, ...c.children.map((r) => r.texts.length));
      const cw = w / cols;
      rect(ctx, x, y, w, h, { rx: 2, fill: col.paper });
      rect(ctx, x, y, w, 34, { rx: 2, fill: col.fill });
      t.forEach((s, j) => text(ctx, x + j * cw + 10, y + 22, s, { weight: 700, size: 12 }));
      c.children.forEach((r, i) => {
        const ry = y + 34 * (i + 1);
        line(ctx, x, ry, x + w, ry, { stroke: col.muted, width: 0.6 });
        r.texts.forEach((s, j) => text(ctx, x + j * cw + 10, ry + 22, s, { size: 12 }));
      });
      break;
    }
    case "divider":
      line(ctx, x, y + 4, x + w, y + 4, { stroke: col.muted, width: 0.8 });
      break;
    case "space":
      break;
    case "alert": {
      const kind = ["success", "warning", "error"].find((k) => c.flags.has(k)) ?? "info";
      const colour = { info: "#3b82f6", success: "#16a34a", warning: "#d97706", error: "#dc2626" }[kind];
      rect(ctx, x, y, w, h, { rx: 6, fill: `${colour}1f`, stroke: colour });
      circle(ctx, x + 18, y + h / 2, 7, { stroke: colour });
      wrap(t[0] ?? "", w - 40, 13, ctx.sketchy).forEach((l, i) => text(ctx, x + 34, y + 25 + i * 18, l));
      break;
    }
    case "row":
    case "columns": {
      let cx = x;
      rowWidths(c, w).forEach((cw, i) => {
        drawControl(ctx, c.children[i], cx, y, cw);
        cx += cw + 10;
      });
      break;
    }
    case "card":
    case "box": {
      rect(ctx, x, y, w, h, { rx: 8, fill: col.paper, stroke: col.line, dash: c.kind === "box" && c.flags.has("dashed") });
      let cy = y + PAD;
      if (t[0]) {
        text(ctx, x + PAD, cy + 14, t[0], { weight: 700, size: 15 });
        cy += 26;
      }
      for (const ch of c.children) {
        drawControl(ctx, ch, x + PAD, cy, w - PAD * 2);
        cy += heightOf(ch, w - PAD * 2, ctx.sketchy) + GAP;
      }
      break;
    }
  }
  ctx.out.push("</g>");
}

interface Placed {
  screen: Screen;
  x: number;
  y: number;
  w: number;
  h: number;
}

function drawScreen(ctx: Ctx, p: Placed) {
  const { screen: s, x, y, w, h } = p;
  const col = ctx.c;
  const bezel = s.kind === "phone" ? 14 : s.kind === "tablet" ? 18 : 0;
  const chrome = s.kind === "browser" ? 36 : s.kind === "window" || s.kind === "desktop" ? 28 : 0;
  ctx.out.push(`<g data-source-line="${s.line - 1}" data-qualified-name="${esc(s.id)}">`);
  // Title above the frame.
  text(ctx, x, y - 10, s.title, { size: 14, weight: 700 });
  if (bezel) {
    rect(ctx, x, y, w + bezel * 2, h + bezel * 2 + (s.kind === "phone" ? 20 : 0), { rx: 26, fill: col.frame, stroke: col.line, width: 1.6 });
    if (s.kind === "phone") ctx.out.push(`<rect x="${n(x + bezel + w / 2 - 22)}" y="${n(y + 6)}" width="44" height="4" rx="2" fill="${col.muted}"/>`);
  } else {
    rect(ctx, x, y, w, h + chrome, { rx: 6, fill: col.frame, stroke: col.line, width: 1.6 });
    for (let i = 0; i < 3; i++) circle(ctx, x + 14 + i * 14, y + 14, 4, { fill: col.fill });
    if (s.kind === "browser") rect(ctx, x + 60, y + 7, w - 76, 20, { rx: 10, fill: col.paper });
    line(ctx, x, y + chrome, x + w, y + chrome);
  }
  const sx = x + bezel;
  const sy = y + bezel + chrome;
  rect(ctx, sx, sy, w, h, { rx: bezel ? 6 : 0, fill: col.paper, stroke: bezel ? col.line : "none" });
  ctx.out.push("</g>");
  let cy = sy + PAD;
  for (const c of s.controls) {
    drawControl(ctx, c, sx + PAD, cy, w - PAD * 2);
    cy += heightOf(c, w - PAD * 2, ctx.sketchy) + GAP;
  }
}

/** Screen sizes, grown to fit their content. */
function measure(s: Screen, sketchy: boolean): { w: number; h: number; frameW: number; frameH: number } {
  const [w, minH] = screenSize(s);
  const content = stackHeight(s.controls, w - PAD * 2, sketchy) + PAD * 2;
  const h = Math.max(minH, content);
  const bezel = s.kind === "phone" ? 14 : s.kind === "tablet" ? 18 : 0;
  const chrome = s.kind === "browser" ? 36 : s.kind === "window" || s.kind === "desktop" ? 28 : 0;
  return { w, h, frameW: w + bezel * 2, frameH: h + bezel * 2 + chrome + (s.kind === "phone" ? 20 : 0) };
}

export function drawWireframe(doc: WireframeDoc, opts: { dark: boolean; style: WireStyle }): string {
  const sketchy = opts.style === "sketchy";
  const { dark } = opts;
  const ctx: Ctx = {
    out: [],
    sketchy,
    rand: rng(hash(doc.screens.map((s) => s.id).join())),
    font: sketchy ? HAND_FONT : CLEAN_FONT,
    c: {
      ink: dark ? "#ebe9e4" : "#1d1d1b",
      muted: dark ? "#9a978f" : "#8a877f",
      line: dark ? "#b9b6ae" : "#5a5852",
      fill: dark ? "#34332f" : "#eeede8",
      paper: dark ? "#232321" : "#ffffff",
      accent: dark ? "#7aa7ff" : "#2f6bed",
      accentInk: dark ? "#10131a" : "#ffffff",
      frame: dark ? "#2b2a27" : "#f6f5f1",
    },
  };
  const margin = 28;
  const top = margin + (doc.title ? 40 : 0) + 24;
  const gapX = doc.flows.length ? 120 : 56;
  let x = margin;
  const placed: Placed[] = [];
  let maxH = 0;
  for (const s of doc.screens) {
    const m = measure(s, sketchy);
    placed.push({ screen: s, x, y: top, w: m.w, h: m.h });
    x += m.frameW + gapX;
    maxH = Math.max(maxH, m.frameH);
  }
  const width = x - gapX + margin;
  const frameOf = (p: Placed) => measure(p.screen, sketchy);

  if (doc.title) text(ctx, margin, margin + 18, doc.title, { size: 20, weight: 700 });
  for (const p of placed) drawScreen(ctx, p);

  // Flows: forward ones between the frames, backward ones under them.
  let below = 0;
  for (const f of doc.flows) {
    const a = placed.find((p) => p.screen.id === f.from)!;
    const b = placed.find((p) => p.screen.id === f.to)!;
    const fa = frameOf(a);
    const fb = frameOf(b);
    ctx.out.push(`<g data-source-line="${f.line - 1}">`);
    if (b.x > a.x) {
      const y1 = a.y + fa.frameH / 2;
      const x1 = a.x + fa.frameW + 6;
      const x2 = b.x - 8;
      const y2 = b.y + fb.frameH / 2;
      line(ctx, x1, y1, x2, y2, { stroke: ctx.c.accent, width: 2 });
      ctx.out.push(`<path d="M${n(x2 + 2)} ${n(y2)}l-10 -5v10z" fill="${ctx.c.accent}"/>`);
      if (f.label) text(ctx, (x1 + x2) / 2, (y1 + y2) / 2 - 10, f.label, { anchor: "middle", size: 12, fill: ctx.c.accent, weight: 600 });
    } else {
      below++;
      const y0 = top + maxH + 18 + below * 26;
      const x1 = a.x + fa.frameW / 2 + 20;
      const x2 = b.x + fb.frameW / 2 - 20;
      ctx.out.push(`<path d="M${n(x1)} ${n(a.y + fa.frameH + 4)}V${n(y0)}H${n(x2)}V${n(b.y + fb.frameH + 12)}" fill="none" stroke="${ctx.c.accent}" stroke-width="2"/>`);
      ctx.out.push(`<path d="M${n(x2)} ${n(b.y + fb.frameH + 2)}l-5 10h10z" fill="${ctx.c.accent}"/>`);
      if (f.label) text(ctx, (x1 + x2) / 2, y0 - 6, f.label, { anchor: "middle", size: 12, fill: ctx.c.accent, weight: 600 });
    }
    ctx.out.push("</g>");
  }
  const height = top + maxH + margin + (below ? below * 26 + 24 : 0);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" viewBox="0 0 ${n(width)} ${n(height)}">${ctx.out.join("")}</svg>`;
}
