// End-to-end checks against the production build in real Chrome.
//
//   npm run build && npm run test:e2e
//
// Set CHROME_PATH if Chrome isn't in a standard location.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEMPLATES } from "../../src/templates";

const PORT = 4791;
const BASE = `http://localhost:${PORT}/`;

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean) as string[];

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
const built = existsSync("dist/index.html");

let server: ChildProcess;
let browser: Browser;
let page: Page;
const pageErrors: string[] = [];

function shareHash(engine: string, title: string, code: string) {
  const packed = deflateRawSync(Buffer.from(JSON.stringify({ e: engine, t: title, c: code })));
  return "#u1:" + packed.toString("base64url");
}

/** Open a diagram through a share link and wait for it to finish drawing. */
async function openDiagram(engine: string, title: string, code: string) {
  await page.evaluate(() => {
    document.getElementById("status-render")!.dataset.state = "pending";
  });
  await page.evaluate((hash) => (location.hash = hash), shareHash(engine, title, code));
  await page.waitForFunction(
    () => ["ok", "error", "idle"].includes(document.getElementById("status-render")!.dataset.state ?? ""),
    { timeout: 60_000 },
  );
  return page.evaluate(() => ({
    state: document.getElementById("status-render")!.dataset.state,
    status: document.getElementById("status-render")!.textContent,
    error: document.getElementById("error-card")!.hidden ? null : document.getElementById("error-card")!.textContent,
    title: (document.getElementById("doc-title") as HTMLInputElement).value,
    svg: !!document.querySelector("#sheet > svg"),
    message: document.getElementById("preview-message")!.hidden ? null : document.getElementById("preview-message")!.textContent,
  }));
}

describe.skipIf(!chrome || !built)("Figvex in the browser", () => {
  beforeAll(async () => {
    server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--port", String(PORT), "--strictPort"], {
      stdio: "ignore",
    });
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(BASE)).ok) break;
      } catch {
        // not up yet
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] });
    page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    page.on("pageerror", (err) => pageErrors.push(String(err)));
    await page.goto(BASE, { waitUntil: "load" });
    await page.waitForSelector("#sheet > svg", { timeout: 60_000 });
  });

  afterAll(async () => {
    await browser?.close();
    server?.kill();
  });

  it("draws the welcome diagram on first visit", async () => {
    const state = await page.$eval("#status-render", (el) => (el as HTMLElement).dataset.state);
    expect(state).toBe("ok");
    expect(await page.$eval("#doc-title", (el) => (el as HTMLInputElement).value)).toBe("Welcome");
  });

  const drawable = TEMPLATES.filter((t) => t.id !== "blank-plantuml");

  it.each(drawable.map((t) => [t.id, t] as const))("renders the %s template", async (_id, t) => {
    const result = await openDiagram(t.engine, t.title, t.code);
    expect(result.error).toBeNull();
    expect(result.state).toBe("ok");
    expect(result.svg).toBe(true);
  });

  it("shows a friendly empty state for a blank PlantUML diagram", async () => {
    const result = await openDiagram("plantuml", "Blank", "@startuml\n\n@enduml\n");
    expect(result.error).toBeNull();
    expect(result.state).toBe("idle");
    expect(result.message).toContain("Nothing to draw yet");
  });

  it("reports PlantUML syntax errors with a line number", async () => {
    const result = await openDiagram("plantuml", "Broken", "@startuml\nA -> B\nthis is not ::: valid\n@enduml");
    expect(result.state).toBe("error");
    expect(result.error).toContain("line 3");
    expect(await page.$$eval(".cm-errorLine", (els) => els.length)).toBe(1);
  });

  it("reports Mermaid syntax errors with a line number", async () => {
    const result = await openDiagram("mermaid", "Broken mermaid", "flowchart TD\n  A -->\n");
    expect(result.state).toBe("error");
    expect(result.error).toMatch(/line \d/i);
  });

  it("explains diagram types the browser engine lacks", async () => {
    const result = await openDiagram("plantuml", "Wireframe", "@startsalt\n{\n  Login | \"user\"\n}\n@endsalt");
    expect(result.error).toContain("Salt wireframes");
    expect(result.error).toContain("plantuml.com");
  });

  it("jumps to the source line when a shape is clicked", async () => {
    const code = "@startuml\nclass Alpha\n\nclass Beta\nAlpha --> Beta\n@enduml";
    await openDiagram("plantuml", "Click test", code);
    const box = await (await page.$("#sheet [data-qualified-name='Beta'] rect, #sheet [data-qualified-name='Beta'] path"))!.boundingBox();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + 4);
    const line = await page.$eval("#status-cursor", (el) => el.textContent);
    expect(line).toMatch(/^Ln 4,/);
  });

  it("exports SVG, PNG and PDF files", async () => {
    await openDiagram("plantuml", "Export test", "@startuml\nAlice -> Bob : hello\n@enduml");
    // Capture downloads inside the page: intercept the <a download> click and
    // read the blob it points to.
    await page.evaluate(() => {
      const w = window as unknown as { __downloads: { name: string; size: number; head: string }[] };
      w.__downloads = [];
      HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
        const name = this.download;
        fetch(this.href)
          .then((r) => r.arrayBuffer())
          .then((buf) => {
            const head = String.fromCharCode(...new Uint8Array(buf.slice(0, 5)));
            w.__downloads.push({ name, size: buf.byteLength, head });
          });
      };
    });

    for (const format of ["SVG", "PNG", "PDF"]) {
      await page.click("#btn-export");
      await page.waitForSelector(".popover");
      for (const b of await page.$$(".format-grid button")) {
        if ((await b.evaluate((el) => el.textContent)) === format) await b.click();
      }
      const [download] = await page.$$(".popover .btn-ink");
      await download.click();
      await page.waitForFunction(() => !document.querySelector(".popover"), { timeout: 30_000 });
    }
    await page.waitForFunction(() => (window as unknown as { __downloads: unknown[] }).__downloads.length === 3);

    const files = await page.evaluate(() => (window as unknown as { __downloads: { name: string; size: number; head: string }[] }).__downloads);
    const byName = Object.fromEntries(files.map((f) => [f.name, f]));
    expect(Object.keys(byName).sort()).toEqual(["export-test.pdf", "export-test.png", "export-test.svg"]);
    expect(byName["export-test.svg"].head).toBe("<?xml");
    expect(byName["export-test.png"].head.slice(1, 4)).toBe("PNG");
    expect(byName["export-test.pdf"].head).toBe("%PDF-");
    for (const f of files) expect(f.size).toBeGreaterThan(500);
  });

  it("draws PlantUML without fill colours by default", async () => {
    await openDiagram("plantuml", "Plain test", "@startuml\nclass Alpha\nAlpha --> Beta\n@enduml");
    const fills = await page.$$eval("#sheet rect, #sheet path, #sheet ellipse", (els) =>
      els.map((el) => (el.getAttribute("fill") ?? "").toUpperCase()),
    );
    // PlantUML's classic palette fills classes with #F1F1F1 and circles with #ADD1B2.
    expect(fills).not.toContain("#ADD1B2");
    expect(fills).not.toContain("#F1F1F1");
  });

  it("keeps line numbers right when a style is applied", async () => {
    const result = await openDiagram("plantuml", "Styled error", "@startuml\nA -> B\nthis is not ::: valid\n@enduml");
    expect(result.error).toContain("line 3");
  });

  it("keeps every opened diagram in the library", async () => {
    const count = await page.evaluate(() => JSON.parse(localStorage.getItem("figvex.docs.v1") ?? "[]").length);
    expect(count).toBeGreaterThan(TEMPLATES.length);
  });

  it("serves the third-party licence file linked from Help", async () => {
    const text = await (await fetch(`${BASE}third-party-licenses.txt`)).text();
    expect(text).toContain("mermaid");
    expect(text).toContain("@plantuml/core");
    expect(text).toContain("CC-BY 4.0");
  });

  it("throws no uncaught page errors", () => {
    expect(pageErrors).toEqual([]);
  });
});
