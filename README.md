# ChitChat Theme

A browser extension for [ChitChat](https://chitchat.gg): themes, and some chat features the site doesn't have.

## Install

Files are on the [latest release](../../releases/latest). Pick the section for your browser.

### Firefox (signed)

The normal way to install it. Works in regular release Firefox and stays installed across restarts and updates.

1. Download `*-firefox-signed.xpi`.
2. Open the file, or drag it onto a Firefox window.
3. Click **Add**.

If no signed file exists yet (nobody's tagged a release since the last change), use one of the two options below instead.

### Firefox (unsigned, temporary)

For trying out a build before it's signed. No setup needed, but Firefox forgets it on every restart, so you'll redo
this each time you reopen the browser.

1. Download `*-firefox-unsigned.xpi` (or build it yourself: `node .github/scripts/package.mjs`, then look in
   `build/firefox`).
2. Go to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and pick the `.xpi` (or `build/firefox/manifest.json` if you built it yourself).

### Other Firefox (unsigned, permanent)

Regular release Firefox refuses to install an unsigned add-on at all, temporary or not. Firefox **Developer
Edition**, **Nightly**, or **ESR** will, and it stays installed permanently, because those channels let you turn off
signature checking:

1. Install [Firefox Developer Edition](https://www.mozilla.org/firefox/developer/) or
   [Nightly](https://www.mozilla.org/firefox/nightly/) (a separate install from your regular Firefox).
2. In that browser, go to `about:config`, accept the risk, search for `xpinstall.signatures.required`, and set it to
   `false`.
3. Download `*-firefox-unsigned.xpi` and drag it onto that browser's window (or **File → Open File**).

### Chrome(ium)

Covers Chrome, Edge, Brave, Vivaldi, and similar. Every Chromium-based browser blocks installing a `.crx` from
outside its own web store, even in Developer mode and even by dragging it onto the extensions page - that
restriction applies across the board, not just to plain Chrome. The signed `.crx` release asset exists for
enterprise/managed deployment (an `ExtensionInstallForcelist`/`ExtensionInstallAllowlist` policy) rather than a
manual install; for a normal install, this is the route that actually works everywhere:

1. Download `*-chromium-unsigned.zip` and unzip it somewhere permanent (not a temp folder — Chrome reads from this
   folder every time it starts).
2. Go to `chrome://extensions` (or `edge://extensions`, `brave://extensions`, etc.).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the unzipped folder.

### After installing

Firefox's install prompt will say the extension collects "browsing activity" and "personal communications". That's
the declaration for link previews and YouTube cards (they contact the linked sites) and the optional chat upload (it
sends the chat to the server you configure). Nothing is sent to the developer.

The extension also needs Firefox's / Chromium's "access all websites" permission. Without it nothing loads, and a
small "Permissions are missing" notice appears in the corner instead. In Firefox: `about:addons` → ChitChat Theme →
Permissions.

**Browser support.** Firefox 140+ is the tested target. Chromium 111+ is supported for everything except hidden
premium badges, which read the page's internal data in a way only Firefox allows.

## Features

- **Themes:** color presets or your own, softer tone, frosted surfaces, compact layout.
- **Links:** clickable everywhere, including ones written to dodge detection (`google,com`, `https:// x .com/...`).
- **Markdown:** bold, italic, underline, strikethrough, spoilers, code, quotes, lists.
- **Embeds:** playable YouTube cards, and previews (title, description, image) for other links.
- **Link warnings:** asks before opening links that look risky. Checked on your device only.
- **Hidden premium badges:** a gray badge for people who have premium but hide it (Firefox only).
- **Add a friend by ID** in the Friend Requests panel.
- **Paste an image to attach it** in the message box — the site only supported the file picker and drag-and-drop.
- **Export chat** as HTML, JSON or Markdown, or upload the HTML to your own server for a private link.

Settings are under the menu button next to the friend button.

## Releases (CI)

`.github/workflows/release.yml` builds everything:

- Every push and pull request: lint and build the unsigned Firefox `.xpi` and Chromium `.zip`.
- Pushing a tag `vX.Y.Z` (must match `version` in `manifest.json`): also signs the Firefox package with AMO, builds a
  signed Chromium `.crx`, and publishes all four files plus `SHA256SUMS.txt` on a GitHub release.

`.github/scripts/package.mjs` splits the one `manifest.json` into `build/firefox` and `build/chromium`, each with only the
keys that browser understands.

Repository secrets (all optional; a missing one just skips that file):

| Secret | What it is |
|---|---|
| `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` | API key from <https://addons.mozilla.org/developers/addon/api/key/> |
| `CRX_PRIVATE_KEY` | A PEM private key. The Chromium extension ID is derived from it, so keep using the same key. |

Make a key once, paste the file's contents into the secret, and keep a copy somewhere safe. The workflow prints the
resulting extension ID in its run summary. Either of these works:

```sh
openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out crx.pem
```

```sh
node -e "require('fs').writeFileSync('crx.pem', require('crypto').generateKeyPairSync('rsa', {modulusLength: 2048, privateKeyEncoding: {type: 'pkcs8', format: 'pem'}, publicKeyEncoding: {type: 'spki', format: 'pem'}}).privateKey)"
```

AMO refuses to sign a version number it has already signed, so bump `version` in `manifest.json` before each tag.

## License

Copyright © 2026 Leon Ankert.

Licensed under the [GNU Affero General Public License v3.0](LICENSE) or (at your option) any later version. Full
text in [`LICENSE`](LICENSE).
