// Unit tests for existing_crate_prefill.js — see that file's own header
// comment for why this exists (chaos2crate's Describe-step prefill has
// nothing to read from without it, in a deployment that doesn't bundle
// xlsx-crate-input).
import assert from "node:assert/strict";
import { createPlugin } from "./existing_crate_prefill.js";

function fakeCtx(dirHandle, overrides = {}) {
  return { dirHandle, log: () => {}, crateJson: null, crateSourceLabel: "", ...overrides };
}

/* ---------- a folder with an existing crate ---------- */

{
  const crateJson = { "@context": "https://w3id.org/ro/crate/1.1/context", "@graph": [{ "@id": "./", name: "Earwig Marmalade Songbook" }] };
  const plugin = createPlugin({
    readJsonFromFolder: async (_handle, filename) => {
      assert.equal(filename, "ro-crate-metadata.json");
      return crateJson;
    },
  });
  const ctx = fakeCtx({ name: "earwig-marmalade" });
  await plugin.hooks["folder:picked"](ctx);
  assert.deepEqual(ctx.crateJson, crateJson);
  assert.equal(ctx.crateSourceLabel, "ro-crate-metadata.json");
}

/* ---------- a fresh folder, nothing to prefill from ---------- */

{
  const plugin = createPlugin({ readJsonFromFolder: async () => null });
  const ctx = fakeCtx({ name: "fresh-folder" });
  await plugin.hooks["folder:picked"](ctx);
  assert.equal(ctx.crateJson, null);
  assert.equal(ctx.crateSourceLabel, "");
}

/* ---------- another tap already supplied a crate: this one doesn't override it ---------- */

{
  let called = false;
  const plugin = createPlugin({ readJsonFromFolder: async () => { called = true; return { "@graph": [] }; } });
  const already = { "@graph": [{ "@id": "./", name: "Already Chosen" }] };
  const ctx = fakeCtx({ name: "whatever" }, { crateJson: already, crateSourceLabel: "some-other-source.json" });
  await plugin.hooks["folder:picked"](ctx);
  assert.equal(called, false);
  assert.deepEqual(ctx.crateJson, already);
  assert.equal(ctx.crateSourceLabel, "some-other-source.json");
}

/* ---------- invalid JSON: logged as a warning, doesn't throw ---------- */

{
  const warnings = [];
  const plugin = createPlugin({
    readJsonFromFolder: async () => { throw new Error("ro-crate-metadata.json in the folder is not valid JSON: Unexpected token"); },
  });
  const ctx = fakeCtx({ name: "broken-json" }, { log: (msg, level) => warnings.push({ msg, level }) });
  await plugin.hooks["folder:picked"](ctx);
  assert.equal(ctx.crateJson, null);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].level, "warn");
}

console.log("test-existing-crate-prefill.mjs: all assertions passed.");
