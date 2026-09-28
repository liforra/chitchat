// Copyright (C) 2026 Leon Ankert
// SPDX-License-Identifier: AGPL-3.0-or-later
// Full license text: https://www.gnu.org/licenses/agpl-3.0.txt (also in LICENSE)

// Link helpers: recognising YouTube links, and a local "does this link look
// dodgy?" check. Everything here is pure string analysis - checking a link
// never contacts the site it points to, which matters in a chat with
// strangers, where fetching a link would tell its sender your IP address.

const YOUTUBE_HOSTS = new Set([
  "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
  "youtu.be", "youtube-nocookie.com", "www.youtube-nocookie.com"
]);
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

// "90", "90s", "1h2m3s" -> seconds
function parseYouTubeTime(value) {
  if (!value) {
    return 0;
  }
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/i.exec(value);
  if (!m) {
    return 0;
  }
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

// -> { id, start } for a YouTube video link, else null.
function youtubeInfo(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch (error) {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) {
    return null;
  }
  let id = null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.hostname.toLowerCase() === "youtu.be") {
    id = parts[0];
  } else if (parts[0] === "watch") {
    id = url.searchParams.get("v");
  } else if (["shorts", "embed", "live", "v"].includes(parts[0])) {
    id = parts[1];
  }
  if (!id || !YOUTUBE_ID_RE.test(id)) {
    return null;
  }
  return { id, start: parseYouTubeTime(url.searchParams.get("t") || url.searchParams.get("start")) };
}

// ---- Safety heuristics ------------------------------------------------------

const LINK_SHORTENERS = new Set([
  "bit.ly", "t.co", "tinyurl.com", "goo.gl", "is.gd", "v.gd", "cutt.ly", "rebrand.ly", "ow.ly", "buff.ly",
  "shorturl.at", "t.ly", "lnkd.in", "tiny.cc", "rb.gy", "s.id", "bl.ink", "short.io", "soo.gd", "clck.ru"
]);

// Domains that exist to log the IP address of whoever opens them.
const LINK_IP_LOGGERS = new Set([
  "grabify.link", "iplogger.org", "iplogger.com", "iplogger.co", "iplogger.ru", "2no.co", "yip.su", "ipgrabber.ru",
  "blasze.com", "leancoding.co", "stopify.co", "freegiftcards.co", "joinmy.site", "curiouscat.club", "ps3cfw.com",
  "bmwforum.co", "quickmessage.us", "spottyfly.com", "lovebird.guru", "trulove.guru", "dateing.club", "shrekis.life"
]);

// keyword -> registrable domains that are genuinely that brand.
const LINK_BRANDS = {
  discord: ["discord.com", "discord.gg", "discordapp.com", "discordapp.net", "discord.media", "discord.gift", "discordstatus.com"],
  steam: ["steampowered.com", "steamcommunity.com", "steamstatic.com", "steam.tv"],
  roblox: ["roblox.com", "rbxcdn.com"],
  paypal: ["paypal.com", "paypal.me"],
  chitchat: ["chitchat.gg"]
};

// Good enough for warnings: last two labels, or last three for co.uk-style names.
function registrableDomain(host) {
  const labels = host.split(".");
  if (labels.length >= 3 && labels[labels.length - 1].length === 2
    && ["co", "com", "org", "net", "ac", "gov", "edu"].includes(labels[labels.length - 2])) {
    return labels.slice(-3).join(".");
  }
  return labels.slice(-2).join(".");
}

function looksLikeDomainText(text) {
  const m = /^\s*(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,24})(?:[/?#:].*)?\s*$/i.exec(text || "");
  return m ? m[1].toLowerCase().replace(/^www\./, "") : null;
}

// -> [{ level: "warn" | "danger", text }]; empty when nothing looks off.
function checkLinkSafety(urlString, displayText) {
  const warnings = [];
  let url;
  try {
    url = new URL(urlString);
  } catch (error) {
    return warnings;
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const bare = host.replace(/^www\./, "");
  const registrable = registrableDomain(bare);

  if (LINK_IP_LOGGERS.has(registrable) || LINK_IP_LOGGERS.has(bare)) {
    warnings.push({ level: "danger", text: "This domain is known for logging the IP address of everyone who opens it." });
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /^\[.*\]$/.test(host) || /^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) {
    warnings.push({ level: "warn", text: "This link points at a raw IP address instead of a website name." });
  }
  if (host.split(".").some(label => label.startsWith("xn--"))) {
    warnings.push({ level: "warn", text: "This address uses international characters that can imitate a well-known site." });
  }
  if (LINK_SHORTENERS.has(registrable) || LINK_SHORTENERS.has(bare)) {
    warnings.push({ level: "warn", text: "This is a shortened link, so the real destination is hidden." });
  }
  if (url.username || url.password) {
    warnings.push({ level: "warn", text: "This link has a login part before the domain, a common way to disguise where it goes." });
  }
  for (const [keyword, official] of Object.entries(LINK_BRANDS)) {
    if (bare.includes(keyword) && !official.includes(registrable)) {
      warnings.push({ level: "warn", text: `This address mentions "${keyword}" but isn't the real ${keyword} site.` });
      break;
    }
  }
  const shown = looksLikeDomainText(displayText);
  if (shown && shown !== bare && registrableDomain(shown) !== registrable) {
    warnings.push({ level: "warn", text: `The link text says ${shown} but it actually goes to ${bare}.` });
  }
  return warnings;
}

function highestWarningLevel(warnings) {
  if (warnings.some(w => w.level === "danger")) {
    return "danger";
  }
  return warnings.length ? "warn" : "";
}
