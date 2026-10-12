import { ENGINE_EXT, type Engine } from "../engines/types";
import { copyPng, exportBlob, supportsImageClipboard, type Background, type ImageFormat } from "../export";
import { copyText, downloadBlob, h, icon, modKey, slugify } from "../lib/dom";
import { ICONS } from "./icons";
import { closePopover, toast } from "./overlay";

export interface ExportContext {
  title: string;
  engine: Engine;
  code: string;
  /** Raw SVG from the last successful render, or null. */
  svg: string | null;
  tone: "light" | "dark";
}

const FORMATS: { id: ImageFormat; label: string }[] = [
  { id: "svg", label: "SVG" },
  { id: "png", label: "PNG" },
  { id: "jpeg", label: "JPG" },
  { id: "webp", label: "WEBP" },
  { id: "pdf", label: "PDF" },
];

// Remembered for the session so repeated exports are one click.
const last = { format: "png" as ImageFormat, scale: 2, transparent: false };

export function downloadSource(ctx: Pick<ExportContext, "title" | "engine" | "code">) {
  const ext = ENGINE_EXT[ctx.engine];
  downloadBlob(new Blob([ctx.code], { type: "text/plain;charset=utf-8" }), `${slugify(ctx.title)}.${ext}`);
}

export function buildExportPanel(ctx: ExportContext): HTMLElement {
  const hasImage = !!ctx.svg;
  const root = h("div");

  const formatButtons = FORMATS.map((f) =>
    h("button", { type: "button", role: "radio", "data-format": f.id, onclick: () => setFormat(f.id) }, f.label),
  );
  const scaleButtons = [1, 2, 3, 4].map((s) =>
    h("button", { type: "button", "aria-pressed": "false", onclick: () => setScale(s) }, `${s}×`),
  );
  const bgSolid = h("button", { type: "button", onclick: () => setTransparent(false) }, "Solid");
  const bgClear = h("button", { type: "button", onclick: () => setTransparent(true) }, "Transparent");
  const nameInput = h("input", { class: "field", type: "text", spellcheck: "false", "aria-label": "File name" });
  nameInput.value = slugify(ctx.title);
  const extLabel = h("span", { class: "panel-hint", style: "margin:0;font-family:var(--font-mono)" });
  const scaleRow = h("div", { class: "panel-row" }, h("span", {}, "Scale"), h("div", { class: "segmented" }, scaleButtons));

  const copyBtn = h("button", { class: "btn btn-outline", type: "button", onclick: () => copy() });
  const downloadBtn = h(
    "button",
    { class: "btn btn-ink", type: "button", onclick: () => download() },
    icon(ICONS.download),
    "Download",
  );
  if (!hasImage) {
    copyBtn.disabled = true;
    downloadBtn.disabled = true;
  }

  function setFormat(format: ImageFormat) {
    last.format = format;
    for (const b of formatButtons) b.setAttribute("aria-checked", String(b.dataset.format === format));
    const raster = format === "png" || format === "jpeg" || format === "webp";
    scaleRow.hidden = !raster;
    bgClear.disabled = format === "jpeg";
    if (format === "jpeg") setTransparent(false);
    extLabel.textContent = `.${format === "jpeg" ? "jpg" : format}`;
    const canCopyImage = supportsImageClipboard();
    copyBtn.replaceChildren(icon(ICONS.copy), format === "svg" ? "Copy SVG code" : "Copy as PNG");
    copyBtn.disabled = !hasImage || (format !== "svg" && !canCopyImage);
  }

  function setScale(scale: number) {
    last.scale = scale;
    scaleButtons.forEach((b, i) => b.setAttribute("aria-pressed", String(i + 1 === scale)));
  }

  function setTransparent(transparent: boolean) {
    last.transparent = transparent;
    bgSolid.setAttribute("aria-pressed", String(!transparent));
    bgClear.setAttribute("aria-pressed", String(transparent));
  }

  const background = (): Background => (last.transparent ? "transparent" : ctx.tone === "dark" ? "dark" : "white");

  async function download() {
    if (!ctx.svg) return;
    downloadBtn.disabled = true;
    try {
      const blob = await exportBlob(ctx.svg, { format: last.format, scale: last.scale, background: background() });
      const name = slugify(nameInput.value || ctx.title);
      downloadBlob(blob, `${name}${extLabel.textContent}`);
      closePopover();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Export failed", { error: true });
    } finally {
      downloadBtn.disabled = false;
    }
  }

  async function copy() {
    if (!ctx.svg) return;
    try {
      if (last.format === "svg") {
        const blob = await exportBlob(ctx.svg, { format: "svg", scale: 1, background: background() });
        await copyText(await blob.text());
        toast("SVG code copied");
      } else {
        await copyPng(ctx.svg, last.scale, background());
        toast("Image copied. Paste it into your document.");
      }
      closePopover();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Copy failed", { error: true });
    }
  }

  root.append(
    h(
      "div",
      { class: "panel-section" },
      h("h3", { class: "panel-title" }, "Image"),
      h("div", { class: "format-grid", role: "radiogroup", "aria-label": "Format" }, formatButtons),
      h("div", { style: "height:10px" }),
      scaleRow,
      h("div", { class: "panel-row" }, h("span", {}, "Background"), h("div", { class: "segmented" }, bgSolid, bgClear)),
      h(
        "div",
        { class: "panel-row" },
        h("span", {}, "Name"),
        h("div", { style: "display:flex;align-items:center;gap:4px;min-width:0" }, nameInput, extLabel),
      ),
      hasImage ? null : h("p", { class: "panel-hint" }, "Fix the errors in your diagram to export an image."),
      h("div", { class: "panel-actions" }, copyBtn, downloadBtn),
    ),
    h(
      "div",
      { class: "panel-section" },
      h("h3", { class: "panel-title" }, "Source"),
      h(
        "ul",
        { class: "menu-list" },
        h(
          "li",
          {},
          h(
            "button",
            { type: "button", onclick: () => (downloadSource(ctx), closePopover()) },
            icon(ICONS.download),
            h("span", { style: "flex:1" }, `Download .${ENGINE_EXT[ctx.engine]} file`),
            h("kbd", {}, `${modKey}+S`),
          ),
        ),
        h(
          "li",
          {},
          h(
            "button",
            {
              type: "button",
              onclick: async () => {
                await copyText(ctx.code);
                toast("Source copied");
                closePopover();
              },
            },
            icon(ICONS.copy),
            "Copy source",
          ),
        ),
      ),
    ),
  );

  nameInput.style.width = "150px";
  setFormat(last.format);
  setScale(last.scale);
  setTransparent(last.transparent);
  return root;
}
