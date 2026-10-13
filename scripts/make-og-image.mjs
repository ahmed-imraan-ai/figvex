// Renders public/og-image.png (1200x630, the social preview) and
// public/apple-touch-icon.png (180x180) with headless Chrome.
//
// Usage: node scripts/make-og-image.mjs
// Needs Chrome; set CHROME_PATH if it isn't found. Re-run after changing the
// logo or docs/screenshot.png, and commit the PNGs.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const chrome = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => p && existsSync(p));
if (!chrome) throw new Error("Chrome not found; set CHROME_PATH.");

const screenshot = readFileSync(join(root, "docs", "screenshot.png")).toString("base64");
const font = (weight) =>
  readFileSync(join(root, "node_modules", "@fontsource", "ibm-plex-sans", "files", `ibm-plex-sans-latin-${weight}-normal.woff2`)).toString("base64");

const mark = `<svg viewBox="0 0 24 24" width="{S}" height="{S}">
  <path d="M5 19C6.5 8 17.5 16 19 5" fill="none" stroke="#1d1d1b" stroke-width="2.4" stroke-linecap="round"/>
  <rect x="2.6" y="16.6" width="4.8" height="4.8" fill="#f5f3ee" stroke="#c2410c" stroke-width="1.8"/>
  <rect x="16.6" y="2.6" width="4.8" height="4.8" fill="#f5f3ee" stroke="#c2410c" stroke-width="1.8"/>
</svg>`;

const style = `
  @font-face { font-family: Plex; font-weight: 400; src: url(data:font/woff2;base64,${font(400)}) format("woff2"); }
  @font-face { font-family: Plex; font-weight: 600; src: url(data:font/woff2;base64,${font(600)}) format("woff2"); }
  * { margin: 0; box-sizing: border-box; }
  body { font-family: Plex, sans-serif; color: #1d1d1b; background: #f5f3ee; }
`;

const card = `<!doctype html><html><head><style>${style}
  .card { position: relative; width: 1200px; height: 630px; overflow: hidden;
    background-image: radial-gradient(#d9d5ca 1.2px, transparent 1.4px); background-size: 22px 22px; }
  .text { position: absolute; left: 72px; top: 0; bottom: 0; width: 470px;
    display: flex; flex-direction: column; justify-content: center; }
  .brand { display: flex; align-items: center; gap: 18px; margin-bottom: 34px; }
  .brand span { font-size: 64px; font-weight: 600; letter-spacing: -0.02em; }
  h1 { font-size: 46px; line-height: 1.12; font-weight: 600; letter-spacing: -0.015em; margin-bottom: 22px; }
  p { font-size: 25px; line-height: 1.4; color: #57564f; }
  .shot { position: absolute; left: 590px; top: 92px; width: 760px; height: 454px;
    border: 1px solid #cfcabd; border-radius: 10px; overflow: hidden;
    box-shadow: 0 2px 4px rgba(40,35,20,.08), 0 24px 60px rgba(40,35,20,.18); }
  .shot img { width: 100%; display: block; }
</style></head><body><div class="card">
  <div class="text">
    <div class="brand">${mark.replaceAll("{S}", "64")}<span>figvex</span></div>
    <h1>Free online diagram editor</h1>
    <p>PlantUML, Mermaid, Graphviz, BPMN, networks, org charts and charts. Drawn as you type, in your browser.</p>
  </div>
  <div class="shot"><img src="data:image/png;base64,${screenshot}"></div>
</div></body></html>`;

const touch = `<!doctype html><html><head><style>${style}
  .icon { width: 180px; height: 180px; background: #1d1d1b; display: grid; place-items: center; }
  .icon path { stroke: #f5f3ee; } .icon rect { fill: #1d1d1b; stroke: #f07a4a; }
</style></head><body><div class="icon">${mark.replaceAll("{S}", "128")}</div></body></html>`;

const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage();

await page.setViewport({ width: 1200, height: 630 });
await page.setContent(card, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(root, "public", "og-image.png") });

await page.setViewport({ width: 180, height: 180 });
await page.setContent(touch, { waitUntil: "load" });
await page.screenshot({ path: join(root, "public", "apple-touch-icon.png") });

await browser.close();
console.log("[og-image] public/og-image.png, public/apple-touch-icon.png");
