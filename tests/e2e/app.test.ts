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
    () => ["ok", "warn", "error", "idle"].includes(document.getElementById("status-render")!.dataset.state ?? ""),
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
    // The subnetting exercise has a mistake in it on purpose.
    expect(result.state).toBe(t.id === "net-subnetting" ? "warn" : "ok");
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

  it("reports Graphviz syntax errors with a line number", async () => {
    const result = await openDiagram("graphviz", "Broken dot", "digraph G {\n  a -> b\n  b -> \n}");
    expect(result.state).toBe("error");
    expect(result.error).toContain("line 4");
    expect(await page.$eval("#status-engine", (el) => el.textContent)).toMatch(/^Graphviz \d/);
  });

  it("draws PlantUML @startdot blocks with Graphviz", async () => {
    const result = await openDiagram("plantuml", "Dot in PlantUML", "@startdot\ndigraph { a -> b }\n@enddot");
    expect(result.error).toBeNull();
    expect(result.svg).toBe(true);
    expect(await page.$$eval("#sheet g.node", (els) => els.length)).toBe(2);
  });

  it("jumps to a Graphviz node's line when it is clicked", async () => {
    await openDiagram("graphviz", "Dot click", "digraph G {\n  first -> second\n\n  third [shape=box]\n}");
    const box = await (await page.$("#sheet g.node:last-of-type polygon"))!.boundingBox();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    expect(await page.$eval("#status-cursor", (el) => el.textContent)).toMatch(/^Ln 4,/);
  });

  it("reports chart JSON errors with a line number", async () => {
    const result = await openDiagram("echarts", "Broken chart", '{\n  "series": [\n    { "type": "bar" }\n    { "type": "line" }\n  ]\n}');
    expect(result.state).toBe("error");
    expect(result.error).toContain("line 4");
    expect(await page.$eval("#status-engine", (el) => el.textContent)).toMatch(/^ECharts \d/);
  });

  it("draws a chart from CSV and changes palette from the Style menu", async () => {
    const code = '{ "xAxis": { "type": "category" }, "yAxis": {}, "series": [{ "type": "bar", "colorBy": "data" }] }\n---\nk,v\na,1\nb,2';
    expect((await openDiagram("echarts", "Palette", code)).svg).toBe(true);
    const fills = () => page.$$eval("#sheet path", (els) => els.map((e) => (e.getAttribute("fill") ?? "").toLowerCase()));
    await page.select("#style-select", "colour-blind");
    await page.waitForFunction(() => document.getElementById("status-render")!.dataset.state === "ok");
    await page.waitForFunction(() => [...document.querySelectorAll("#sheet path")].some((e) => e.getAttribute("fill")?.toLowerCase() === "#0072b2"));
    expect(await fills()).toContain("#0072b2");
    await page.select("#style-select", "default");
  });

  const bpmn = (body: string) =>
    `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d">\n<process id="p">\n${body}\n</process>\n</definitions>`;

  it("reports BPMN XML errors and broken references with a line number", async () => {
    const broken = await openDiagram("bpmn", "Broken BPMN", bpmn('<task id="t">\n<startEvent id="s" />'));
    expect(broken.state).toBe("error");
    expect(broken.error).toMatch(/line \d/);
    const missing = await openDiagram("bpmn", "Missing ref", bpmn('<task id="t" />\n<sequenceFlow id="f" sourceRef="t" targetRef="nope" />'));
    expect(missing.error).toContain("line 4");
    expect(missing.error).toContain('"nope"');
  });

  it("lays out BPMN without saved positions and jumps to a task's line when clicked", async () => {
    const result = await openDiagram("bpmn", "BPMN click", bpmn('<startEvent id="s" />\n<userTask id="t" name="Approve" />\n<sequenceFlow id="f" sourceRef="s" targetRef="t" />'));
    expect(result.error).toBeNull();
    const box = await (await page.$('#sheet [data-element-id="t"] rect'))!.boundingBox();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height - 6);
    expect(await page.$eval("#status-cursor", (el) => el.textContent)).toMatch(/^Ln 4,/);
  });

  it("draws on the sketch canvas and writes the shapes into the text", async () => {
    await openDiagram("sketch", "Canvas test", "sketch\n");
    expect(await page.$eval(".sketch-tools", (el) => (el as HTMLElement).hidden)).toBe(false);
    const sheet = (await (await page.$("#sheet > svg"))!.boundingBox())!;
    const at = (fx: number, fy: number) => ({ x: sheet.x + sheet.width * fx, y: sheet.y + sheet.height * fy });
    const drag = async (a: { x: number; y: number }, b: { x: number; y: number }) => {
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
      await page.mouse.move(b.x, b.y, { steps: 4 });
      await page.mouse.up();
    };
    const text = () => page.evaluate(() => document.querySelector(".cm-content")!.textContent ?? "");

    await page.click('.sketch-tool[data-tool="box"]');
    await drag(at(0.1, 0.1), at(0.3, 0.25));
    await page.keyboard.press("o");
    await drag(at(0.6, 0.1), at(0.8, 0.25));
    await page.keyboard.press("a");
    await drag(at(0.2, 0.17), at(0.7, 0.17));
    await page.waitForFunction(() => /arrow box1 -> ellipse1/.test(document.querySelector(".cm-content")!.textContent ?? ""));
    expect(await text()).toMatch(/box box1 [\d.]+ [\d.]+ [\d.]+ [\d.]+/);
    expect(await text()).toMatch(/ellipse ellipse1/);

    // Double-click the box to give it a label.
    const box = at(0.2, 0.17);
    await page.mouse.click(box.x, box.y, { count: 2 });
    await page.waitForSelector(".sketch-label");
    await page.keyboard.type("Login");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => /box box1 .* "Login"/.test(document.querySelector(".cm-content")!.textContent ?? ""));

    // Move the box; the arrow stays attached by id.
    const before = (await text()).match(/box box1 ([\d.]+) ([\d.]+)/)!;
    await drag(at(0.15, 0.2), at(0.15, 0.5));
    await page.waitForFunction(
      (y) => !(document.querySelector(".cm-content")!.textContent ?? "").includes(`box box1 ${y}`),
      {},
      `${before[1]} ${before[2]}`,
    );
    expect(await text()).toMatch(/arrow box1 -> ellipse1/);

    // Delete the ellipse, then undo from the canvas.
    await page.mouse.click(at(0.7, 0.17).x, at(0.7, 0.17).y);
    await page.keyboard.press("Delete");
    await page.waitForFunction(() => !/ellipse ellipse1/.test(document.querySelector(".cm-content")!.textContent ?? ""));
    expect(await text()).toMatch(/arrow box1 -> [\d.]+,[\d.]+/);
    await page.keyboard.down("Control");
    await page.keyboard.press("z");
    await page.keyboard.up("Control");
    await page.waitForFunction(() => /ellipse ellipse1/.test(document.querySelector(".cm-content")!.textContent ?? ""));
  });

  it("snaps connectors to sides, lines shapes up and arranges a selection", async () => {
    await openDiagram("sketch", "Snap test", "sketch\nbox boss 300 60 160 70 \"Boss\"\nbox dev 200 260 140 70 \"Dev\"\nbox ops 520 300 140 70 \"Ops\"\n");
    // Diagram coordinates to screen coordinates.
    const map = await page.$eval("#sheet > svg", (svg) => {
      const r = svg.getBoundingClientRect();
      const vb = (svg as SVGSVGElement).viewBox.baseVal;
      return { left: r.left, top: r.top, k: r.width / vb.width, vx: vb.x, vy: vb.y };
    });
    const at = (x: number, y: number) => ({ x: map.left + (x - map.vx) * map.k, y: map.top + (y - map.vy) * map.k });
    const drag = async (a: { x: number; y: number }, b: { x: number; y: number }) => {
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
      await page.mouse.move(b.x, b.y, { steps: 5 });
      await page.mouse.up();
    };
    const text = () => page.evaluate(() => document.querySelector(".cm-content")!.textContent ?? "");

    // Connector from the boss's bottom point to the dev's top point.
    await page.click('.sketch-tool[data-tool="connector"]');
    await drag(at(380, 129), at(270, 261));
    await page.waitForFunction(() => /arrow boss\.bottom -> dev\.top elbow/.test(document.querySelector(".cm-content")!.textContent ?? ""));

    // E switches the selected connector to a straight line and back.
    await page.keyboard.press("e");
    await page.waitForFunction(() => /arrow boss\.bottom -> dev\.top(?! elbow)/.test(document.querySelector(".cm-content")!.textContent ?? ""));
    await page.keyboard.press("e");
    await page.waitForFunction(() => /dev\.top elbow/.test(document.querySelector(".cm-content")!.textContent ?? ""));

    // Dragging ops near dev's row lines its top up with dev's (y 260).
    await drag(at(590, 335), at(590, 299));
    await page.waitForFunction(() => /box ops \d+ 260 /.test(document.querySelector(".cm-content")!.textContent ?? ""));

    // Box-select dev and ops, then align their left edges.
    await drag(at(150, 220), at(720, 420));
    await page.waitForSelector(".sketch-arrange:not([hidden])");
    await page.click('.sketch-arrange button[aria-label="Align left"]');
    await page.waitForFunction(() => /box ops 200 /.test(document.querySelector(".cm-content")!.textContent ?? ""));
    expect(await text()).toMatch(/box dev 200 /);
  });

  it("draws an org chart, reports mistakes by line and jumps to a person", async () => {
    const broken = await openDiagram("orgchart", "Broken org", "orgchart\nJane: CEO\n  Ravi: CTO\nRavi .. Nobody");
    expect(broken.error).toContain("line 4");
    expect(broken.error).toContain('"Nobody"');
    const ok = await openDiagram("orgchart", "Org click", "orgchart\nJane: CEO [Exec]\n  Ravi: CTO\n  Mia: CFO\n");
    expect(ok.error).toBeNull();
    expect(await page.$eval("#lang-input", (el) => (el as HTMLInputElement).value)).toBe("Org chart");
    const box = await (await page.$('#sheet [data-qualified-name="Mia"] rect'))!.boundingBox();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    expect(await page.$eval("#status-cursor", (el) => el.textContent)).toMatch(/^Ln 4,/);
  });

  it("draws a network, marks address warnings and jumps to a device", async () => {
    const broken = await openDiagram("network", "Broken net", "network\nrouter r1 10.0.0.300\n");
    expect(broken.error).toContain("line 2");
    expect(broken.error).toContain("300 is more than 255");

    const code = 'network\nrouter gw "Gateway"\nzone lan "LAN" 10.9.0.0/24\n  switch netsw 10.9.0.2\n  pc wrongpc 10.8.0.5\ngw -- netsw\nnetsw -- wrongpc\n';
    const ok = await openDiagram("network", "Net warnings", code);
    expect(ok.error).toBeNull();
    expect(ok.state).toBe("warn");
    expect(ok.status).toMatch(/1 warning$/);
    expect(await page.$eval("#lang-input", (el) => (el as HTMLInputElement).value)).toBe("Network");
    const marker = await page.$eval(".cm-warnMarker", (el) => (el as HTMLElement).title);
    expect(marker).toContain("10.8.0.5 isn't in LAN");

    // The status bar takes you to the warning.
    await page.click("#status-render");
    expect(await page.$eval("#status-cursor", (el) => el.textContent)).toMatch(/^Ln 5,/);

    // Clicking a device selects its line.
    const icon = await (await page.$('#sheet [data-qualified-name="netsw"] rect'))!.boundingBox();
    await page.mouse.click(icon!.x + icon!.width / 2, icon!.y + icon!.height / 2);
    expect(await page.$eval("#status-cursor", (el) => el.textContent)).toMatch(/^Ln 4,/);
  });

  it("draws a truth table and Karnaugh map from a boolean expression", async () => {
    const broken = await openDiagram("logic", "Logic broken", "logic\nF = A + (B\n");
    expect(broken.error).toContain("line 2");
    expect(broken.error).toContain("bracket isn't closed");

    const ok = await openDiagram("logic", "Logic test", "logic\nF = A'B' + A'B + AB\nshow table kmap simplified\n");
    expect(ok.error).toBeNull();
    expect(await page.$eval("#lang-input", (el) => (el as HTMLInputElement).value)).toBe("Logic");
    // Two groups on the map, and the answer A' + B.
    expect(await page.$$eval('#sheet rect[rx="12"]', (els) => els.length)).toBe(2);
    expect(await page.$eval("#sheet svg", (el) => el.textContent)).toContain("A + B");
  });

  it("steps through an automaton's input on the diagram", async () => {
    const code = "automaton\nstart e2\naccept e3\ne2 -x-> e3\ne3 -y-> e2\ninput xyx\ninput xx\n";
    const ok = await openDiagram("automaton", "Automaton test", code);
    expect(ok.error).toBeNull();
    expect(await page.$eval("#lang-input", (el) => (el as HTMLInputElement).value)).toBe("Automata");
    expect(await page.$eval(".player", (el) => (el as HTMLElement).hidden)).toBe(false);
    // Clicked through the DOM: the "Opened a shared diagram" toast can sit over the bar.
    const press = (label: string) => page.$eval(`.player [aria-label="${label}"]`, (el) => (el as HTMLElement).click());
    const on = () => page.$$eval("#sheet [data-on]", (els) => els.map((e) => e.getAttribute("data-state") ?? e.getAttribute("data-edge") ?? `cell${e.getAttribute("data-cell")}`));
    expect(await on()).toEqual(["e2", "cell0"]);
    await press("Next step");
    expect(await on()).toEqual(["0", "e3", "cell1"]);
    await press("Last step");
    expect(await page.$eval(".player-status", (el) => el.textContent)).toContain("✓ accepted, ending in e3");
    // The second input is rejected partway.
    await page.select(".player-input", "1");
    await press("Last step");
    expect(await page.$eval(".player-status", (el) => el.textContent)).toContain("no move on x");
    // Other languages hide the bar.
    await openDiagram("graphviz", "No player", "digraph { nobar }");
    expect(await page.$eval(".player", (el) => (el as HTMLElement).hidden)).toBe(true);
  });

  it("draws a WaveDrom timing diagram with its waves", async () => {
    const ok = await openDiagram("wavedrom", "Wave test", "{ signal: [{ name: 'clk', wave: 'p...' }, { name: 'd', wave: 'x.3x', data: ['v'] }] }");
    expect(ok.error).toBeNull();
    expect(await page.$eval("#lang-input", (el) => (el as HTMLInputElement).value)).toBe("Timing (WaveDrom)");
    // The bricks are copied in place, so the lanes have drawing in them.
    expect(await page.$$eval("#sheet [id^='wavelane_draw'] path", (els) => els.length)).toBeGreaterThan(4);
    expect(await page.$$eval("#sheet use", (els) => els.length)).toBe(0);
  });

  it("draws data structures and jumps to a structure's line", async () => {
    const ok = await openDiagram("structures", "Structures test", "structures\narray Arr = [4, 2]\nbst Tree = 5 3 8\ngraph Gr = X-Y:2\n");
    expect(ok.error).toBeNull();
    expect(await page.$eval("#lang-input", (el) => (el as HTMLInputElement).value)).toBe("Data structures");
    expect(await page.$$eval("#sheet [data-qualified-name]", (els) => els.map((e) => e.getAttribute("data-qualified-name")))).toEqual(["Arr", "Tree", "Gr"]);
    const tree = await (await page.$('#sheet [data-qualified-name="Tree"] circle'))!.boundingBox();
    await page.mouse.click(tree!.x + tree!.width / 2, tree!.y + tree!.height / 2);
    expect(await page.$eval("#status-cursor", (el) => el.textContent)).toMatch(/^Ln 3,/);
  });

  it("searches cloud icons and inserts one with its includes", async () => {
    await openDiagram("plantuml", "Icons test", "@startuml\nactor IconUser\n@enduml");
    expect(await page.$eval("#btn-icons", (el) => (el as HTMLElement).hidden)).toBe(false);
    await page.click("#btn-icons");
    await page.waitForSelector("dialog .template-item");
    await page.type("dialog input[type=search]", "kubernetes pod");
    await page.waitForFunction(() => document.querySelector("dialog .template-item span")?.textContent === "Kubernetes Pod");
    await page.keyboard.press("Enter");
    // The icons themselves load from plantuml.github.io, so only the text is checked here.
    const text = await page.evaluate(() => document.querySelector(".cm-content")!.textContent ?? "");
    expect(text).toContain("!include <k8s/Common>");
    expect(text).toContain("!include <k8s/oss/kubernetespod>");
    expect(text).toContain('KubernetesPod(kubernetespod, "Kubernetes Pod", "Kubernetes")');
    // Only PlantUML has the button.
    await openDiagram("graphviz", "No icons", "digraph { noicons }");
    expect(await page.$eval("#btn-icons", (el) => (el as HTMLElement).hidden)).toBe(true);
  });

  it("draws a wireframe and jumps to a control's line", async () => {
    const code = 'wireframe\nscreen wa "First" phone\n  header "Top"\n  button "Press me" primary\nscreen wb "Second" phone\n  text "Done"\nwa -> wb "next"\n';
    const ok = await openDiagram("wireframe", "Wire test", code);
    expect(ok.error).toBeNull();
    expect(await page.$eval("#lang-input", (el) => (el as HTMLInputElement).value)).toBe("Wireframe");
    expect(await page.$$eval("#sheet [data-qualified-name]", (els) => els.map((e) => e.getAttribute("data-qualified-name")))).toEqual(["wa", "wb"]);
    const button = await page.$$eval("#sheet text", (els) => {
      const t = els.find((e) => e.textContent === "Press me")!;
      const r = t.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.click(button.x, button.y);
    expect(await page.$eval("#status-cursor", (el) => el.textContent)).toMatch(/^Ln 4,/);
  });

  it("draws Graphviz labels with runs of spaces", async () => {
    // Graphviz writes them as no-break spaces, which the sanitiser turns into &nbsp;.
    const ok = await openDiagram("graphviz", "Spaces", 'digraph { spaced [label="two  spaces"] }');
    expect(ok.error).toBeNull();
    expect(await page.$eval("#sheet svg text", (el) => el.textContent)).toMatch(/^two\s{2}spaces$/);
  });

  it("draws tables from SQL, warns about a missing table and jumps to a column", async () => {
    const code = "CREATE TABLE sqlteams (\n  id int PRIMARY KEY,\n  name text\n);\nCREATE TABLE sqlplayers (\n  id int PRIMARY KEY,\n  team_id int NOT NULL REFERENCES sqlteams (id),\n  coach_id int REFERENCES coaches (id)\n);\n";
    const ok = await openDiagram("sql", "SQL test", code);
    expect(ok.error).toBeNull();
    expect(ok.state).toBe("warn");
    expect(await page.$eval("#lang-input", (el) => (el as HTMLInputElement).value)).toBe("SQL");
    expect(await page.$eval(".cm-warnMarker", (el) => (el as HTMLElement).title)).toContain("coaches isn't defined here");
    expect(await page.$$eval("#sheet [data-qualified-name]", (els) => els.length)).toBe(7);

    // Clicking a column row selects its line.
    const row = await (await page.$('#sheet [data-qualified-name="team_id"] rect'))!.boundingBox();
    await page.mouse.click(row!.x + row!.width / 2, row!.y + row!.height / 2);
    expect(await page.$eval("#status-cursor", (el) => el.textContent)).toMatch(/^Ln 7,/);
  });

  it("drags BPMN shapes and writes the positions into the XML", async () => {
    const saved = TEMPLATES.find((t) => t.id === "bpmn-saved-layout")!.code.replace("Review claim", "Review the claim");
    await openDiagram("bpmn", "Drag test", saved);
    const text = () => page.evaluate(() => document.querySelector(".cm-content")!.textContent ?? "");
    const shape = async () => (await (await page.$('#sheet [data-element-id="review"]'))!.boundingBox())!;

    // A click selects the element's line without moving anything.
    const start = await shape();
    await page.mouse.click(start.x + start.width / 2, start.y + start.height / 2);
    expect(await page.$eval("#status-cursor", (el) => el.textContent)).toMatch(/^Ln 9,/);
    expect(await text()).toContain('<dc:Bounds x="240" y="80" width="100" height="80" />');

    // A drag moves the task; its flows get right-angled routes.
    const a = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(a.x, a.y + i * 12);
    await page.mouse.up();
    await page.waitForFunction(() => !(document.querySelector(".cm-content")!.textContent ?? "").includes('<dc:Bounds x="240" y="80"'));
    const moved = (await text()).match(/<dc:Bounds x="240" y="(\d+)" width="100" height="80" \/>/);
    expect(Number(moved![1])).toBeGreaterThan(110);
    expect(await text()).toMatch(/<di:waypoint x="188" y="120" \/><di:waypoint x="214" y="120" \/>/);

    // Undo from the diagram puts it back.
    await page.keyboard.down("Control");
    await page.keyboard.press("z");
    await page.keyboard.up("Control");
    await page.waitForFunction(() => (document.querySelector(".cm-content")!.textContent ?? "").includes('<dc:Bounds x="240" y="80"'));
  });

  it("renames, adds and removes from the diagram in text languages", async () => {
    const text = () => page.evaluate(() => document.querySelector(".cm-content")!.textContent ?? "");
    const settle = (re: RegExp) => page.waitForFunction((src) => new RegExp(src).test(document.querySelector(".cm-content")!.textContent ?? ""), {}, re.source);
    const doubleClick = async (selector: string) => {
      const b = (await (await page.$(selector))!.boundingBox())!;
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      await page.waitForSelector(".pe-input");
    };
    const typeIn = async (value: string) => {
      await page.keyboard.down("Control");
      await page.keyboard.press("a");
      await page.keyboard.up("Control");
      await page.keyboard.type(value);
      await page.keyboard.press("Enter");
    };

    // Org chart: rename, add a report, remove.
    await openDiagram("orgchart", "Edit org", "orgchart\nPat Boss: Owner\n  Sam Lead: Manager\n  Kim Ops: Operations\n");
    await doubleClick('#sheet [data-qualified-name="Sam Lead"] rect');
    expect(await page.$eval(".pe-input", (el) => (el as HTMLTextAreaElement).value)).toBe("Sam Lead: Manager");
    await typeIn("Sam Lee: Head of Sales");
    await settle(/Sam Lee: Head of Sales/);
    await page.keyboard.press("Insert");
    await page.waitForSelector(".pe-input");
    await typeIn("Rae New: Sales Rep");
    await settle(/ {4}Rae New: Sales Rep/);
    const kim = (await (await page.$('#sheet [data-qualified-name="Kim Ops"] rect'))!.boundingBox())!;
    await page.mouse.click(kim.x + kim.width / 2, kim.y + kim.height / 2);
    await page.waitForSelector(".pe-bar:not([hidden])");
    await page.keyboard.press("Delete");
    await page.waitForFunction(() => !(document.querySelector(".cm-content")!.textContent ?? "").includes("Kim Ops"));

    // Network: rename a device.
    await openDiagram("network", "Edit net", 'network\nrouter edgert "Edge"\nswitch coresw\nedgert -- coresw\n');
    await doubleClick('#sheet [data-qualified-name="coresw"] rect');
    await typeIn("Core switch");
    await settle(/switch coresw "Core switch"/);

    // Graphviz and Mermaid flowcharts: rename a node.
    await openDiagram("graphviz", "Edit dot", "digraph { node [shape=box]; first -> second }");
    await doubleClick("#sheet g.node:nth-of-type(2)");
    await typeIn("Second step");
    await settle(/second \[label="Second step"\]/);
    await openDiagram("mermaid", "Edit mmd", "flowchart LR\n  P1[Plan] --> P2[Build]\n");
    await doubleClick("#sheet g.node");
    await typeIn("Plan it");
    await settle(/P1\[Plan it\]/);
    expect(await text()).toContain("P2[Build]");
  });

  it("hides the drawing tools for other languages", async () => {
    await openDiagram("plantuml", "No tools", "@startuml\nTools -> Hidden\n@enduml");
    expect(await page.$eval(".sketch-tools", (el) => (el as HTMLElement).hidden)).toBe(true);
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

  it("opens the About box from the help menu with GitHub and licence links", async () => {
    await page.click("#btn-help");
    await page.waitForSelector(".popover .help-menu");
    const items = await page.$$eval(".popover .menu-list [role=menuitem]", (els) => els.map((e) => e.textContent?.trim()));
    expect(items).toEqual(["Help and shortcuts", "About Figvex", "Source code on GitHub", "Report a problem"]);
    const about = await page.$$(".popover .menu-list button");
    await about[1].click();
    await page.waitForSelector("dialog.about[open]");
    const links = await page.$$eval("dialog.about a", (els) => els.map((e) => (e as HTMLAnchorElement).href));
    expect(links).toContain("https://github.com/ahmed-imraan-ai/figvex");
    expect(links).toContain("https://github.com/ahmed-imraan-ai/figvex/blob/main/LICENSE");
    expect(links.some((l) => l.endsWith("/third-party-licenses.txt"))).toBe(true);
    await page.keyboard.press("Escape");
  });

  it("serves SEO files and tags", async () => {
    const robots = await (await fetch(`${BASE}robots.txt`)).text();
    expect(robots).toContain("Sitemap:");
    const sitemap = await (await fetch(`${BASE}sitemap.xml`)).text();
    expect(sitemap).toContain("<urlset");
    expect((await fetch(`${BASE}og-image.png`)).headers.get("content-type")).toContain("image/png");
    const html = await (await fetch(BASE)).text();
    expect(html).toContain('rel="canonical"');
    expect(html).toContain('"@type": "WebApplication"');
    expect(html).not.toContain("%SITE_URL%");
  });

  it("collapses the library to a rail of recent diagrams instead of hiding it", async () => {
    await openDiagram("plantuml", "Rail A", "@startuml\nA -> B\n@enduml");
    await openDiagram("graphviz", "Rail B", "digraph { a -> b }");
    expect(await page.$eval("#library", (el) => (el as HTMLElement).dataset.open)).toBe("false");
    const rail = await page.$eval(".library-rail", (el) => el.getBoundingClientRect().width);
    expect(rail).toBeGreaterThan(30);
    const tiles = await page.$$eval(".rail-doc", (els) => els.map((e) => [e.textContent, e.getAttribute("aria-current")]));
    expect(tiles[0]).toEqual(["RB", "true"]);
    expect(tiles[1]).toEqual(["RA", "false"]);

    await (await page.$$(".rail-doc"))[1].click();
    await page.waitForFunction(() => (document.getElementById("doc-title") as HTMLInputElement).value === "Rail A");

    await page.click("#btn-library");
    expect(await page.$eval(".library-panel", (el) => el.getBoundingClientRect().width)).toBeGreaterThan(200);
    await page.click(".library-head button[aria-label='Collapse']");
    expect(await page.$eval("#library", (el) => (el as HTMLElement).dataset.open)).toBe("false");
  });

  it("names the diagram's language and fits the editor head on a phone screen", async () => {
    await openDiagram("graphviz", "Label test", "digraph { a -> b }");
    expect(await page.$eval("#lang-input", (el) => (el as HTMLInputElement).value)).toBe("Graphviz");
    await page.setViewport({ width: 375, height: 740 });
    const fits = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth <= innerWidth,
      select: document.getElementById("style-select")!.getBoundingClientRect().width >= 100,
    }));
    await page.setViewport({ width: 1400, height: 900 });
    expect(fits).toEqual({ page: true, select: true });
  });

  it("changes language from the picker without overwriting a diagram", async () => {
    await openDiagram("mermaid", "Picker real", "flowchart LR\n  pickerA --> pickerB\n");
    const title = () => page.$eval("#doc-title", (el) => (el as HTMLInputElement).value);
    const lang = () => page.$eval("#lang-input", (el) => (el as HTMLInputElement).value);
    const pick = async (query: string) => {
      await page.click("#lang-input");
      await page.keyboard.type(query);
      await page.keyboard.press("Enter");
    };

    // Real content: a new diagram is started and the old one is kept.
    await pick("dot");
    await page.waitForFunction(() => (document.getElementById("lang-input") as HTMLInputElement).value === "Graphviz");
    expect(await title()).not.toBe("Picker real");
    expect(await page.$eval("#toasts", (el) => el.textContent)).toContain('"Picker real" is still in your library');
    const fresh = await title();

    // Starter code: the language changes in place.
    await pick("csv");
    await page.waitForFunction(() => (document.getElementById("lang-input") as HTMLInputElement).value === "ECharts");
    expect(await title()).toBe(fresh);
    expect(await page.evaluate(() => document.querySelector(".cm-content")!.textContent)).toMatch(/^\{/);

    // Escape leaves things as they were.
    await page.click("#lang-input");
    await page.keyboard.type("bpmn");
    await page.keyboard.press("Escape");
    expect(await lang()).toBe("ECharts");
  });

  it("throws no uncaught page errors", () => {
    expect(pageErrors).toEqual([]);
  });
});
