# The ChordPro dialect used here

This tool's ChordPro parsing traces back to
[`chordprobook`](https://github.com/ptsefton/chordprobook), a Python 3 script Peter Sefton
wrote between 2015 and 2018 to turn ChordPro song charts into PDF, HTML, epub, and Word
songbooks. That project's own README described its dialect like this:

> Chordpro format has no formal definition, and many different implementations. This
> implementation is designed to be relaxed and pragmatic about what it accepts.

The rest of this page is that dialect, as it applies to what this tool actually does — song
charts and setlists, not the original script's book-building, PDF, or Word output, which
this tool doesn't replicate.

## Chords

Anything in square brackets starting with a capital `A`–`G`, followed by any mix of
lower-case letters, slashes, and numbers:

```
[C] [Csus4] [C/B] [Cmaj7]
```

Some charts use `!` and `/` inside a chord for staccato or rhythm — both are recognised for
transposing purposes:

```
[C / / / ] [F / /] [C!]
```

## Directives

A directive is a line that starts and ends with `{`/`}` (surrounding whitespace is ignored);
a line with text outside the braces isn't treated as one. None are case-sensitive, and all
are optional.

| Directive | Description |
|---|---|
| `{title: ...}` / `{t: ...}` | Song title |
| `{subtitle: ...}` | By convention, a composer or artist credit |
| `{key: ...}` | The song's key |
| `{capo: ...}` | Capo position |
| `{transpose: +2}` / `{tr: +2}` | Semitone offset, or a key name |
| `{composer: ...}` | Composer credit |
| `{c: ...}` / `{comment: ...}` | A note on the song |
| `{instrument: ...}` | Which instrument to show chord grids for |
| `{define: ...}` | A chord-fingering definition for the current `{instrument:}` |
| `{new_page}` / `{np}` | A page break |
| `{start_of_chorus}` / `{soc}` … `{end_of_chorus}` / `{eoc}` | A chorus block |
| `{start_of_bridge}` / `{sob}` … `{end_of_bridge}` / `{eob}` | A bridge block |
| `{start_of_tab}` / `{sot}` … `{end_of_tab}` / `{eot}` | A tab (monospace) block |

## Setlists

A setlist is a Markdown file: songs are `##` headings, matched against a song's title by
words in order (`## Amazing` matches "Amazing Grace"); `#` headings group songs into sets.
Add `{transpose: +2}` after a song's heading to override its transpose for that one
performance.

## What's different here

This tool doesn't run the original Python script — it's a ground-up JavaScript port
([`chordprobook`](https://github.com/ptsefton/chordprobook-js), then this plugin on top of
it), which kept the dialect above but made a few deliberate changes:

- **`{artist}` is its own field**, separate from `{subtitle}`/`{st}` — the original folded
  all three into one.
- **Every directive is first-wins**, not accumulate — the first `{title}` in a file wins,
  rather than every occurrence being concatenated together.
- **`{composer}`** is read into its own field — the original recognised the directive but
  discarded its value.
- Setlists gained **nested sets** (structural grouping, not a flat `setName` string) and
  **per-entry/per-set notes**, rendered as Markdown in the songbook itself.

See [the plugin's own spec](https://github.com/ptsefton/c2c-chordpro-plugin/blob/master/src/chordpro-input/SPEC.md)
for the exact, current behaviour.
