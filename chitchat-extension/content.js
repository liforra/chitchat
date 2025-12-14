const GEAR_BUTTON_ID = "chitchat-extension-gear";
const PORTAL_ID = "chitchat-settings-portal";
const PANEL_ID = "chitchat-settings-panel";
const SETTINGS_OPEN_ATTR = "ccSettingsOpen";
const THEME_ATTR = "ccTheme";
const SURFACE_ATTR = "ccSurface";
const DENSITY_ATTR = "ccDensity";
const STORAGE_KEY = "chitchat-extension-theme-variant";
const SURFACE_STORAGE_KEY = "chitchat-extension-surface-variant";
const DENSITY_STORAGE_KEY = "chitchat-extension-density";
const VARIANT_DEFAULT = "default";
const VARIANT_SOFT = "soft";
const SURFACE_DEFAULT = "default";
const SURFACE_FROSTED = "frosted";
const DENSITY_COMPACT = "compact";
const THEME_STYLE_ID = "chitchat-extension-theme-style";
const ACTION_BAR_SELECTOR = 'div.flex.flex-1.justify-end.gap-1, div.flex.flex-1.justify-end.gap-2, div.flex.flex-1.justify-end';
const BUTTON_CLASSES = "inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 w-10 rounded-full relative chitchat-settings-trigger";
const FRIEND_ICON_SIGNATURE = "12.5 9a3.5 3.5 0 1 1 0 7";

function datasetHost() {
  return document.body || null;
}

function withRetry(fn, interval = 500, limit = 20) {
  let attempts = 0;
  const handle = setInterval(() => {
    attempts += 1;
    if (fn()) {
      clearInterval(handle);
    } else if (attempts >= limit) {
      clearInterval(handle);
    }
  }, interval);
}

function getActionBar() {
  const candidates = Array.from(document.querySelectorAll(ACTION_BAR_SELECTOR));
  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect();
    const style = window.getComputedStyle(candidate);
    if (rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden") {
      return candidate;
    }
  }
  const fallbacks = Array.from(document.querySelectorAll('header div.flex.flex-1.justify-end'));
  for (const candidate of fallbacks) {
    const rect = candidate.getBoundingClientRect();
    const style = window.getComputedStyle(candidate);
    if (rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden") {
      return candidate;
    }
  }
  return null;
}

function findFriendButton() {
  const prioritizedSelectors = [
    'button[aria-controls="radix-:r0:"]',
    'button[aria-haspopup="dialog"][aria-controls^="radix-"]'
  ];
  for (const selector of prioritizedSelectors) {
    const candidate = document.querySelector(selector);
    if (candidate) {
      return candidate;
    }
  }
  const buttons = Array.from(document.querySelectorAll('button'));
  for (const button of buttons) {
    const paths = Array.from(button.querySelectorAll('svg path'));
    if (paths.some(path => (path.getAttribute('d') || "").includes(FRIEND_ICON_SIGNATURE))) {
      return button;
    }
  }
  return null;
}

function ensureThemeStyles() {
  if (document.getElementById(THEME_STYLE_ID)) {
    return true;
  }
  const head = document.head || document.documentElement;
  if (!head) {
    return false;
  }
  const runtime = typeof chrome !== "undefined" && chrome.runtime
    ? chrome.runtime
    : typeof browser !== "undefined" && browser.runtime
    ? browser.runtime
    : null;
  const href = runtime ? runtime.getURL("theme.css") : null;
  const link = document.createElement("link");
  link.id = THEME_STYLE_ID;
  link.rel = "stylesheet";
  link.href = href || "theme.css";
  head.appendChild(link);
  return true;
}

function buildGearButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.id = GEAR_BUTTON_ID;
  button.className = BUTTON_CLASSES;
  button.setAttribute("aria-label", "Open extension settings");
  button.setAttribute("aria-haspopup", "dialog");
  button.innerHTML = `
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path fill="currentColor" d="M19.14 12.94a7.07 7.07 0 0 0 .05-.94 7.07 7.07 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.14 7.14 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7.14 7.14 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.66 8.48a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96c.5.38 1.05.7 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.24 1.13-.56 1.63-.94l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64ZM12 15.25a3.25 3.25 0 1 1 0-6.5 3.25 3.25 0 0 1 0 6.5Z"></path>
    </svg>
  `;
  button.addEventListener("click", toggleSettings);
  return button;
}

function insertGearButton() {
  if (document.getElementById(GEAR_BUTTON_ID)) {
    return true;
  }
  const button = buildGearButton();
  const friendButton = findFriendButton();
  if (friendButton) {
    friendButton.insertAdjacentElement("afterend", button);
    console.info("[ChitChat Extension] settings gear inserted next to friend button");
    return true;
  }
  const actionBar = getActionBar();
  if (!actionBar) {
    console.info("[ChitChat Extension] action bar not yet available");
    return false;
  }
  const reference = actionBar.querySelector('button:last-of-type');
  if (reference) {
    reference.insertAdjacentElement("beforebegin", button);
  } else {
    actionBar.appendChild(button);
  }
  console.info("[ChitChat Extension] settings gear inserted using fallback");
  return true;
}

function ensurePortal() {
  if (document.getElementById(PORTAL_ID)) {
    return document.getElementById(PORTAL_ID);
  }
  const host = datasetHost();
  if (!host) {
    return null;
  }
  const portal = document.createElement("div");
  portal.id = PORTAL_ID;
  portal.innerHTML = `
    <div id="${PANEL_ID}" role="dialog" aria-modal="true" aria-labelledby="${PANEL_ID}-title">
      <div class="chitchat-settings-header">
        <h2 id="${PANEL_ID}-title">ChitChat Extension Settings</h2>
        <button type="button" class="chitchat-settings-close" aria-label="Close settings">&times;</button>
      </div>
      <div class="chitchat-settings-section">
        <span class="chitchat-settings-label">Theme intensity</span>
        <div class="chitchat-settings-options" role="group" aria-label="Theme intensity">
          <button type="button" data-variant="${VARIANT_DEFAULT}">Shades of Purple</button>
          <button type="button" data-variant="${VARIANT_SOFT}">Soft Lavender</button>
        </div>
      </div>
      <div class="chitchat-settings-section">
        <span class="chitchat-settings-label">Surface styling</span>
        <div class="chitchat-settings-options" role="group" aria-label="Surface styling">
          <button type="button" data-surface="${SURFACE_DEFAULT}">Standard Gloss</button>
          <button type="button" data-surface="${SURFACE_FROSTED}">Frosted Glass</button>
        </div>
      </div>
      <div class="chitchat-settings-section">
        <span class="chitchat-settings-label">Layout density</span>
        <label class="chitchat-toggle">
          <input type="checkbox" data-density-toggle>
          <span class="chitchat-toggle-slider" aria-hidden="true"></span>
          <span class="chitchat-toggle-text">Compact mode</span>
        </label>
        <p class="chitchat-settings-hint">Reduces radii and surface padding for tighter layouts.</p>
      </div>
      <div class="chitchat-settings-footnote">Changes apply immediately and persist for this browser.</div>
    </div>
  `;
  host.appendChild(portal);
  portal.addEventListener("click", event => {
    if (event.target === portal) {
      closeSettings();
    }
  });
  portal.querySelector(".chitchat-settings-close").addEventListener("click", closeSettings);
  portal.querySelectorAll('[data-variant]').forEach(button => {
    button.addEventListener("click", () => {
      setThemeVariant(button.dataset.variant);
      highlightActiveVariant();
    });
  });
  portal.querySelectorAll('[data-surface]').forEach(button => {
    button.addEventListener("click", () => {
      setSurfaceVariant(button.dataset.surface);
      highlightSurfaceVariant();
    });
  });
  const densityToggle = portal.querySelector('[data-density-toggle]');
  if (densityToggle) {
    densityToggle.addEventListener("change", () => {
      setDensityMode(densityToggle.checked);
      syncDensityToggle();
    });
  }
  highlightActiveVariant();
  highlightSurfaceVariant();
  syncDensityToggle();
  return portal;
}

function highlightActiveVariant() {
  const current = getThemeVariant();
  document.querySelectorAll(`#${PORTAL_ID} [data-variant]`).forEach(button => {
    if (button.dataset.variant === current) {
      button.classList.add("is-active");
    } else {
      button.classList.remove("is-active");
    }
  });
}

function highlightSurfaceVariant() {
  const current = getSurfaceVariant();
  document.querySelectorAll(`#${PORTAL_ID} [data-surface]`).forEach(button => {
    if (button.dataset.surface === current) {
      button.classList.add("is-active");
    } else {
      button.classList.remove("is-active");
    }
  });
}

function toggleSettings() {
  if (document.body.dataset[SETTINGS_OPEN_ATTR] === "true") {
    closeSettings();
  } else {
    openSettings();
  }
}

function openSettings() {
  ensurePortal();
  highlightActiveVariant();
  highlightSurfaceVariant();
  syncDensityToggle();
  const host = datasetHost();
  if (host) {
    host.dataset[SETTINGS_OPEN_ATTR] = "true";
  }
}

function closeSettings() {
  const host = datasetHost();
  if (host) {
    host.dataset[SETTINGS_OPEN_ATTR] = "false";
  }
}

function setThemeVariant(variant) {
  const value = [VARIANT_DEFAULT, VARIANT_SOFT].includes(variant) ? variant : VARIANT_DEFAULT;
  const host = datasetHost();
  if (host) {
    if (value === VARIANT_DEFAULT) {
      delete host.dataset[THEME_ATTR];
    } else {
      host.dataset[THEME_ATTR] = value;
    }
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch (error) {
  }
}

function getThemeVariant() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if ([VARIANT_DEFAULT, VARIANT_SOFT].includes(stored)) {
      return stored;
    }
  } catch (error) {
  }
  return VARIANT_DEFAULT;
}

function applyStoredVariant() {
  const variant = getThemeVariant();
  setThemeVariant(variant);
}

function setSurfaceVariant(surface) {
  const value = [SURFACE_DEFAULT, SURFACE_FROSTED].includes(surface) ? surface : SURFACE_DEFAULT;
  const host = datasetHost();
  if (host) {
    if (value === SURFACE_DEFAULT) {
      delete host.dataset[SURFACE_ATTR];
    } else {
      host.dataset[SURFACE_ATTR] = value;
    }
  }
  try {
    window.localStorage.setItem(SURFACE_STORAGE_KEY, value);
  } catch (error) {
  }
}

function getSurfaceVariant() {
  try {
    const stored = window.localStorage.getItem(SURFACE_STORAGE_KEY);
    if ([SURFACE_DEFAULT, SURFACE_FROSTED].includes(stored)) {
      return stored;
    }
  } catch (error) {
  }
  return SURFACE_DEFAULT;
}

function applySurfaceVariant() {
  const surface = getSurfaceVariant();
  setSurfaceVariant(surface);
}

function updateDensityDataset(enabled) {
  const host = datasetHost();
  if (!host) {
    return;
  }
  if (enabled) {
    host.dataset[DENSITY_ATTR] = DENSITY_COMPACT;
  } else {
    delete host.dataset[DENSITY_ATTR];
  }
}

function setDensityMode(enabled) {
  updateDensityDataset(enabled);
  try {
    window.localStorage.setItem(DENSITY_STORAGE_KEY, enabled ? DENSITY_COMPACT : "comfortable");
  } catch (error) {
  }
}

function getDensityMode() {
  try {
    return window.localStorage.getItem(DENSITY_STORAGE_KEY) === DENSITY_COMPACT;
  } catch (error) {
  }
  return false;
}

function applyDensityMode() {
  const compact = getDensityMode();
  updateDensityDataset(compact);
}

function syncDensityToggle() {
  const toggle = document.querySelector(`#${PORTAL_ID} [data-density-toggle]`);
  if (toggle) {
    toggle.checked = getDensityMode();
  }
}

function handleEscape(event) {
  if (event.key === "Escape") {
    closeSettings();
  }
}

function initialize() {
  console.info("[ChitChat Extension] initializing content script");
  withRetry(() => {
    const host = datasetHost();
    if (!host) {
      return false;
    }
    host.classList.add("dark");
    ensureThemeStyles();
    applyStoredVariant();
    applySurfaceVariant();
    applyDensityMode();
    ensurePortal();
    document.addEventListener("keydown", handleEscape);
    withRetry(insertGearButton, 400, 80);
    return true;
  }, 200, 50);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}
