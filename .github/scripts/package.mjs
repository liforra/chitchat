#!/usr/bin/env node
// Builds a Firefox package and a Chromium package from the single source
// manifest.json, so neither browser gets keys meant for the other:
//
//   build/firefox/   background.scripts + browser_specific_settings (gecko id,
//                    data_collection_permissions); no background.service_worker
//   build/chromium/  background.service_worker only; no browser_specific_settings
//
// Only files the manifest actually refers to are copied, so stray files in the
// repo (README, notes, this script) never end up in a package.
//
// Usage: node .github/scripts/package.mjs [--out build]

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const outFlag = args.indexOf("--out");
const outDir = path.resolve(outFlag !== -1 ? args[outFlag + 1] : "build");
const root = process.cwd();

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3) {
  fail(`expected a Manifest V3 extension, found manifest_version ${manifest.manifest_version}`);
}
if (!manifest.background || !manifest.background.service_worker || !manifest.background.scripts) {
  fail("manifest.background must list both service_worker (Chromium) and scripts (Firefox)");
}

// Every file the manifest points at.
const files = new Set();
const add = file => file && files.add(file);
(manifest.background.scripts || []).forEach(add);
add(manifest.background.service_worker);
(manifest.content_scripts || []).forEach(entry => {
  (entry.js || []).forEach(add);
  (entry.css || []).forEach(add);
});
(manifest.web_accessible_resources || []).forEach(entry => (entry.resources || []).forEach(add));
Object.values(manifest.icons || {}).forEach(add);
for (const file of files) {
  if (!fs.existsSync(path.join(root, file))) {
    fail(`manifest.json refers to a file that doesn't exist: ${file}`);
  }
}

const firefox = structuredClone(manifest);
delete firefox.background.service_worker;

const chromium = structuredClone(manifest);
delete chromium.browser_specific_settings;
chromium.background = { service_worker: manifest.background.service_worker };
// Features used: CSS color-mix() (111) plus :has() and the Highlight API (105).
chromium.minimum_chrome_version = "111";

function write(target, targetManifest) {
  const dir = path.join(outDir, target);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const file of files) {
    const dest = path.join(dir, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(root, file), dest);
  }
  fs.writeFileSync(path.join(dir, "manifest.json"), `${JSON.stringify(targetManifest, null, 2)}\n`);
  console.log(`${target}: ${files.size} files + manifest.json -> ${path.relative(root, dir) || dir}`);
}

write("firefox", firefox);
write("chromium", chromium);
console.log(`version ${manifest.version}`);

// Make the version available to later workflow steps.
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${manifest.version}\n`);
}
