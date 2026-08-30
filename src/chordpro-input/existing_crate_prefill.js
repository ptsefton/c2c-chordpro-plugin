// Supplies "folder:picked"'s ctx.crateJson/crateSourceLabel (chaos2crate's
// own contract, src/plugins/hooks.js) from a plain ro-crate-metadata.json
// already in the picked folder, if one exists.
//
// This is the chordpro-only equivalent of c2c-plugins' own xlsx-crate-input,
// which is the *only* plugin that taps "folder:picked" at all — and isn't
// part of this deployment's own additivePlugins (DEPLOY-SPEC.md §3; it's a
// spreadsheet-prefill feature this input mode has no use for). Without some
// plugin supplying ctx.crateJson, chaos2crate's own Describe-step prefill
// (populateCrateDetailsFromExistingCrate, main.js) never fires at all: a
// folder that's already been built once — with a root-dataset name the user
// deliberately typed over the raw-folder-name default — silently forgets
// that choice and reverts to the default every time Describe is revisited,
// since main.js has nothing to prefill *from*. No spreadsheet variant to
// weigh against a plain JSON file here, unlike xlsx-crate-input: chordpro
// mode only ever has the one.
let readJsonFromFolder;

export function createPlugin(deps) {
  ({ readJsonFromFolder } = deps);
  return plugin;
}

const CRATE_FILE = "ro-crate-metadata.json";

const plugin = {
  name: "chordpro-existing-crate-prefill",
  hooks: {
    "folder:picked": async (ctx) => {
      if (ctx.crateJson) return; // another tap already supplied one
      let crateJson;
      try {
        crateJson = await readJsonFromFolder(ctx.dirHandle, CRATE_FILE);
      } catch (e) {
        ctx.log(`Could not read ${CRATE_FILE} for prefill: ${e.message}`, "warn");
        return;
      }
      if (!crateJson) return;
      ctx.crateJson = crateJson;
      ctx.crateSourceLabel = CRATE_FILE;
    },
  },
};
