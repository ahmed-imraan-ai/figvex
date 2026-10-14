# Roadmap

Figvex started with PlantUML and Mermaid, and now also draws Graphviz DOT, BPMN, network diagrams, ER diagrams from SQL, boolean logic, automata, timing diagrams, data structures, org charts, data charts and freeform sketches. The plan is to add more kinds of diagram and chart behind the same editor, preview, export and sharing. The work is split into three phases. Items within a phase aren't in a fixed order.

## Done

- **Graphviz.** DOT written directly, with every Graphviz layout engine, templates, syntax colouring and completions. It uses the Viz.js build that ships with PlantUML, so it added no dependency. PlantUML's `@startdot` blocks use it too.
- **Data charts.** Apache ECharts (Apache 2.0), chosen over Plotly because it renders straight to an SVG string and bundles only the chart types used. Charts are ECharts options in JSON, with CSV data under a `---` line or opened from a `.csv` file.
- **BPMN.** Our own renderer, written from the OMG BPMN 2.0 specification, so there's no watermark and no new dependency. It draws files from modelling tools with their saved positions, and lays out files without them using Graphviz, with pools and lanes as bands. Owning the renderer leaves the way open for visual editing.
- **Freeform diagrams.** A sketch canvas built in-house rather than on Excalidraw, so there's no React and nothing extra to download. Boxes, ellipses, diamonds, text, arrows that stay attached to shapes, and a pen, in a clean or hand-drawn style. Sketches are stored as text, one element per line, so saving, sharing, export and undo work as for every other type. The canvas is also the start of visual editing. It has a connector tool for right-angle lines, connection points on each side of a shape, alignment guides, box-select, and align and distribute.
- **Org charts.** Written as an indented list of people and laid out as a tidy tree by our own layout: departments with colours and a legend, assistants, vacant posts, dotted-line reporting, team sizes, a compact layout, top-down or left-to-right, and three card styles.
- **Complex networking.** A network language with 18 device icons, zones for subnets, VLANs and sites that nest, port names, cable, trunk, VPN and wireless links, and straight, curved or right-angled lines. Graphviz does the layout; the icons and drawing are ours. IPv4 and IPv6 addresses are checked as you type: addresses outside their subnet, duplicates, network and broadcast addresses, overlapping subnets and VLAN clashes.
- **Visual editing.** Changes made in the diagram are written back to the text, so undo, saving and sharing behave as for typing. BPMN shapes can be dragged, with alignment guides, right-angled rerouting of flows, lane changes, and positions added to files that had none. Org charts and networks can be built from the diagram: rename, add a report or a linked device, and remove. Graphviz nodes and Mermaid flowchart nodes can be renamed. Sketches are drawn on a canvas. Between them, a diagram can be made without writing code.
- **Complex data models (phase 2).** ER diagrams drawn from SQL DDL, including whole PostgreSQL, MySQL, SQLite and SQL Server dumps. Foreign keys become crow's foot links between the columns, with cardinality taken from NOT NULL and unique constraints. `-- group:` comments box tables by area (or by schema), `-- focus:` draws one part of the model, and a keys-only style keeps large schemas readable. Missing tables and columns are marked as you type.
- **Coursework tools (phase 2).** Boolean logic: truth tables, Karnaugh maps with their groups, minimal sum of products and product of sums (Quine–McCluskey), equivalence checks and gate circuits in ANSI or IEC symbols. Automata: DFAs, NFAs with ε moves and Turing machines from their transitions, with each input run through the machine and a step-through on the diagram. Timing diagrams, register fields and logic with WaveDrom (MIT). Data structure pictures: arrays with pointers, stacks, queues, linked lists, trees, binary search trees, heaps, hash tables and graphs.

## How new types fit in

Each language is an engine in `src/engines/`. An engine takes source text and returns SVG, or an error with a line number. Adding a text-based type means:

- a new engine module, and an entry in the `Engine` type in `src/engines/types.ts`
- detection from the first line in `src/engines/detect.ts`
- syntax colouring in `src/editor/languages.ts` and completions in `src/editor/completions.ts`
- templates in `src/templates/`

Export works from SVG. ECharts and Plotly can both render to SVG, so charts fit the current export. Items that aren't text turned into SVG (freeform drawing, visual editing, maps, CAD, 3D) need their own preview, storage and export, and will be separate modes.

## Licence policy

Every dependency must be usable in production for free, with no watermark, licence key or non-commercial clause. Notices that a licence requires (copyright lines, licence files, data credits) are kept.

What this ruled out while planning:

| Library | Condition | Instead |
| --- | --- | --- |
| bpmn-js | The bpmn.io watermark must stay on rendered diagrams | Own renderer from the BPMN 2.0 specification (built) |
| tldraw | Production use needs a licence key; the free hobby licence requires a "made with tldraw" watermark | Excalidraw (MIT) or own canvas |

When a library's licence doesn't fit, we implement the feature ourselves from public material: the open standard, published file formats and the library's user documentation. We don't copy or translate its source, and we don't remove or work around licence conditions in code we use. For a full clean-room reimplementation, the person writing the code must not have read the original source, and the process should be written down. AI-generated code doesn't meet that bar for well-known open-source projects, because the model may have seen their source. For standards such as BPMN 2.0 this isn't an issue, since the specification is the source.

This is a project policy, not legal advice.

## Phase 1

Done. See above.

## Phase 2

- **Statistical charts.** Box plots and histograms computed from raw data rather than summaries, scatter plots with trend lines, and distributions, built on the chart engine.
- **UI wireframes.** Salt once the PlantUML browser build includes it, and a wireframe mode with common controls.
- **Network diagrams.** Physical views (racks, floor plans and cabling) alongside the logical network language, and import from a device list.
- **Advanced UML.** The UML diagrams PlantUML and Mermaid cover poorly or not at all, such as composite structure, communication and interaction overview diagrams, and checks for common modelling mistakes.
- **Cloud infrastructure.** AWS, Azure, GCP and Kubernetes diagrams with official icons. PlantUML's standard library already has these icon sets; the work is templates, icon search and layout.
- **Complex data models.** Done (see above).
- **More text languages.** D2 and nomnoml, for people coming from those tools.
- **Coursework tools.** Done (see above).

## Phase 3

- **Advanced scientific charts.** Heatmaps, contour plots, error bars and log scales.
- **Financial charts.** Candlestick and OHLC charts with volume and indicators.
- **Geographic maps.** Choropleth and point maps from data. Boundaries from Natural Earth, which is public domain and needs no credit. OpenStreetMap tiles, if used, require the "© OpenStreetMap contributors" credit on the map; that credit stays.
- **CAD.** Precise 2D drawings with dimensions and constraints.
- **3D.** Models and scenes viewed in the browser, and 3D plots.
- **Electrical schematics.** Circuits drawn with standard component symbols.
- **Formal process models.** Petri nets and similar models, with a step-through of how tokens move.
- **Interactive visual analytics.** Dashboards that link several charts, with filtering and zoom across the same data.

## AI assistance (through MCP)

Figvex will have no AI account of its own and no login. People use the assistant and subscription they already have, such as Claude Code or Claude Desktop, and that assistant uses Figvex through an MCP server. MCP is the only way in: no API keys in the browser and no agent SDK integration.

This is also how existing subscriptions stay allowed. Anthropic's Agent SDK documentation says: "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products." With MCP, the user's own Claude app does the signing in and Figvex never touches it.

### What it will do

- Draw from a description: "sequence diagram of OAuth login" becomes PlantUML or Mermaid.
- Fix the current error.
- Explain a diagram line by line, for revision.
- Convert between PlantUML and Mermaid.
- Generate from code: classes to a class diagram, SQL DDL to an ER diagram, routes to a sequence diagram.
- Review a diagram against UML rules, such as missing multiplicities or actors with no use case.

Changes arrive as a diff the user accepts. Nothing is overwritten without a click, and undo works as usual.

### The MCP server

`figvex-mcp` is an npm package that runs on the user's computer. [`@plantuml/mcp-js`](https://www.npmjs.com/package/@plantuml/mcp-js) (MIT) already runs the PlantUML engine in Node and is the starting point.

Setup, using each app's documented format:

```sh
# Claude Code
claude mcp add figvex -- npx -y figvex-mcp
```

```json
// Claude Desktop: claude_desktop_config.json
// macOS: ~/Library/Application Support/Claude/  Windows: %APPDATA%\Claude\
{
  "mcpServers": {
    "figvex": { "command": "npx", "args": ["-y", "figvex-mcp"] }
  }
}
```

Tools: `render` (returns the image, or the error and its line, so the assistant can check its own work), `validate`, `convert`, `list_templates`, `read_link`, and the live-mode tools below.

### Connecting without a login

There are no accounts, so something else has to link the assistant to the user's diagrams. Figvex's share links already carry a whole diagram inside the URL, so they're the base. Three levels, built in this order:

**1. Links, both ways.** No setup and nothing stored.

- Assistant to Figvex: every tool that produces a diagram also returns a Figvex link. Clicking it opens the diagram and saves it to the user's library. This part works today.
- Figvex to assistant: a "Send to assistant" button copies the link. The user pastes it into the chat and `read_link` decodes it.
- Works with the hosted site and a local copy, in every browser.

**2. Live mode on the local copy.** `figvex-mcp` includes the built site and serves it at `http://localhost:<port>`, with a WebSocket between the page and the MCP server. The assistant can open diagrams in the page, read the one on screen and propose edits that appear as a diff.

- Why it runs its own copy: since Chrome 142, a public website reaching a program on the same computer triggers a permission prompt ([Chromium intent to ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/cwu_RUmBpzY)), and Safari blocks `ws://localhost` from HTTPS pages ([WebKit bug 173161](https://bugs.webkit.org/show_bug.cgi?id=173161)). A page served from localhost talking to localhost avoids both.
- Security: the server only accepts WebSocket connections from its own origin, checks the `Host` header against DNS rebinding, and puts a random token in the page URL on each launch.
- Catch: browser storage is per site, so diagrams saved in the local copy aren't in the hosted site's library. Moving them uses links, or the planned export and import.

**3. Live mode on the hosted site, with a pairing code.** For people using the Netlify site rather than a local copy.

- In Figvex, "Connect an assistant" creates a random session ID and an encryption key in the browser and shows them as a pairing code. The user gives the code to their assistant ("connect to Figvex AB12-CD34-...").
- Both sides talk to a small relay on Netlify Functions over normal HTTPS, which the browser rules above don't restrict. Messages are kept briefly in Netlify Blobs.
- The page polls every few seconds while connected, because a serverless function can't hold a stream open (Netlify's own MCP guide makes the same point).
- The pairing code is the only credential, like a share link. Diagrams are encrypted in the browser and in `figvex-mcp` with the key from the code, so the relay only stores ciphertext.
- Sessions end after a period of inactivity and the relay deletes them. Blobs has no built-in expiry, so the relay does this itself.
- Requests are rate limited per IP. Netlify supports rate-limiting rules in code on every plan.
- Cost estimate: polling every 3 seconds is about 1,200 requests per connected hour, roughly 0.24 credits for requests plus about 0.17 for compute if each call takes around 50 ms at 1024 MB. Netlify's pricing page doesn't list Blobs storage, so check its cost before building.

### Later

- A hosted MCP endpoint as a remote connector, for claude.ai on the web and the mobile apps. Anthropic's help centre says custom connectors are available on Free, Pro, Max, Team and Enterprise plans (Free users get one), and "No sign in" is an allowed authentication setting. Mermaid needs a browser to draw, so a hosted server returns Mermaid source and a link instead of an image.
- Other MCP-capable assistants, after checking each provider's terms. ChatGPT only connects to remote HTTPS servers, and sources disagree on which ChatGPT plans can add custom connectors.

### Rules

- Off by default. Nothing reaches an assistant until the user connects one.
- Only the diagram being worked on is shared, never the rest of the library.
- No diagram is stored on a server except in a live session, encrypted, until it ends.

## Hosting costs on Netlify

Measured and checked against Netlify's pricing page and docs (October 2026):

- The free plan has a 300-credit limit. A production deploy costs 15 credits, bandwidth 20 credits per GB, function compute 10 credits per GB-hour and web requests 2 credits per 10,000.
- A first visit downloads about 1.9 MB compressed (PlantUML engine, Graphviz, app and fonts). Returning visitors load the engine from cache.
- Functions get 1024 MB of memory and 60 seconds per request, which is enough for an MCP server rendering PlantUML.
- Deploys use up the free plan fastest: 20 production deploys use all 300 credits. Deploy releases, not every commit.
- Netlify's [Open Source plan](https://www.netlify.com/legal/open-source-policy/) gives 10,000 credits a month, free production deploys, and keeps sites up when credits run out. It needs an open-source licence (MIT), a Code of Conduct ([CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)), a "This site is powered by Netlify" link (in the status bar, on Netlify builds only) and a non-commercial project. Figvex meets all four.

## Other planned work

- Offline support as an installable web app.
- Import from plantuml.com and mermaid.live links.
- Diagrams with several pages (`newpage`) shown as pages.
- Export all saved diagrams as a zip, and import them back.
- The missing PlantUML types (Salt, ditaa, nwdiag and the rest) as they land in the browser build.
- Vim and Emacs key bindings.
- Translations of the interface.

## Suggesting something

Open an issue with the diagram or chart type, an example of what you'd draw, and the course or job it's for. Pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).
