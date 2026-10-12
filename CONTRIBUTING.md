# Contributing

Bug reports, templates and code are all welcome.

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report problems to [report@sudo520.com](mailto:report@sudo520.com).

## Reporting a bug

Open an issue with:

- the diagram source that shows the problem (a share link works too)
- what you expected and what you got
- your browser and operating system

If PlantUML itself draws something wrong, check whether the Java release does the same. If it does, the bug belongs in [plantuml/plantuml](https://github.com/plantuml/plantuml/issues). Mermaid bugs go to [mermaid-js/mermaid](https://github.com/mermaid-js/mermaid/issues).

## Branches and releases

| Branch | Deployed to | Used for |
| --- | --- | --- |
| `dev` | nowhere | Day-to-day work. Feature branches start here and merge back here. |
| `staging` | `staging--<site>.netlify.app` | Testing a release on Netlify before it goes live. |
| `main` | the live site | Releases only. |

Changes move one way: `dev` to `staging` to `main`. `main` and `staging` are protected: they only accept pull requests, CI (`test` and `docker`) has to pass, and force-pushes and deletions are blocked. This applies to admins too. Commit directly to `dev` or to a feature branch.

```sh
# Work
git switch dev
git switch -c my-change        # optional feature branch
# ...commit...
git switch dev && git merge my-change && git push

# Send to staging for testing
gh pr create --base staging --head dev --title "chore(release): promote dev to staging"
gh pr merge --merge            # after CI passes

# Release after staging looks right
gh pr create --base main --head staging --title "chore(release): promote staging to main"
gh pr merge --merge

# Bring dev up to date with the release
git switch dev && git pull && git merge origin/main && git push
```

Use **Create a merge commit** for these pull requests. Each merge into `main` is a production deploy and costs Netlify credits, so release in batches. The staging site shows a STAGING label in the header and asks search engines not to index it.

CI runs the type check, unit tests, build, browser tests and Docker build on every push to these branches and on pull requests into `staging` and `main`.

## Commit messages

Commits follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types**

| Type | Use for |
| --- | --- |
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `style` | Formatting with no change in behaviour |
| `refactor` | Code changes that neither fix a bug nor add a feature |
| `perf` | Performance improvements |
| `test` | Adding or fixing tests |
| `build` | Build scripts, dependencies, Docker |
| `ci` | GitHub Actions and other CI configuration |
| `chore` | Maintenance that fits none of the above |
| `revert` | Reverting an earlier commit |

**Scopes** are optional and name the part of Figvex that changed: `editor`, `preview`, `plantuml`, `mermaid`, `export`, `share`, `templates`, `library`, `ui`, `store`, `deps`, `docker`, `netlify`.

**Rules**

- Write the description in the imperative and in lower case, with no full stop: "add PNG scale option", not "Added PNG scale options."
- Keep the first line under 72 characters. Use the body to explain why, when that isn't obvious.
- Mark a breaking change with `!` before the colon, a `BREAKING CHANGE:` footer, or both. For Figvex that means anything that breaks saved diagrams, share links or the documented configuration.
- Reference issues in the footer: `Fixes #12`.

**Examples**

```
feat(export): add WEBP export
fix(plantuml): map error lines correctly when a style is applied
docs: explain the staging branch in CONTRIBUTING
build(deps): update @plantuml/core to 1.2026.9
ci: run browser tests on pull requests into staging
feat(share)!: compress share links with a new format

BREAKING CHANGE: links created before this release no longer open.
```

Pull request titles follow the same format, since they often become the merge commit message.

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
