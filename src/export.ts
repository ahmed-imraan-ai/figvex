// Export works from the engine's original SVG (not the sanitised preview copy)
// so files keep everything the engine produced, including PlantUML's embedded
// source.

import { intrinsicSize } from "./preview";

export type ImageFormat = "svg" | "png" | "jpeg" | "webp" | "pdf";
export type Background = "transparent" | "white" | "dark";

export interface ExportOptions {
  format: ImageFormat;
  scale: number;
  background: Background;
}

const BACKGROUND_COLOR: Record<Exclude<Background, "transparent">, string> = {
  white: "#ffffff",
  dark: "#1b1b1a",
};

/** Parse the SVG and give it explicit pixel dimensions. */
function prepare(svgMarkup: string, background: Background): { svg: SVGSVGElement; width: number; height: number } {
  const doc = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const svg = doc.documentElement as unknown as SVGSVGElement;
  if (doc.querySelector("parsererror")) throw new Error("The diagram SVG could not be read.");
  const { width, height } = intrinsicSize(svg);
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.style.removeProperty("max-width");
  if (background !== "transparent") {
    // A real rectangle rather than a CSS background, so every viewer shows it.
    const ns = "http://www.w3.org/2000/svg";
    const rect = doc.createElementNS(ns, "rect");
    const vb = svg.viewBox.baseVal;
    const hasViewBox = svg.hasAttribute("viewBox") && vb && vb.width > 0;
    rect.setAttribute("x", String(hasViewBox ? vb.x : 0));
    rect.setAttribute("y", String(hasViewBox ? vb.y : 0));
    rect.setAttribute("width", String(hasViewBox ? vb.width : width));
    rect.setAttribute("height", String(hasViewBox ? vb.height : height));
    rect.setAttribute("fill", BACKGROUND_COLOR[background]);
    // After any <style>/<defs> so it is still painted first among shapes.
    const firstShape = [...svg.children].find((c) => !["style", "defs", "title", "desc"].includes(c.localName));
    svg.insertBefore(rect, firstShape ?? null);
  }
  return { svg, width, height };
}

export function svgBlob(svgMarkup: string, background: Background): Blob {
  const { svg } = prepare(svgMarkup, background);
  const text = new XMLSerializer().serializeToString(svg);
  return new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${text}`], { type: "image/svg+xml" });
}

export async function rasterBlob(svgMarkup: string, opts: ExportOptions): Promise<Blob> {
  const background = opts.format === "jpeg" && opts.background === "transparent" ? "white" : opts.background;
  const { svg, width, height } = prepare(svgMarkup, background);
  const text = new XMLSerializer().serializeToString(svg);
  // A data: URL keeps the canvas untainted in every browser (blob: URLs
  // don't in Safari).
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
  const img = new Image();
  img.decoding = "sync";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("The browser could not rasterise this SVG."));
    img.src = src;
  });

  // Browsers cap canvas area; scale down rather than fail on huge diagrams.
  const MAX_PIXELS = 16_000_000;
  let scale = opts.scale;
  if (width * height * scale * scale > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (width * height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const mime = `image/${opts.format}`;
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(`This browser can't encode ${opts.format.toUpperCase()}.`))), mime, 0.95),
  );
}

export async function pdfBlob(svgMarkup: string, background: Background): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import("jspdf"), import("svg2pdf.js")]);
  const { svg, width, height } = prepare(svgMarkup, background);
  // svg2pdf crashes on processing instructions such as PlantUML's
  // <?plantuml-src ...?>, and has no use for comments either.
  const walker = svg.ownerDocument.createTreeWalker(svg, NodeFilter.SHOW_PROCESSING_INSTRUCTION | NodeFilter.SHOW_COMMENT);
  const strip: Node[] = [];
  while (walker.nextNode()) strip.push(walker.currentNode);
  for (const node of strip) node.parentNode?.removeChild(node);

  // svg2pdf reads computed styles, so the SVG has to be in the document.
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden";
  host.append(document.importNode(svg, true));
  document.body.append(host);
  try {
    const pdf = new jsPDF({
      orientation: width >= height ? "landscape" : "portrait",
      unit: "pt",
      format: [width * 0.75, height * 0.75],
      compress: true,
    });
    const drawing = svg2pdf(host.firstElementChild as SVGSVGElement, pdf, {
      x: 0,
      y: 0,
      width: width * 0.75,
      height: height * 0.75,
    });
    await Promise.race([
      drawing,
      new Promise((_, reject) => setTimeout(() => reject(new Error("PDF export took too long. Try SVG or PNG.")), 30_000)),
    ]);
    return pdf.output("blob");
  } finally {
    host.remove();
  }
}

export function exportBlob(svgMarkup: string, opts: ExportOptions): Promise<Blob> {
  switch (opts.format) {
    case "svg":
      return Promise.resolve(svgBlob(svgMarkup, opts.background));
    case "pdf":
      return pdfBlob(svgMarkup, opts.background);
    default:
      return rasterBlob(svgMarkup, opts);
  }
}

export function supportsImageClipboard(): boolean {
  return typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;
}

export async function copyPng(svgMarkup: string, scale: number, background: Background) {
  // Safari needs the ClipboardItem created synchronously with a promise.
  const blob = rasterBlob(svgMarkup, { format: "png", scale, background });
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
