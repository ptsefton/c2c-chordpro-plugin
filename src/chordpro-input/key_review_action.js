// "Review guessed keys…" (SPEC.md §17) — an optionSchema "action" tile
// (main.js's renderOptionGroupTiles, kind: "action"), same shape as
// setlist_match_action.js's own post-build review tile. Runs independently
// of the crate-building pipeline entirely — clicking the tile scans the
// current folder's crate immediately, no "Build" required first or after.
//
// deps.openModal is the only host capability this needs beyond the plain
// I/O every plugin already gets, same as every other action tile in this
// repo — chaos2crate's own index.html/main.js know nothing about what a
// "key" review even is.

import JSZip from "jszip";

let verifyPermission, readJsonFromFolder, writeFile, openModal;

export function createPlugin(deps) {
  ({ verifyPermission, readJsonFromFolder, writeFile, openModal } = deps);
  return plugin;
}

const CRATE_FILE = "ro-crate-metadata.json";
const BACKUP_DIR = ".chordpro-key-backups";

// This feature's own tile styling — injected once into document.head, same
// convention setlist_match_action.js's own ensureStylesInjected follows
// (deps.openModal's "no host markup" discipline).
const STYLE_ELEMENT_ID = "chordpro-key-review-styles";
function ensureStylesInjected() {
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = `
    .ckr-tile { border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; background: var(--panel-2); }
    .ckr-tile:last-child { margin-bottom: 0; }
    .ckr-tile-title { font-weight: 700; font-size: 14px; margin-bottom: 8px; }
    .ckr-candidates { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
    .ckr-candidate-pill {
      border: 1px solid var(--border); border-radius: 999px; background: var(--panel);
      color: inherit; font-size: 12px; padding: 3px 10px; cursor: pointer;
    }
    .ckr-candidate-pill:hover { border-color: var(--accent); }
    .ckr-key-input { width: 100%; box-sizing: border-box; }
    .ckr-write-back { display: flex; align-items: baseline; gap: 6px; margin: 14px 0 0; }
  `;
  document.head.appendChild(style);
}

function renderTiles(body, items) {
  const inputs = new Map();
  items.forEach((item) => {
    const tile = document.createElement("div");
    tile.className = "ckr-tile";

    const title = document.createElement("div");
    title.className = "ckr-tile-title";
    title.textContent = item.title;
    tile.appendChild(title);

    const input = document.createElement("input");
    input.type = "text";
    input.className = "ckr-key-input";
    input.value = item.currentKey;
    input.placeholder = "e.g. G, Em…";
    inputs.set(item.id, input);

    if (item.candidates.length) {
      const pills = document.createElement("div");
      pills.className = "ckr-candidates";
      item.candidates.forEach((candidate) => {
        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = "ckr-candidate-pill";
        pill.textContent = candidate.key;
        pill.addEventListener("click", () => { input.value = candidate.key; });
        pills.appendChild(pill);
      });
      tile.appendChild(pills);
    }

    tile.appendChild(input);
    body.appendChild(tile);
  });
  return inputs;
}

// item.id -> the text field's current value ("" if cleared — SPEC.md §17's
// own "the one way to undo a guess" note) for every item still present.
function collectValues(inputs) {
  const values = {};
  for (const [id, input] of inputs) values[id] = input.value.trim();
  return values;
}

function openReviewModal(items) {
  ensureStylesInjected();
  let inputs;
  let writeBackCheckbox;
  return openModal({
    title: "Review guessed keys",
    modalClassName: "mapping-modal",
    onDismiss: () => null,
    render(body, close) {
      const intro = document.createElement("p");
      intro.className = "hint";
      intro.style.margin = "-8px 0 0";
      intro.textContent = "Every song with a guessed or previously-confirmed key. Click a candidate to use it, " +
        "or type any key you like, then Save.";
      body.appendChild(intro);

      const summary = document.createElement("div");
      summary.className = "hint";
      summary.textContent = `${items.length} song${items.length === 1 ? "" : "s"} to review.`;
      body.appendChild(summary);

      const tilesEl = document.createElement("div");
      tilesEl.className = "mapping-body";
      inputs = renderTiles(tilesEl, items);
      body.appendChild(tilesEl);

      const writeBackRow = document.createElement("label");
      writeBackRow.className = "ckr-write-back";
      writeBackCheckbox = document.createElement("input");
      writeBackCheckbox.type = "checkbox";
      writeBackRow.appendChild(writeBackCheckbox);
      writeBackRow.appendChild(document.createTextNode("Also add {key:} to the song files (backs up originals first)"));
      body.appendChild(writeBackRow);

      const actions = document.createElement("div");
      actions.className = "actions";
      const saveBtn = document.createElement("button");
      saveBtn.type = "button"; saveBtn.textContent = "Save";
      saveBtn.addEventListener("click", () => close({ values: collectValues(inputs), writeBack: writeBackCheckbox.checked }));
      actions.appendChild(saveBtn);
      body.appendChild(actions);
    },
  });
}

// A local copy of the same relative-path file walk fix_st_directive_ui.js
// already has — not an import, same reasoning as that file's own header
// comment on its writeFileAtPath: this repo has no import dependency
// between its own sibling action plugins, any more than it does on
// chaos2crate's source.
async function getFileHandleAtPath(dirHandle, relativePath) {
  const parts = relativePath.split("/").filter(Boolean);
  const filename = parts.pop();
  let dir = dirHandle;
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: false });
  return dir.getFileHandle(filename, { create: false });
}

async function writeFileAtPath(dirHandle, relativePath, contents) {
  const parts = relativePath.split("/").filter(Boolean);
  const filename = parts.pop();
  let dir = dirHandle;
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
  const fh = await dir.getFileHandle(filename, { create: true });
  const w = await fh.createWritable();
  await w.write(contents);
  await w.close();
}

// Backs up, then rewrites, every file in `entries` ({id, key}) — id is the
// song's own @id (its relative path), key the confirmed value to insert.
// Re-reads each file fresh off disk rather than trusting the crate's own
// (possibly stale) `text`, same reasoning as applyStDirectiveFixes (SPEC.md
// §15). A separate backup folder from that tool's own (SPEC.md §17) so the
// two tools' backups are never mixed together in one listing.
async function writeKeysBackToFiles(dirHandle, entries) {
  const { insertKeyDirective } = await import("./chordpro_crate.js");
  const zip = new JSZip();
  let filesChanged = 0;
  for (const { id, key } of entries) {
    const fh = await getFileHandleAtPath(dirHandle, id);
    const original = await (await fh.getFile()).text();
    zip.file(id, original);
    const rewritten = insertKeyDirective(original, key);
    const w = await fh.createWritable();
    await w.write(rewritten);
    await w.close();
    filesChanged += 1;
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${BACKUP_DIR}/${timestamp}.zip`;
  await writeFileAtPath(dirHandle, backupPath, await zip.generateAsync({ type: "arraybuffer" }));
  return { filesChanged, backupPath };
}

async function runReviewKeyGuesses({ dirHandle, log }) {
  if (!(await verifyPermission(dirHandle, true))) {
    log("Permission to read/write the folder was denied.", "err");
    return;
  }

  let crateJson;
  try {
    crateJson = await readJsonFromFolder(dirHandle, CRATE_FILE);
  } catch (e) {
    log("Could not read " + CRATE_FILE + ": " + (e && e.message ? e.message : e), "err");
    return;
  }
  if (!crateJson) {
    log(CRATE_FILE + " not found — build a songbook first.", "info");
    return;
  }

  const { extractReviewableSongKeys } = await import("./chordpro_crate.js");
  const reviewable = extractReviewableSongKeys(crateJson);
  if (!reviewable.length) {
    log("No guessed keys to review — no song in this crate has a guessed or confirmed key.", "info");
    return;
  }

  const picks = await openReviewModal(reviewable);
  if (!picks) {
    log("Key review: cancelled, nothing changed.", "info");
    return;
  }

  const byId = new Map(crateJson["@graph"].map((entity) => [entity["@id"], entity]));
  const toWriteBack = [];
  let changedCount = 0;
  for (const item of reviewable) {
    const value = (picks.values[item.id] || "").trim();
    const entity = byId.get(item.id);
    if (!entity) continue;
    if (!value) {
      delete entity.musicalKey;
      delete entity["custom:keyStatus"];
      changedCount += 1;
      continue;
    }
    entity.musicalKey = value;
    entity["custom:keyStatus"] = "confirmed";
    changedCount += 1;
    toWriteBack.push({ id: item.id, key: value });
  }

  if (!changedCount) {
    log("Key review: no changes made.", "info");
    return;
  }

  try {
    await writeFile(dirHandle, CRATE_FILE, JSON.stringify(crateJson, null, 2));
    const { renderSongbookHtml, OUTPUT_FILE } = await import("./songbook_html.js");
    await writeFile(dirHandle, OUTPUT_FILE, renderSongbookHtml(crateJson));
    let message = `Key review: confirmed ${changedCount} song${changedCount === 1 ? "" : "s"}. ` +
      `Re-wrote ${CRATE_FILE} and ${OUTPUT_FILE}.`;
    if (picks.writeBack && toWriteBack.length) {
      const { filesChanged, backupPath } = await writeKeysBackToFiles(dirHandle, toWriteBack);
      message += ` Wrote {key:} into ${filesChanged} file(s) (backup: ${backupPath}).`;
    }
    log(message, "ok");
  } catch (e) {
    log("Could not save key review changes: " + (e && e.message ? e.message : e), "err");
  }
}

const plugin = {
  name: "key-guess-review",
  optionSchema: {
    key: "reviewKeyGuesses",
    kind: "action",
    label: "Review guessed keys…",
    hint: "Revisit any song with a guessed key — logs \"nothing to review\" if this folder's crate has none.",
    run: runReviewKeyGuesses,
  },
};
