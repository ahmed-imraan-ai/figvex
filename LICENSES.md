# Licences

## Figvex

Figvex is released under the MIT licence. See [LICENSE](LICENSE).

Diagrams you make with Figvex are yours. Figvex's licence doesn't cover your diagram source or the images exported from it. PlantUML's licence says the same about images it generates, with one exception: if the diagram text is itself under a licence, the images are too.

## What the site ships

The build bundles 155 open-source packages. `scripts/collect-licenses.mjs` runs during every build and writes `third-party-licenses.txt` with each package's name, version, licence and full licence text. The deployed site serves it at `/third-party-licenses.txt`, linked from the Help dialog. Run `npm run licenses` to regenerate it.

At the time of writing:

| Licence | Packages |
| --- | --- |
| MIT | 103 |
| ISC | 33 |
| Apache-2.0 | 6 |
| BSD-3-Clause | 6 |
| SIL OFL 1.1 (IBM Plex fonts) | 2 |
| MPL-2.0 or Apache-2.0 (DOMPurify) | 1 |
| EPL-2.0 (elkjs) | 1 |
| MIT and Zlib | 1 |
| MIT, with an extra "feel free" note (rgbcolor) | 1 |
| Unlicense | 1 |

The main components:

| Component | Licence | Notes |
| --- | --- | --- |
| PlantUML (`@plantuml/core`) | MIT | MIT from version 1.2026.6; earlier versions were GPL-3.0-or-later |
| Viz.js, inside the PlantUML package | MIT | |
| Graphviz, inside Viz.js | EPL-2.0 | Shipped in object code form; source at gitlab.com/graphviz/graphviz |
| Expat, inside Viz.js | MIT | |
| Twemoji graphics, inside the PlantUML package | CC-BY 4.0 | Needs attribution; given in `third-party-licenses.txt` |
| Open Iconic, inside the PlantUML package | MIT | |
| PlantUML themes, inside the PlantUML package | MIT | By Brett Schwarz |
| Mermaid | MIT | |
| ELK layout (`elkjs`), used by Mermaid | EPL-2.0 | Source at github.com/kieler/elkjs |
| CodeMirror | MIT | |
| DOMPurify | MPL-2.0 or Apache-2.0 | |
| jsPDF, svg2pdf.js | MIT | |
| IBM Plex Sans and Mono | SIL OFL 1.1 | |

EPL-2.0 lets Graphviz and ELK ship inside an MIT project. The EPL-2.0 parts stay under EPL-2.0, and their source is available at the addresses above.

## PlantUML standard library

`!include <...>` libraries come in bundles, and each bundle declares its own licence. The build only serves a bundle from this site when it declares a permissive licence (MIT, Apache-2.0, BSD, ISC, CC0 or Unlicense). Today that's C4, ArchiMate and DomainStory, all MIT.

Every other bundle still works. The browser loads it from the official PlantUML host (`plantuml.github.io`) when a diagram includes it, so Figvex doesn't redistribute it. At the time of writing, AdaML declares GPL and twelve others declare no licence, so they stay on the official host.

## Services contacted at runtime

| Service | When | Terms |
| --- | --- | --- |
| plantuml.github.io | A diagram includes a stdlib bundle the site doesn't serve | Each bundle's own licence |
| plantuml.com | Only if the user turns on the PlantUML server option, or copies an image link | PlantUML's server terms |

## Dependency policy

New dependencies must be usable in production for free, with no watermark, licence key or non-commercial clause. See the licence policy in [ROADMAP.md](ROADMAP.md#licence-policy).

## Why MIT

- Both engines Figvex is built on, PlantUML and Mermaid, are MIT, as are most of its dependencies.
- Figvex ships EPL-2.0 code: Graphviz inside PlantUML, and ELK inside Mermaid. The Free Software Foundation states that EPL-2.0 without a GPL "secondary license" designation "remains incompatible with the GPL", and the licence files of both projects leave that designation blank. A GPL or AGPL Figvex would need to drop or replace those parts.
- MIT lets schools, students and companies host, embed and change Figvex with few conditions.
- MIT code can later be included in a GPL project, but GPL code can't later be released as MIT without every contributor's agreement.

This is the project's reasoning, not legal advice.
