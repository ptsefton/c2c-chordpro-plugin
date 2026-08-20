// ChordPro song/setlist input mode — see SPEC.md for the full design. Lives
// in its own repo (c2c-chordpro-plugin), selected into a chaos2crate build
// via that repo's own select-plugins.mjs (an external input-mode source —
// see this repo's own README for the exact invocation) rather than living
// inside chaos2crate or c2c-plugins directly.
//
// Registered as an input-mode plugin (INPUT_PLUGINS, keyed by inputMode) —
// unlike the additive hook-tapping plugins chaos2crate's own PLUGINS array
// holds, input-mode plugins are mutually exclusive: exactly one runs per
// build, dispatched by chaos2crate's pipeline.js on ctx.options.inputMode.
//
// No analyzeFiles, unlike generic-input: this plugin does its own folder
// walk inside buildCrate (SPEC.md §3) rather than producing a flat
// ctx.filesWithMeta list for other taps to annotate.
//
// chordpro_crate.js is dynamically imported here (rather than statically, at
// the top of this file) so it — and the ro-crate library it pulls in — stay
// out of the main bundle until a chordpro build actually runs, the same
// discipline docx-input and austlang both already follow for their own
// heavier dependencies.
//
// createPlugin(deps), not a static `plugin` export — the contract every
// c2c-plugins-style plugin follows (see c2c-plugins' own README) so
// chaos2crate never has to import this repo's code directly. This plugin
// doesn't actually read anything off `deps` — it calls chordpro_crate.js
// directly rather than through chaos2crate's own crate.js/fs_helpers.js —
// so the parameter is accepted (for a consistent call signature) and
// otherwise ignored.
export function createPlugin(_deps) {
  return plugin;
}

const plugin = {
  name: "chordpro-input",
  inputMode: "chordpro",
  async buildCrate(ctx) {
    ctx.log("Parsing ChordPro songs and setlists…", "info");
    const { buildCrateFromChordProFolder } = await import("./chordpro_crate.js");

    const result = await buildCrateFromChordProFolder(ctx.dirHandle, ctx.config, (msg) => ctx.log(msg, "muted"), {
      // Resolved before the pipeline ever started (SPEC.md §16) — a fresh
      // pick from the review modal, one persisted from an earlier build, or
      // simply absent, in which case buildSetlistEntities falls back to the
      // path-proximity default on its own.
      matchOverrides: ctx.options.setlistMatchOverrides || {},
    });
    if (!result) {
      throw new Error(
        "No ChordPro song files (.pro/.cho/.cho.txt) or setlist files (.setlist.md) were found in this folder."
      );
    }

    ctx.crate = result.crate;
    ctx.sourceCount = result.songCount;
    ctx.log(`Built crate: ${result.songCount} song(s), ${result.setlistCount} setlist(s).`, "ok");
  },
};
