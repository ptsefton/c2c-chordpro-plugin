# c2c-chordpro-plugin

An input-mode plugin for [chaos2crate](https://github.com/Language-Research-Technology/chaos2crate):
turns a folder of [ChordPro](https://www.chordpro.org/) song charts and Markdown setlists into
an RO-Crate, then renders that crate into `songbook.html` — a standalone, interactive,
printable songbook page (song list, transposition, chord diagrams, setlists, print mode) that
needs no server and no build step to open.

See [`src/chordpro-input/SPEC.md`](src/chordpro-input/SPEC.md) for the full design.

This is a standalone repo, not part of [`c2c-plugins`](https://github.com/Language-Research-Technology/c2c-plugins)
(chaos2crate's own bundled plugins) — extracted from `resources2crate`, the app chaos2crate
itself succeeded, when that project's plugins were split out of the core app. Kept separate
from `c2c-plugins` for the same reason [`chordprobook`](https://github.com/ptsefton/chordprobook-js)
is its own repo rather than living inside `resources2crate`/`chaos2crate`: this plugin is
specific to one person's own use case (ChordPro charts and setlists), not something every
chaos2crate deployment needs.

This package has **no runtime dependency on chaos2crate or `c2c-plugins`**. Every plugin
object here is a factory, `createPlugin(deps)`, called with whatever functions from the host
app's own core it needs — the same contract every `c2c-plugins` plugin follows (see that
repo's own README for the contract in full, including why hook names are literal strings like
`"output:write"` rather than an imported constant).

## Consuming this package

Check it out as a sibling to `chaos2crate` and `c2c-plugins`. `chordprobook` is a `github:`
dependency of this repo (see "Setup for local development" below for working against a local
checkout of it instead), so it does not need to be a sibling too:

```
some-folder/
  chaos2crate/
  c2c-plugins/
  c2c-chordpro-plugin/   (this repo)
```

Add it as a `file:` dependency in chaos2crate's own `package.json`:

```json
"c2c-chordpro-plugin": "file:../c2c-chordpro-plugin"
```

then run `npm install` in both `c2c-chordpro-plugin` (this repo — it has its own
`node_modules`, needed because Node resolves a `file:`-linked package's own dependencies from
its real path, not the consuming app's `node_modules`) and `chaos2crate` itself.

Select it as the active input mode via chaos2crate's own `INPUT_PLUGINS` env var (see
`chaos2crate/scripts/select-plugins.mjs`'s own header comment for the full env var syntax):

```
INPUT_PLUGINS=chordpro=c2c-chordpro-plugin npm run dev
```

To also drop every other bundled plugin except the minimum needed to write the crate itself,
combine it with `PLUGINS` — `ro-crate-json-output` (from `c2c-plugins`) plus this repo's own
`songbook_html.js`, which writes `songbook.html` and the `ro-crate-preview.html` redirect to
it (see `SPEC.md` §10):

```
PLUGINS=ro-crate-json-output,songbook=c2c-chordpro-plugin/src/chordpro-input/songbook_html.js \
INPUT_PLUGINS=chordpro=c2c-chordpro-plugin \
npm run dev
```

Both `index.js` (the input-mode plugin) and `songbook_html.js` (the additive output plugin)
must be selected for a chordpro build to actually produce a songbook — `index.js` alone only
builds the RO-Crate, with no songbook page written.

## Setup for local development

```
npm install
npm run generate:chordprobook-bundle   # regenerate after changing chordprobook itself
npm test
```

To work against a local checkout of `chordprobook` rather than the pinned `github:` dependency:

```
npm install ../chordprobook --no-save    # or: npm link ../chordprobook
npm run generate:chordprobook-bundle
```

`--no-save` keeps this repo's `package.json`/`package-lock.json` on the pinned commit; `npm ci`
restores it. See DEPLOY-SPEC.md §7 for why the bundle has to be regenerated after switching.

## Publishing to GitHub Pages

`npm run build:site` builds this repo into a publishable site, with no sibling checkouts
required:

- `/` — a landing page (rendered from [`index.md`](index.md))
- `/build/` — a chordpro-only chaos2crate app
- `/demo/` — a sample songbook rendered from `src/chordpro-input/samples/`
- `/chordpro-format.html` — [the ChordPro dialect this uses](docs/chordpro-format.md)

See [`DEPLOY-SPEC.md`](DEPLOY-SPEC.md) for the full design; `.github/workflows/pages.yml` runs
it on every push to `main`.

```
npm run build:site      # writes ./site
npm run preview:site    # serves ./site at http://localhost:4173
```

## Standalone CLI

`build-songbook.mjs` builds a songbook from a real folder on disk with no browser, no File
System Access API, and no host app involved at all — useful for quickly checking a chart
collection without running chaos2crate itself:

```
npm run build:songbook -- <folder>
```

## The `{st:}` cleanup tool

A one-off migration for chart collections that predate this project's own `{artist}`/
`{subtitle}` split — see `SPEC.md` §15. The Node CLI (`npm run fix:st-directive -- <folder>`)
is ready to use standalone; the browser-UI half (`fix_st_directive_ui.js`) is implemented but
not yet wired into any host app's own UI.
