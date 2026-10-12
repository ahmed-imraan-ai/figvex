import { describe, expect, it } from "vitest";
import { svgBlob } from "../../src/export";
import { intrinsicSize } from "../../src/preview";

const parse = (markup: string) =>
  new DOMParser().parseFromString(markup, "image/svg+xml").documentElement as unknown as SVGSVGElement;

describe("intrinsicSize", () => {
  it("prefers explicit width and height", () => {
    expect(intrinsicSize(parse('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 10 10"/>'))).toEqual({
      width: 120,
      height: 80,
    });
  });

  it("falls back to the viewBox for percentage sizes (Mermaid)", () => {
    expect(intrinsicSize(parse('<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="-8 -8 316.5 200.2"/>'))).toEqual({
      width: 317,
      height: 201,
    });
  });

  it("has a sensible default", () => {
    expect(intrinsicSize(parse('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toEqual({ width: 300, height: 150 });
  });
});

describe("svgBlob", () => {
  const mermaidLike =
    '<svg xmlns="http://www.w3.org/2000/svg" width="100%" style="max-width: 200px;" viewBox="0 0 200 100"><style>.a{}</style><g><rect width="10" height="10"/></g></svg>';

  it("gives the SVG pixel dimensions and an XML declaration", async () => {
    const text = await svgBlob(mermaidLike, "transparent").text();
    expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    const svg = parse(text.replace(/^<\?xml[^>]*>\s*/, ""));
    expect(svg.getAttribute("width")).toBe("200");
    expect(svg.getAttribute("height")).toBe("100");
    expect(svg.getAttribute("style") ?? "").not.toContain("max-width");
    expect(svg.querySelectorAll("rect")).toHaveLength(1);
  });

  it("paints a solid background behind the drawing, after <style>", async () => {
    const text = await svgBlob(mermaidLike, "white").text();
    const svg = parse(text.replace(/^<\?xml[^>]*>\s*/, ""));
    const children = [...svg.children].map((c) => c.localName);
    expect(children).toEqual(["style", "rect", "g"]);
    expect(svg.children[1].getAttribute("fill")).toBe("#ffffff");
    expect(svg.children[1].getAttribute("width")).toBe("200");
  });
});
