// Copyright (C) 2026 Leon Ankert
// SPDX-License-Identifier: AGPL-3.0-or-later
// Full license text: https://www.gnu.org/licenses/agpl-3.0.txt (also in LICENSE)

// ---- Link previews ------------------------------------------------------
// Fetches a linked page to show a title, description and image under the
// message. The address comes from chat messages, so it is untrusted: this only
// ever GETs http(s) pages, sends no cookies and no referrer, caps time and
// size, and refuses to touch localhost or private-network addresses (which
// would let a message make the browser poke a router or a local service).
//
// Link previews work like the link embeds in most chat apps: the extension
// fetches the linked page to read its title, description and image. The only
// request is a plain GET to the linked address (for x.com links, to
// publish.twitter.com's public oEmbed endpoint). No cookies, referrer
// or ChitChat account data are sent, nothing is sent to the extension's
// developer, and addresses are kept in memory only, never stored or logged
// elsewhere. 
//
// No relevant information is sent to any third party, including the Website in the link.

const PREVIEW_TIMEOUT_MS = 8000;
const PREVIEW_MAX_HTML_BYTES = 512 * 1024;
const PREVIEW_MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const PREVIEW_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"];

function isPrivateIPv4(host) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) {
    return false;
  }
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 168 || b === 0))
    || (a === 198 && (b === 18 || b === 19));
}

function isBlockedPreviewHost(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host) {
    return true;
  }
  if (host.startsWith("[")) {
    const v6 = host.slice(1, -1);
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
    if (mapped) {
      return isPrivateIPv4(mapped[1]);
    }
    return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
  }
  if (isPrivateIPv4(host)) {
    return true;
  }
  // Numeric forms browsers accept as IPs (http://2130706433/, http://0x7f000001/).
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) {
    return true;
  }
  if (!host.includes(".")) {
    return true; // single-label names are local machines
  }
  return /(^|\.)(localhost|local|internal|lan|home|corp|intranet|home\.arpa)$/.test(host);
}

function parseAllowedPreviewUrl(raw) {
  let url;
  try {
    url = new URL(String(raw));
  } catch (error) {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) links");
  }
  if (url.username || url.password) {
    throw new Error("Link contains credentials");
  }
  if (isBlockedPreviewHost(url.hostname)) {
    throw new Error("Address not allowed");
  }
  return url;
}

// GET with a timeout, no cookies/referrer. Redirects are followed by the
// browser (the extension can't see intermediate hops), so the FINAL address is
// re-checked afterwards and the result discarded if it landed somewhere private.
async function guardedGet(url, accept) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: accept }
    });
    parseAllowedPreviewUrl(response.url || url);
    return { response, done: () => clearTimeout(timer), controller };
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

// Reads at most maxBytes; with stopAtHeadEnd, stops once </head> has arrived.
async function readLimited(response, maxBytes, stopAtHeadEnd) {
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  let tail = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    total += value.length;
    if (stopAtHeadEnd) {
      tail = (tail + new TextDecoder("latin1").decode(value)).slice(-16);
      if (/<\/head\s*>/i.test(tail)) {
        break;
      }
    }
    if (total >= maxBytes) {
      break;
    }
  }
  reader.cancel().catch(() => {});
  const bytes = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.length, bytes.length - offset);
    bytes.set(chunk.subarray(0, take), offset);
    offset += take;
    if (offset >= bytes.length) {
      break;
    }
  }
  return bytes;
}

function bytesToDataUrl(bytes, type) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return `data:${type};base64,${btoa(binary)}`;
}

function cleanText(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function fetchPreviewImage(imageUrl, baseUrl) {
  try {
    const url = parseAllowedPreviewUrl(new URL(imageUrl, baseUrl).href);
    const { response, done } = await guardedGet(url.href, "image/avif,image/webp,image/png,image/jpeg,image/gif");
    try {
      const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!response.ok || !PREVIEW_IMAGE_TYPES.includes(type)) {
        return null;
      }
      const declared = Number(response.headers.get("content-length") || 0);
      if (declared > PREVIEW_MAX_IMAGE_BYTES) {
        return null;
      }
      const bytes = await readLimited(response, PREVIEW_MAX_IMAGE_BYTES + 1, false);
      return bytes.length > PREVIEW_MAX_IMAGE_BYTES ? null : bytesToDataUrl(bytes, type);
    } finally {
      done();
    }
  } catch (error) {
    return null;
  }
}

// Tiny HTML readers. Previews run in the background script, and Chromium's
// background is a service worker with no DOMParser, so what's needed (meta
// tags, the title, one paragraph) is read straight from the text. The HTML is
// only ever read for a few strings; it's never rendered or executed.

const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”"
};

function decodeHtmlEntities(text) {
  return String(text).replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (match, dec, hex, name) => {
    if (dec || hex) {
      const code = dec ? parseInt(dec, 10) : parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    const named = NAMED_ENTITIES[name.toLowerCase()];
    return named !== undefined ? named : match;
  });
}

function parseTagAttributes(tag) {
  const attrs = {};
  const inner = tag.replace(/^<\s*[a-z0-9]+/i, "").replace(/\/?>$/, "");
  const pattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match;
  while ((match = pattern.exec(inner)) !== null) {
    const name = match[1].toLowerCase();
    if (!(name in attrs)) {
      attrs[name] = decodeHtmlEntities(match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4] || "");
    }
  }
  return attrs;
}

// Finds <meta ...> tags with a plain forward scan (honouring quoted values, so a
// ">" inside an attribute doesn't end the tag). Page HTML comes from whoever
// sent the link, so this is written to be linear with a fixed work budget: an
// endless run of unterminated tags can't make it rescan the same text again
// and again the way a backtracking regex would.
function findMetaTags(html) {
  const lower = html.toLowerCase();
  const tags = [];
  let budget = 1000000; // characters examined in total
  let pos = 0;
  while (tags.length < 300 && budget > 0) {
    const start = lower.indexOf("<meta", pos);
    if (start === -1) {
      break;
    }
    if (!/[\s/>]/.test(html[start + 5] || "x")) {
      pos = start + 5; // e.g. <metadata>
      continue;
    }
    const limit = Math.min(html.length, start + 4000);
    let quote = "";
    let i = start + 5;
    for (; i < limit; i += 1) {
      const ch = html[i];
      if (quote) {
        if (ch === quote) {
          quote = "";
        }
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        break;
      }
    }
    budget -= i - start;
    if (i < limit) {
      tags.push(html.slice(start, i + 1));
      pos = i + 1;
    } else {
      pos = start + 5; // unterminated: move on
    }
  }
  return tags;
}

// { metas: { "og:title": "...", "description": "..." }, title: "..." }
function parseHeadMeta(html) {
  const metas = {};
  for (const tag of findMetaTags(html)) {
    const attrs = parseTagAttributes(tag);
    const key = (attrs.property || attrs.name || "").toLowerCase();
    if (key && attrs.content !== undefined && !(key in metas)) {
      metas[key] = attrs.content;
    }
  }
  // The title via indexOf, not a lazy regex, for the same linear-time reason.
  let title = "";
  const lower = html.toLowerCase();
  const open = lower.indexOf("<title");
  if (open !== -1) {
    const openEnd = lower.indexOf(">", open);
    const close = openEnd === -1 ? -1 : lower.indexOf("</title", openEnd);
    if (close !== -1) {
      title = decodeHtmlEntities(html.slice(openEnd + 1, close));
    }
  }
  return { metas, title };
}

// Text of the first <p> inside a <blockquote> (an oEmbed tweet), <br> as newlines.
function firstQuotedParagraphText(fullHtml) {
  const html = fullHtml.slice(0, 20000); // a tweet is tiny; also bounds the regex work
  const match = /<blockquote\b[^>]*>[\s\S]*?<p\b[^>]*>([\s\S]*?)<\/p\s*>/i.exec(html);
  if (!match) {
    return "";
  }
  return decodeHtmlEntities(match[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, ""))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

// X/Twitter serve nothing useful to a plain fetch (a login wall), but their
// public oEmbed endpoint returns the tweet's author and text.
async function fetchTweetPreview(url) {
  const api = `https://publish.twitter.com/oembed?omit_script=1&dnt=true&url=${encodeURIComponent(url.href)}`;
  const { response, done } = await guardedGet(api, "application/json");
  try {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    const text = firstQuotedParagraphText(String(data.html || ""));
    return {
      url: url.href,
      siteName: "X",
      title: cleanText(data.author_name ? `${data.author_name} on X` : "Post on X", 200),
      description: text.slice(0, 500),
      image: null,
      color: null
    };
  } finally {
    done();
  }
}

// Firefox doesn't always grant an extension "access all websites" (notably for
// a temporarily loaded add-on), and without it the fetch below is refused by
// the browser with an unhelpful network error. Check first, so the failure has
// a real reason attached.
async function requireHostAccess(url) {
  let granted = true;
  try {
    granted = await chrome.permissions.contains({ origins: [`${url.origin}/*`] });
  } catch (error) {
    return; // can't tell; let the fetch decide
  }
  if (!granted) {
    throw new Error(`Website access not granted for ${url.origin} (Firefox: about:addons > ChitChat Theme > Permissions)`);
  }
}

async function fetchLinkPreview(rawUrl) {
  const url = parseAllowedPreviewUrl(rawUrl);
  await requireHostAccess(url);
  const host = url.hostname.toLowerCase().replace(/^(www|mobile)\./, "");
  if ((host === "x.com" || host === "twitter.com") && /^\/[^/]+\/status\/\d+/.test(url.pathname)) {
    return fetchTweetPreview(url);
  }

  const { response, done } = await guardedGet(url.href, "text/html,application/xhtml+xml,image/*;q=0.8");
  try {
    const finalUrl = new URL(response.url || url.href);
    const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();

    if (PREVIEW_IMAGE_TYPES.includes(type)) {
      // The link is itself an image: show it.
      const declared = Number(response.headers.get("content-length") || 0);
      if (!response.ok || declared > PREVIEW_MAX_IMAGE_BYTES) {
        throw new Error("Image unavailable");
      }
      const bytes = await readLimited(response, PREVIEW_MAX_IMAGE_BYTES + 1, false);
      if (bytes.length > PREVIEW_MAX_IMAGE_BYTES) {
        throw new Error("Image too large");
      }
      return { url: finalUrl.href, siteName: finalUrl.hostname, title: "", description: "", image: bytesToDataUrl(bytes, type), color: null };
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    if (type !== "text/html" && type !== "application/xhtml+xml") {
      throw new Error("Not a web page");
    }

    const bytes = await readLimited(response, PREVIEW_MAX_HTML_BYTES, true);
    const charset = /charset=([\w-]+)/i.exec(response.headers.get("content-type") || "");
    let html;
    try {
      html = new TextDecoder(charset ? charset[1] : "utf-8").decode(bytes);
    } catch (error) {
      html = new TextDecoder("utf-8").decode(bytes);
    }
    const parsed = parseHeadMeta(html);
    const meta = name => parsed.metas[name] || "";
    const title = cleanText(meta("og:title") || meta("twitter:title") || parsed.title, 200);
    const description = cleanText(meta("og:description") || meta("twitter:description") || meta("description"), 400);
    const imageUrl = meta("og:image") || meta("og:image:url") || meta("twitter:image") || meta("twitter:image:src");
    const color = /^#[0-9a-f]{3,8}$/i.test(meta("theme-color")) ? meta("theme-color") : null;
    if (!title && !description && !imageUrl) {
      throw new Error("No preview data");
    }
    return {
      url: finalUrl.href,
      siteName: cleanText(meta("og:site_name"), 60) || finalUrl.hostname.replace(/^www\./, ""),
      title,
      description,
      image: imageUrl ? await fetchPreviewImage(imageUrl, finalUrl.href) : null,
      color
    };
  } finally {
    done();
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // (Friend requests are sent from the content script, in the page's own
  // context, because the API needs the site's session cookie.)
  if (request.action === "fetchLinkPreview") {
    fetchLinkPreview(request.url)
      .then(preview => sendResponse({ success: true, ...preview }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === "getWebsiteAccess") {
    chrome.permissions.contains({ origins: ["https://*/*", "http://*/*"] })
      .then(granted => sendResponse({ granted }))
      .catch(() => sendResponse({ granted: null }));
    return true;
  }

  if (request.action === "requestWebsiteAccess") {
    // Firefox only allows this from a user action, so it can be refused when
    // triggered through a message; the caller then points at about:addons.
    chrome.permissions.request({ origins: ["https://*/*", "http://*/*"] })
      .then(granted => sendResponse({ granted }))
      .catch(error => sendResponse({ granted: false, error: error.message }));
    return true;
  }

  if (request.action === "getYouTubeInfo") {
    // Title/channel for a YouTube card via YouTube's public oEmbed endpoint. It
    // also doubles as a check: private, removed or embedding-disabled videos
    // are refused (401/403/404). Only ever talks to youtube.com, and only for
    // an 11-character video id (never an arbitrary URL from the page).
    if (typeof request.id !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(request.id)) {
      sendResponse({ success: false, error: "Invalid video id" });
      return false;
    }
    const watchUrl = `https://www.youtube.com/watch?v=${request.id}`;
    fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`, { credentials: "omit" })
      .then(async response => {
        if (!response.ok) {
          sendResponse({ success: false, status: response.status });
          return;
        }
        const data = await response.json();
        sendResponse({
          success: true,
          title: typeof data.title === "string" ? data.title.slice(0, 200) : "",
          author: typeof data.author_name === "string" ? data.author_name.slice(0, 100) : ""
        });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === "uploadExport") {
    // Uploads an exported HTML file to the configured copyparty folder with a
    // plain HTTP PUT. Runs here (not in the content script) so the stored
    // password never enters the chitchat.gg page context.
    const { filename, html } = request;
    if (typeof filename !== "string" || !/^[A-Za-z0-9_-]{16,64}\.html$/.test(filename) || typeof html !== "string") {
      sendResponse({ success: false, error: "Invalid upload request" });
      return false;
    }

    chrome.storage.local.get(["uploadBaseUrl", "publicBaseUrl", "uploadPassword"], async stored => {
      try {
        const uploadBase = new URL(stored.uploadBaseUrl || "https://cp.liforra.de/exported-chats/");
        const publicBase = new URL(stored.publicBaseUrl || "https://chats.liforra.de/");
        const allowedHost = host => host === "liforra.de" || host.endsWith(".liforra.de");
        // The password is only ever sent to a liforra.de host over https.
        if (uploadBase.protocol !== "https:" || !allowedHost(uploadBase.hostname)) {
          throw new Error("Upload URL must be an https://*.liforra.de address");
        }
        if (publicBase.protocol !== "https:") {
          throw new Error("Public link base must be an https:// address");
        }
        if (!uploadBase.pathname.endsWith("/")) {
          uploadBase.pathname += "/";
        }
        if (!publicBase.pathname.endsWith("/")) {
          publicBase.pathname += "/";
        }

        const headers = { "Content-Type": "text/html; charset=utf-8" };
        if (stored.uploadPassword) {
          headers.PW = stored.uploadPassword; // copyparty's password header
        }
        const response = await fetch(new URL(filename, uploadBase).href, {
          method: "PUT",
          credentials: "omit",
          headers,
          body: new Blob([html], { type: "text/html" })
        });
        if (!response.ok) {
          const hint = response.status === 401 || response.status === 403
            ? " (password wrong, or that account can't write to this folder)"
            : "";
          throw new Error(`Server replied ${response.status}${hint}`);
        }
        sendResponse({ success: true, url: new URL(filename, publicBase).href });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    });
    return true;
  }

  if (request.action === "getExtensionInfo") {
    // Identifies the build that produced an export: version plus a SHA-256
    // over the extension's own files. Self-reported, not a signature.
    const files = ["manifest.json", "background.js", "content.js", "markdown.js", "linkinfo.js", "theme.css"];
    const toHex = buffer => Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
    Promise.all(files.map(async name => {
      const response = await fetch(chrome.runtime.getURL(name));
      return [name, toHex(await crypto.subtle.digest("SHA-256", await response.arrayBuffer()))];
    }))
      .then(async entries => {
        const combined = toHex(await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(entries.map(([name, hash]) => `${name}:${hash}`).join("\n"))
        ));
        sendResponse({
          success: true,
          version: chrome.runtime.getManifest().version,
          hash: combined,
          files: Object.fromEntries(entries)
        });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === "fetchImageDataUrl") {
    // Used by chat export to embed images in the file: the CDN's image URLs
    // are signed and expire, and content scripts are subject to page CORS,
    // whereas this script has host permission for chitchat.gg.
    const MAX_BYTES = 8 * 1024 * 1024;
    let url;
    try {
      url = new URL(request.url);
    } catch (error) {
      sendResponse({ success: false, error: "Invalid URL" });
      return false;
    }
    if (url.protocol !== "https:" || !(url.hostname === "chitchat.gg" || url.hostname.endsWith(".chitchat.gg"))) {
      sendResponse({ success: false, error: "Host not allowed" });
      return false;
    }

    fetch(url.href, { credentials: "omit" })
      .then(async response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const type = (response.headers.get("content-type") || "").split(";")[0].trim();
        if (!type.startsWith("image/")) {
          throw new Error("Not an image");
        }
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > MAX_BYTES) {
          throw new Error("Image too large");
        }
        const bytes = new Uint8Array(buffer);
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        sendResponse({ success: true, dataUrl: `data:${type};base64,${btoa(binary)}` });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });

    return true;
  }
});