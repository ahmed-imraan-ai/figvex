# Contributing

Bug reports, templates and code are all welcome.

## Reporting a bug

Open an issue with:

- the diagram source that shows the problem (a share link works too)
- what you expected and what you got
- your browser and operating system

If PlantUML itself draws something wrong, check whether the Java release does the same. If it does, the bug belongs in [plantuml/plantuml](https://github.com/plantuml/plantuml/issues). Mermaid bugs go to [mermaid-js/mermaid](https://github.com/mermaid-js/mermaid/issues).

## Setting up

```sh
npm install
npm run dev
```

Before opening a pull request:

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The browser tests need Chrome. Set `CHROME_PATH` if it isn't found.

## Adding a template

Templates live in `src/templates/plantuml.ts` and `src/templates/mermaid.ts`. Each one needs an `id`, a `category` from `CATEGORIES` in `src/templates/index.ts`, a short `title`, a one-sentence `summary` and the `code`.

Good templates:

- show something a student would draw for a course, not "Alice talks to Bob"
- use real names and plausible data
- render without errors in the default style (the tests check this)
- stay short enough to read in the preview panel

The unit tests check that every template is detected as the right language and uses only PlantUML features the browser engine supports. The browser tests render each one.

## Code style

- TypeScript, no UI framework. DOM is built with the small `h()` helper in `src/lib/dom.ts`.
- Colours, spacing and fonts come from the CSS variables at the top of `src/styles.css`. Add a variable rather than a hard-coded colour, and give it a dark-mode value.
- Comments explain why, not what. Keep them short.
- UI text uses sentence case and British spelling, and says what will happen ("Open as new diagram", not "Submit").

## Adding a dependency

Check its licence first. It must be usable in production for free, with no watermark, licence key or non-commercial clause (see [LICENSES.md](LICENSES.md#dependency-policy)). `npm run licenses -- --summary` lists the licence of every production package, and the build regenerates `third-party-licenses.txt` on its own.

## Updating PlantUML or Mermaid

```sh
npm install @plantuml/core@<version> --save-exact
npm install mermaid@<version>
```

The install step copies the new engine into `public/vendor/plantuml/<version>/` and removes the old folder. Run the full test suite afterwards. If a diagram type moves into the PlantUML browser build, remove it from `UNSUPPORTED` in `src/engines/plantuml.ts` and from the list in the README.
