#!/usr/bin/env node
// Builds a publishable static site from this repository: a chordpro-only
// chaos2crate app at the site root, plus a demo songbook. See DEPLOY-SPEC.md
// for the full design; this script implements DEPLOY-SPEC.md §4.
//
// Usage:
//   node scripts/build-site.mjs [--out site] [--work .site-build] [--clean]
//                                [--strict] [--skip-tests] [--only app|demo]
//   node scripts/build-site.mjs --serve [--out site] [--port 4173]
//
// No package dependencies beyond Node builtins, git, and npm on PATH — see
// DEPLOY-SPEC.md §8 on why that matters (this file is the whole install for
// a repo consuming this pattern).
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync,
  statSync, rmSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = { out: "site", work: ".site-build", port: 4173 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") args.out = argv[++i];
    else if (a === "--work") args.work = argv[++i];
    else if (a === "--clean") args.clean = true;
    else if (a === "--strict") args.strict = true;
    else if (a === "--skip-tests") args.skipTests = true;
    else if (a === "--only") args.only = argv[++i];
    else if (a === "--serve") args.serve = true;
    else if (a === "--port") args.port = Number(argv[++i]);
    else throw new Error(`build-site: unrecognised argument "${a}"`);
  }
  if (args.only && args.only !== "app" && args.only !== "demo") {
    throw new Error(`build-site: --only must be "app" or "demo", got "${args.only}"`);
  }
  return args;
}

function log(msg) {
  console.log(`[build-site] ${msg}`);
}

function run(cmd, cmdArgs, opts = {}) {
  log(`+ ${cmd} ${cmdArgs.join(" ")}${opts.cwd ? `  (in ${path.relative(repoRoot, opts.cwd) || "."})` : ""}`);
  const result = spawnSync(cmd, cmdArgs, { stdio: "inherit", ...opts });
  if (result.status !== 0) {
    throw new Error(`build-site: "${cmd} ${cmdArgs.join(" ")}" exited with status ${result.status}`);
  }
}

function runCapture(cmd, cmdArgs, opts = {}) {
  return execFileSync(cmd, cmdArgs, { encoding: "utf8", ...opts }).trim();
}

// ---- §4.8 preview-only mode ---------------------------------------------

function serve(outDir, port) {
  const root = path.resolve(repoRoot, outDir);
  if (!existsSync(root)) {
    throw new Error(`build-site --serve: ${outDir} does not exist — run "npm run build:site" first`);
  }
  const MIME = {
    ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
    ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
    ".png": "image/png", ".jpg": "image/jpeg", ".txt": "text/plain",
  };
  const server = http.createServer((req, res) => {
    let reqPath = decodeURIComponent(req.url.split("?")[0]);
    if (reqPath.endsWith("/")) reqPath += "index.html";
    const filePath = path.join(root, reqPath);
    if (!filePath.startsWith(root)) { res.writeHead(403); res.end(); return; }
    try {
      const body = readFileSync(filePath);
      const ext = path.extname(filePath);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  server.listen(port, () => {
    log(`serving ${outDir}/ at http://localhost:${port}/`);
    log("Ctrl-C to stop.");
  });
}

// ---- deploy.config.json ---------------------------------------------------

function loadConfig() {
  const configPath = path.join(repoRoot, "deploy.config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  for (const key of ["wrapper", "plugins", "inputPlugins", "additivePlugins", "demo", "outDir"]) {
    if (!(key in config)) throw new Error(`deploy.config.json: missing required key "${key}"`);
  }
  return config;
}

// ---- §4.1 scratch workspace ------------------------------------------------

function isShaRef(ref) {
  return /^[0-9a-f]{40}$/i.test(ref);
}

function ensureClone(workDir, dirName, repo, ref, stamp) {
  const dest = path.join(workDir, dirName);
  if (existsSync(dest) && stamp[dirName] === ref) {
    log(`${dirName}: reusing existing clone at ${ref}`);
    return;
  }
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  const url = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
    ? `https://x-access-token:${process.env.GH_TOKEN || process.env.GITHUB_TOKEN}@github.com/${repo}.git`
    : `https://github.com/${repo}.git`;
  if (isShaRef(ref)) {
    mkdirSync(dest, { recursive: true });
    run("git", ["init", "-q"], { cwd: dest });
    run("git", ["remote", "add", "origin", url], { cwd: dest });
    run("git", ["fetch", "--depth", "1", "origin", ref], { cwd: dest });
    run("git", ["checkout", "-q", "FETCH_HEAD"], { cwd: dest });
  } else {
    run("git", ["clone", "--depth", "1", "--branch", ref, url, dest]);
  }
  stamp[dirName] = ref;
}

function copyPluginSelf(workDir) {
  const dest = path.join(workDir, "c2c-chordpro-plugin");
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const files = runCapture("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: repoRoot })
    .split("\n")
    .filter(Boolean);
  for (const rel of files) {
    const from = path.join(repoRoot, rel);
    const to = path.join(dest, rel);
    mkdirSync(path.dirname(to), { recursive: true });
    cpSync(from, to);
  }
  return dest;
}

function ensurePluginSource(workDir, config, stamp) {
  if (config.plugin === "self") {
    log("plugin: copying working tree (deploy.config.json plugin: \"self\")");
    return copyPluginSelf(workDir);
  }
  ensureClone(workDir, "c2c-chordpro-plugin", config.plugin.repo, config.plugin.ref, stamp);
  return path.join(workDir, "c2c-chordpro-plugin");
}

// ---- §4.3 install -----------------------------------------------------

function resolveLockedChordprobookCommit(pluginDir) {
  const lock = JSON.parse(readFileSync(path.join(pluginDir, "package-lock.json"), "utf8"));
  const entry = lock.packages?.["node_modules/chordprobook"];
  if (!entry?.resolved) {
    throw new Error("build-site: could not find node_modules/chordprobook in package-lock.json after npm ci");
  }
  // entry.resolved is a git URL like "git+https://github.com/ptsefton/chordprobook-js.git#<sha>"
  const match = entry.resolved.match(/#([0-9a-f]{40})$/i);
  if (!match) {
    throw new Error(`build-site: could not read a resolved commit for chordprobook from lockfile: ${entry.resolved}`);
  }
  return match[1];
}

function install(workDir, config) {
  const chaos2crateDir = path.join(workDir, "chaos2crate");
  const pluginsDir = path.join(workDir, "c2c-plugins");
  const pluginDir = path.join(workDir, "c2c-chordpro-plugin");

  run("npm", ["ci"], { cwd: pluginsDir });
  run("npm", ["ci"], { cwd: pluginDir });

  // A fresh chaos2crate clone has no idea this plugin exists — that wiring
  // is normally a manual, uncommitted step (see README's "Consuming this
  // package"). Add both file: deps ourselves so a fresh clone builds.
  run("npm", ["pkg", "set", "dependencies.c2c-plugins=file:../c2c-plugins"], { cwd: chaos2crateDir });
  run("npm", ["pkg", "set", "dependencies.c2c-chordpro-plugin=file:../c2c-chordpro-plugin"], { cwd: chaos2crateDir });

  const chordprobookSha = resolveLockedChordprobookCommit(pluginDir);
  log(`pinning chaos2crate's chordprobook to ${chordprobookSha} (from this plugin's lockfile)`);
  run("npm", ["pkg", "set", `overrides.chordprobook=github:ptsefton/chordprobook-js#${chordprobookSha}`], { cwd: chaos2crateDir });

  run("npm", ["install"], { cwd: chaos2crateDir });
}

// ---- §4.4 regenerate + verify the browser bundle ---------------------------

function verifyBundle(pluginDir, strict) {
  run("npm", ["run", "generate:chordprobook-bundle"], { cwd: pluginDir });
  const generated = readFileSync(path.join(pluginDir, "src", "chordpro-input", "generated", "chordprobook_browser_bundle.js"), "utf8");
  const committed = readFileSync(path.join(repoRoot, "src", "chordpro-input", "generated", "chordprobook_browser_bundle.js"), "utf8");
  if (generated !== committed) {
    const msg = "the committed chordprobook_browser_bundle.js is stale relative to the pinned chordprobook — "
      + "run \"npm run generate:chordprobook-bundle\" and commit the result.";
    if (strict) throw new Error(`build-site: ${msg}`);
    log(`WARNING: ${msg}`);
  } else {
    log("chordprobook_browser_bundle.js matches the pinned chordprobook commit.");
  }
}

// ---- §4.5 build the app -----------------------------------------------------

function buildApp(workDir, config, strict) {
  const chaos2crateDir = path.join(workDir, "chaos2crate");
  run("npm", ["run", "build"], {
    cwd: chaos2crateDir,
    env: {
      ...process.env,
      PLUGINS: config.additivePlugins.join(","),
      INPUT_PLUGINS: config.inputPlugins,
    },
  });
  const indexHtml = readFileSync(path.join(chaos2crateDir, "dist", "index.html"), "utf8");
  const hasAbsoluteAsset = /(?:src|href)="\/[^/]/.test(indexHtml);
  if (hasAbsoluteAsset) {
    const msg = "chaos2crate's built index.html references an absolute asset path — "
      + "vite.config.js's base setting may have changed upstream; this site expects base: \"./\".";
    if (strict) throw new Error(`build-site: ${msg}`);
    log(`WARNING: ${msg}`);
  }
  return path.join(chaos2crateDir, "dist");
}

// ---- §4.6 build the demo songbook(s) ----------------------------------------

function buildDemo(pluginDir, demoEntry, outDir) {
  const sourceInCopy = path.join(pluginDir, demoEntry.source);
  run("node", [path.join(pluginDir, "src", "chordpro-input", "build-songbook.mjs"), sourceInCopy]);

  const destDir = path.join(outDir, demoEntry.path);
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(sourceInCopy)) {
    cpSync(path.join(sourceInCopy, entry), path.join(destDir, entry), { recursive: true });
  }
  writeFileSync(
    path.join(destDir, "index.html"),
    '<!doctype html><meta http-equiv="refresh" content="0; url=songbook.html">\n',
  );
}

// ---- tree printing ------------------------------------------------------

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function printTree(dir, prefix = "") {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      console.log(`${prefix}${entry.name}/`);
      printTree(full, prefix + "  ");
    } else {
      console.log(`${prefix}${entry.name}  (${formatSize(statSync(full).size)})`);
    }
  }
}

// ---- main ---------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.serve) {
    serve(args.out, args.port);
    return;
  }

  const config = loadConfig();
  const workDir = path.resolve(repoRoot, args.work);
  const outDir = path.resolve(repoRoot, args.out);
  const stampPath = path.join(workDir, ".stamp.json");

  if (args.clean) {
    log(`--clean: removing ${path.relative(repoRoot, workDir)}`);
    rmSync(workDir, { recursive: true, force: true });
  }
  mkdirSync(workDir, { recursive: true });
  const stamp = existsSync(stampPath) ? JSON.parse(readFileSync(stampPath, "utf8")) : {};

  if (!args.skipTests) {
    run("npm", ["test"], { cwd: repoRoot });
  }

  ensureClone(workDir, "chaos2crate", config.wrapper.repo, config.wrapper.ref, stamp);
  ensureClone(workDir, "c2c-plugins", config.plugins.repo, config.plugins.ref, stamp);
  const pluginDir = ensurePluginSource(workDir, config, stamp);
  writeFileSync(stampPath, JSON.stringify(stamp, null, 2));

  install(workDir, config);
  verifyBundle(pluginDir, args.strict);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  if (args.only !== "demo") {
    const dist = buildApp(workDir, config, args.strict);
    cpSync(dist, outDir, { recursive: true });
  }

  if (args.only !== "app") {
    for (const demoEntry of config.demo) {
      log(`building demo songbook: ${demoEntry.source} -> ${demoEntry.path}/`);
      buildDemo(pluginDir, demoEntry, outDir);
    }
  }

  writeFileSync(path.join(outDir, ".nojekyll"), "");

  log(`done — ${path.relative(repoRoot, outDir)}/:`);
  printTree(outDir);
}

main().catch((err) => {
  console.error(`[build-site] ${err.message}`);
  process.exitCode = 1;
});
