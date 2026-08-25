# Deployment spec

This document specifies how a static site is built and published from this repository:
a chordpro-only build of the [chaos2crate](https://github.com/Language-Research-Technology/chaos2crate)
app, plus a demo songbook, deployed to GitHub Pages.

The plugin itself is specified in [`src/chordpro-input/SPEC.md`](src/chordpro-input/SPEC.md).
Nothing here changes the plugin's behaviour or its API.

## 1. Requirements

R1. `npm run build:site` produces a publishable directory from a fresh clone of this
repository. No sibling checkouts, no manual configuration.

R2. `deploy.config.json`'s `appPath` (`build/`) is chaos2crate configured with this plugin's
input mode and the output plugins it needs (SPEC.md §3, §10). Generic and docx input, and
xlsx and HTML crate rendering, are excluded from `INPUT_PLUGINS`/`PLUGINS` selection — the
mode dispatch (`pipeline.js`) and the Settings "Input type" dropdown only ever offer
`chordpro`.

This is narrower than excluding their code from the published bytes. chaos2crate's own
`main.js` has two unconditional `await import(...)` calls unrelated to input-mode selection —
one into `c2c-plugins/src/docx-input/docx_crate.js` (a subdirectory-handling helper, not
docx-specific processing), one into its own `default_profile.js` (the no-profile-detected
fallback) — so both still ship as separate, lazily-loaded chunks in `dist/assets/` (roughly
780 KB and 1.2 MB respectively, observed 2026-08-25). Neither loads unless the corresponding
code path actually runs, but the bytes are published either way. Removing them is a
chaos2crate core-app change, out of scope here and not part of
[issue #68](https://github.com/Language-Research-Technology/chaos2crate/issues/68)/
[PR #69](https://github.com/Language-Research-Technology/chaos2crate/pull/69) (§7a).

R3. `/demo/songbook.html` is a songbook rendered from `src/chordpro-input/samples/`.

R7. The site root (`index.html`) is a landing page — what this tool is, and links to the app
(`appPath`), the demo songbook, and any other page `deploy.config.json` lists — rendered from
a Markdown source committed to this repository, not generated content (§3a).

R4. The chaos2crate wrapper, `c2c-plugins` and `chordprobook` are fetched from GitHub at
pinned refs.

R5. The build writes only to its scratch directory and its output directory. It does not
modify the working tree, and it does not require or use a sibling checkout of anything.

R6. The same script can be run from a different repository, with this plugin as a dependency
rather than as the repository being built (§8).

The sibling layout in the README remains supported for development. It is not used by a
deployment.

## 2. Files added

| File | Purpose |
|---|---|
| `deploy.config.json` | pinned refs and site layout (§3) |
| `scripts/build-site.mjs` | the build script (§4) |
| `scripts/render-markdown.mjs` | the landing/docs-page Markdown renderer (§3a) |
| `index.md`, `docs/chordpro-format.md` | the landing page and one docs page's source (§3a) |
| `.github/workflows/pages.yml` | CI workflow (§6) |
| `.gitignore` | add `.site-build/` and `site/` |
| `package.json` | `chordprobook` moves to a `github:` dependency (§7); adds `build:site` and `preview:site` |

No plugin source file changes.

## 3. deploy.config.json

```jsonc
{
  "wrapper":  { "repo": "Language-Research-Technology/chaos2crate", "ref": "<tag or full SHA>" },
  "plugins":  { "repo": "Language-Research-Technology/c2c-plugins", "ref": "<tag or full SHA>" },

  // "self" builds the plugin from this working tree. See §8 for the alternative.
  "plugin": "self",

  // Passed to chaos2crate's scripts/select-plugins.mjs; see its header comment
  // for the env var syntax.
  "inputPlugins": "chordpro=c2c-chordpro-plugin",
  "additivePlugins": [
    "ro-crate-json-output",
    "songbook=c2c-chordpro-plugin/src/chordpro-input/songbook_html.js",
    "fixSt=c2c-chordpro-plugin/src/chordpro-input/fix_st_directive_action.js",
    "setlistMatch=c2c-chordpro-plugin/src/chordpro-input/setlist_match_action.js"
  ],

  // Each entry renders one folder to site/<path>/.
  "demo": [
    { "source": "src/chordpro-input/samples", "path": "demo" }
  ],

  // Where the built app lands, instead of the site root — §3a.
  "appPath": "build",

  // Rendered to site/index.html — §3a. Optional: a site with no landing
  // page configured gets no index.html of its own (the app would need to
  // be at appPath: "" — the site root — for that to make sense at all).
  "landing": { "source": "index.md", "path": "index.html" },

  // Any number of further Markdown pages, same {source, path} shape as
  // landing and demo — §3a.
  "pages": [
    { "source": "docs/chordpro-format.md", "path": "chordpro-format.html" }
  ],

  "outDir": "site"
}
```

`ref` may be a tag, a branch or a full SHA. Full SHAs are recommended for committed values;
branches are accepted so a `workflow_dispatch` run can test an upgrade without a commit.

chaos2crate and `c2c-plugins` are maintained elsewhere. Pinning means an upstream commit
cannot change what this site publishes; upgrading is a reviewable one-line diff.

## 3a. The landing page and appPath

R2/R7 need the app and the site root to be two different things. `appPath` moves the app's
build output from the site root to `site/<appPath>/` (§4.5's asset-path check keeps working
unchanged, since `vite.config.js`'s `base: "./"` makes chaos2crate's own `dist/index.html`
correct from any subpath, not just the root).

The site root itself, and any other page named in `pages`, comes from a plain Markdown file
committed to this repository — `index.md` at the repo root, `docs/chordpro-format.md` for the
one other page this deployment currently has — rendered by `scripts/render-markdown.mjs`, a
small, purpose-built Markdown-to-HTML converter (headings, paragraphs, links, bold/italic/
inline code, lists, fenced code blocks, pipe tables) rather than a real Markdown library: the
same restraint `songbook_html.js`'s own `renderNoteMarkdown` already applies, for the same
reason — every construct supported is one this repository's own docs actually use, not a
hypothetical future one. Each page is wrapped in a minimal, self-contained HTML shell (a
`<title>` taken from the Markdown's own first heading, and enough CSS to be readable in light
and dark) — no build step, no external assets, nothing else published depends on it existing.

Both `landing` and `pages` read their source directly from this repository's own working tree
(`repoRoot`, not the scratch workspace) — they're static content belonging to this plugin, not
anything built from chaos2crate, chordprobook, or a folder a user picks.

## 4. scripts/build-site.mjs

```
node scripts/build-site.mjs [--out site] [--work .site-build] [--clean] [--strict]
                            [--skip-tests] [--only app|demo]
npm run build:site -- [flags]
```

Requires Node, `git` and `npm`. No package dependencies. Each external command is logged
before it runs.

### 4.1 Scratch workspace

The build runs under `--work` (default `.site-build/`, gitignored), arranged as the siblings
chaos2crate's `package.json` expects:

```
.site-build/
  chaos2crate/            clone at wrapper.ref
  c2c-plugins/            clone at plugins.ref
  c2c-chordpro-plugin/    copy of this repository (§4.2)
```

A `file:../x` dependency requires `x` to be a real sibling directory, and `actions/checkout`
cannot write outside the workspace. chaos2crate's own `deploy.yml` handles this by checking
out every repository as a subdirectory of the workspace (see also chaos2crate SPEC.md §4.7a).
Here the script constructs the layout instead, so CI checks out this repository only.

Clones use `--depth 1` for a branch or tag, and fetch-then-checkout for a SHA. If `GH_TOKEN`
or `GITHUB_TOKEN` is set, it is used in the clone URL; otherwise clones are anonymous HTTPS.

`.site-build/.stamp.json` records the ref each clone is at. A re-run with unchanged refs
reuses the clones and their `node_modules`. `--clean` removes the workspace first.

### 4.2 Copying this repository

`c2c-chordpro-plugin/` is a copy, not a symlink. `.site-build/` is inside this repository, so
a symlink to the repository root would be a cycle.

Files are selected with `git ls-files --cached --others --exclude-standard`: tracked files
plus untracked files that are not ignored. Uncommitted edits are therefore included, and
`node_modules/`, `.git/` and `.site-build/` are not. In CI this is equivalent to HEAD.

### 4.3 Install

1. `npm ci` in `c2c-plugins/`.
2. `npm ci` in `c2c-chordpro-plugin/`. This installs the `chordprobook` commit recorded in
   this repository's lockfile (§7).
3. Read that commit from the lockfile and pin it in the wrapper:
   `npm pkg set overrides.chordprobook=github:ptsefton/chordprobook-js#<sha>` in
   `chaos2crate/package.json`.
4. `npm install` in `chaos2crate/`.

Step 3 exists because a built site contains two copies of `chordprobook`, which must be the
same commit:

- Vite bundles the copy under `chaos2crate/node_modules`. chaos2crate's `vite.config.js` sets
  `preserveSymlinks: true`, so a bare specifier inside the linked plugin resolves from the
  plugin's apparent location under the wrapper's `node_modules`, not from the plugin
  directory itself.
- `generated/chordprobook_browser_bundle.js` is generated from
  `c2c-chordpro-plugin/node_modules/chordprobook` and embedded in `songbook.html`
  (SPEC.md §10).

Resolved independently, a `#main` dependency spec can yield two different commits in one
build. The override makes the wrapper follow this repository's lockfile.

Step 4 uses `npm install` rather than `npm ci` for two reasons. The `overrides` edit
invalidates the lockfile. More generally, a lockfile records the declared dependencies of any
`file:` linked package, so chaos2crate's committed lockfile describes this plugin's
dependencies as they were when it was last generated upstream; the change in §7 makes it
stale, and `npm ci` fails on that. Reproducibility rests on the pinned refs in §3 and the
`chordprobook` override, not on the wrapper's lockfile.

### 4.4 Regenerate the browser bundle

Run `npm run generate:chordprobook-bundle` in the plugin copy and compare the result with the
committed `src/chordpro-input/generated/chordprobook_browser_bundle.js`.

The committed bundle is generated manually (SPEC.md §10), so it can fall behind the
`chordprobook` commit this repository depends on. The site build regenerates it in the
scratch copy, so the published page always matches the pinned commit. A difference is
reported as a warning, or under `--strict` as an error asking for
`npm run generate:chordprobook-bundle` to be run and the result committed.

### 4.5 Build the app

In `chaos2crate/`:

```
PLUGINS=<additivePlugins, comma-joined>  INPUT_PLUGINS=<inputPlugins>  npm run build
```

chaos2crate has a `build:chordpro` script that does the same thing, but it is a convenience
in a repository maintained elsewhere. Setting the environment variables here keeps the plugin
selection in `deploy.config.json` alongside the refs it applies to.

Setting both variables also bypasses chaos2crate's `.plugins-selection.json` memory (see
`select-plugins.mjs`), so a deployment cannot inherit a selection left by an earlier run in
the same checkout.

chaos2crate's `vite.config.js` sets `base: "./"`, so `dist/` works from a project Pages
subpath (`https://<user>.github.io/<repo>/`) without an override. The script checks that asset
URLs in the built `index.html` are relative, and fails under `--strict` if they are not. An
upstream change to `base` would otherwise publish a page whose assets 404.

`dist/` is copied to `<outDir>/<appPath>/` (§3a) — `<outDir>/` directly if `appPath` is unset
or empty.

### 4.6 Build the demo songbook

For each `demo` entry, run the standalone CLI (SPEC.md §10) against the source folder in the
scratch copy:

```
node src/chordpro-input/build-songbook.mjs <copy>/<source>
```

`build-songbook.mjs` writes `songbook.html` and `ro-crate-metadata.json` into the folder it is
given. Running it against the copy satisfies R5 and leaves the committed
`samples/songbook.html` fixture untouched.

Copied to `<outDir>/<path>/`: `songbook.html`, `ro-crate-metadata.json`, and the source
`.cho.txt` and `.setlist.md` files, so the demo also serves as an example source folder. An
`index.html` containing a meta refresh to `songbook.html` is written so `/demo/` resolves.

### 4.7 Output

Write `<outDir>/.nojekyll`. Print the output tree with file sizes, including
`songbook.html`, whose size scales with the collection: every song's full text is embedded
in it (SPEC.md §10).

### 4.8 Local preview

`npm run preview:site` serves `<outDir>` over HTTP. The songbook page opens from `file://`
(SPEC.md §10), but the app at the site root is a Vite build whose entry point is a module
script, which browsers refuse to load over `file://`.

## 5. Constraints

C1. The build writes only to `--work` and `--out`, both gitignored (R5).

C2. `npm pkg set` in §4.3 edits a clone under `.site-build/`. No checkout outside the scratch
directory is modified, and nothing is pushed.

C3. `chordprobook` is not required to be published on npm (§7).

## 6. .github/workflows/pages.yml

```yaml
on:
  push:      { branches: [main] }
  workflow_dispatch:
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: false }
```

Build job:

1. `actions/checkout@v4`, this repository only, at the workspace root.
2. `actions/setup-node@v4`, Node 20 (as in chaos2crate's workflow), `cache: npm`.
3. `npm ci`.
4. `npm test` (SPEC.md §8). `--skip-tests` is for local iteration; CI does not use it.
5. `node scripts/build-site.mjs --strict`.
6. `actions/upload-pages-artifact@v3` with `path: site`.

Deploy job: `actions/deploy-pages@v4` under the `github-pages` environment.

Repository setting, applied once by hand: Settings → Pages → Build and deployment → Source:
**GitHub Actions**. Without it the workflow succeeds and publishes nothing.

A `schedule:` trigger could be added once the site is in use, so that an upstream upgrade
already committed to `deploy.config.json` is rebuilt without a push. Omitted by default: with
pinned refs, a scheduled build of unchanged inputs produces the same site.

## 7. The chordprobook dependency

Current: `"chordprobook": "file:../chordprobook"`. A fresh clone cannot be installed, which
blocks R1 and R4.

Change to:

```json
"chordprobook": "github:ptsefton/chordprobook-js#main"
```

and commit the resulting `package-lock.json`. npm records the resolved commit for a `github:`
dependency, so `npm ci` is reproducible even though the spec names a branch. The lockfile is
the pin; `npm update chordprobook` is the upgrade.

Note the repository name. The package is `chordprobook`; the GitHub repository is
`ptsefton/chordprobook-js` (see `chordprobook/package.json`'s `repository` field). SPEC.md §1
and this repository's README both link to `github.com/ptsefton/chordprobook`. Correct those
links as part of this change.

To develop against a local `chordprobook` checkout:

```
npm install ../chordprobook --no-save    # or: npm link ../chordprobook
npm run generate:chordprobook-bundle
npm test
```

`--no-save` leaves `package.json` and `package-lock.json` unchanged, so a local override
cannot be committed as a `file:` dependency. `npm ci` restores the pinned copy. The bundle
must be regenerated because `generated/chordprobook_browser_bundle.js` is a build artefact
read from `node_modules/chordprobook/src`; changing the dependency does not change it.

## 7a. The chaos2crate INPUT_PLUGINS dependency

`INPUT_PLUGINS` (§3, §4.5) needs chaos2crate to actually bundle only the selected input
mode(s). As published on `main`, chaos2crate reads `INPUT_PLUGINS` but always bundles
`generic-input`/`docx-input` regardless of it — the env var narrowed nothing.

That gap is fixed by
[Language-Research-Technology/chaos2crate#69](https://github.com/Language-Research-Technology/chaos2crate/pull/69)
(fixes [#68](https://github.com/Language-Research-Technology/chaos2crate/issues/68)):
`scripts/select-plugins.mjs` gains the same `mode`/`mode=package`/`mode=./path.js` parsing for
`INPUT_PLUGINS` that `PLUGINS` already had, `pipeline.js`'s input-mode fallback stops assuming
`generic` is present, and `main.js`'s Settings "Input type" dropdown is built from whichever
modes were actually selected. None of it is chordpro-specific — it's a general fix to how
chaos2crate selects its own input modes.

Until that PR merges, `deploy.config.json`'s `wrapper.ref` is pinned to its branch,
`68-exact-plugin-configuration-no-defaults`, not to `main` or a tag — the one deliberate
exception to §3's "commit a full SHA" guidance, since the branch is expected to move under
review and each new commit on it should flow straight into the next deploy. `deploy.config.json`
carries a `_pendingUpstream` note recording this; when PR #69 merges, replace `wrapper.ref`
with `main`'s new tip commit (or a tag once one exists past that point) and delete the note.

## 8. Use from another repository

R6 covers a repository holding song charts, which publishes them using this plugin as a
dependency. Only the plugin source and the rendered folders differ:

```jsonc
{
  "wrapper": { "repo": "Language-Research-Technology/chaos2crate", "ref": "<sha>" },
  "plugins": { "repo": "Language-Research-Technology/c2c-plugins", "ref": "<sha>" },
  "plugin":  { "repo": "ptsefton/c2c-chordpro-plugin", "ref": "<sha>" },
  "inputPlugins": "chordpro=c2c-chordpro-plugin",
  "additivePlugins": [
    "ro-crate-json-output",
    "songbook=c2c-chordpro-plugin/src/chordpro-input/songbook_html.js"
  ],
  "demo":    [ { "source": "songs", "path": "songbook" } ],
  "outDir":  "site"
}
```

With `plugin` given as `{repo, ref}` rather than `"self"`, §4.2 becomes a third clone;
everything downstream is unchanged. `inputPlugins`/`additivePlugins` are this same repo's own
values (§3) — copy them as they stand unless a different plugin selection is actually wanted.

`appPath`/`landing`/`pages` (§3a) are independently optional: a repository with nothing to say
beyond "here's the app" can leave all three out and get the app built straight to the site
root, as this repository itself did before adding a landing page. A repository that wants its
own landing page needs its own Markdown source (`landing.source`) — `index.md`/
`docs/chordpro-format.md` here aren't fetched from anywhere; they're this repository's own
committed content.

Such a repository needs `deploy.config.json`, the workflow, and a copy of
`scripts/build-site.mjs` (plus `scripts/render-markdown.mjs` if it uses `landing`/`pages`).
Neither script has package dependencies, so copying the files is the whole installation.

Two properties of the result are worth stating, as the script does not enforce either.
A GitHub Pages site on a public repository is public, including the charts. The whole
collection is embedded in a single `songbook.html` (SPEC.md §10), so an unpublicised URL is
not access control. Restricting access requires a private repository with Pages access
limited to organisation members.

## 9. Deferred

D2. Publishing `build-site.mjs` (and `render-markdown.mjs`) as a package rather than copying
them (§8).

D3. Automated upgrade of the pinned refs, e.g. a scheduled job that opens a pull request when
chaos2crate tags a release.

D4. Pinning anything beyond `chordprobook` (§4.3). No other dependency currently has two
copies that must agree.
