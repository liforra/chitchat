#!/usr/bin/env node
// Prints the Chrome/Edge extension ID that a private key produces. The ID is
// derived from the key, so keeping the same key keeps the same ID across
// releases (and users' settings/updates line up).
//
// Usage: node .github/scripts/crx-id.mjs path/to/key.pem

import crypto from "node:crypto";
import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: crx-id.mjs <key.pem>");
  process.exit(1);
}
const publicKey = crypto.createPublicKey(fs.readFileSync(file));
const der = publicKey.export({ type: "spki", format: "der" });
// First 16 bytes of the SHA-256, each hex digit mapped 0-f -> a-p.
const id = crypto.createHash("sha256").update(der).digest("hex").slice(0, 32)
  .replace(/./g, ch => String.fromCharCode("a".charCodeAt(0) + parseInt(ch, 16)));
console.log(id);
