// Copyright (C) 2026 Leon Ankert
// SPDX-License-Identifier: AGPL-3.0-or-later
// Full license text: https://www.gnu.org/licenses/agpl-3.0.txt (also in LICENSE)

const GEAR_BUTTON_ID = "chitchat-extension-gear";
const MENU_DROPDOWN_ID = "chitchat-extension-menu-dropdown";
const MENU_OPEN_ATTR = "ccMenuOpen";
const EXPORT_DIALOG_ID = "chitchat-export-dialog";
const EXPORT_OPEN_ATTR = "ccExportOpen";
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
const CUSTOM_DEFAULTS = {
  primary: "#9d4edd",
  accent: "#b5179e"
};
const PRESET_ATTR = "ccPreset";
const PRESET_STORAGE_KEY = "chitchat-extension-theme-preset";
const CUSTOM_COLORS_STORAGE_KEY = "chitchat-extension-custom-colors";
const PRESET_DEFAULT = "purple";
const PRESET_CUSTOM = "custom";
const PRESET_OPTIONS = ["purple", "blue", "orange", "red", "pink", "green", "amoled", PRESET_CUSTOM, "none"];
const PRESET_TOKEN_KEYS = [
  "brightness",
  "brightness-foreground",
  "placeholder",
  "placeholder-foreground",
  "overlay",
  "gradient",
  "background",
  "foreground",
  "panel",
  "panel-foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "accent",
  "accent-foreground",
  "muted",
  "muted-foreground",
  "field",
  "field-foreground",
  "action",
  "action-foreground",
  "destructive",
  "destructive-foreground",
  "warning",
  "warning-foreground",
  "success",
  "success-foreground",
  "border",
  "input",
  "ring"
];

let darkModeObserver = null;

function datasetHost() {
  return document.body || null;
}

function enforceDarkMode(host) {
  if (!host) {
    return;
  }
  const apply = () => {
    host.classList.add("dark");
    host.classList.remove("light");
  };
  apply();
  if (darkModeObserver) {
    darkModeObserver.disconnect();
  }
  darkModeObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.attributeName === "class") {
        if (!host.classList.contains("dark") || host.classList.contains("light")) {
          apply();
        }
        break;
      }
    }
  });
  darkModeObserver.observe(host, { attributes: true, attributeFilter: ["class"] });
}

function formatPresetLabel(preset) {
  if (preset === PRESET_CUSTOM) {
    return "Custom";
  }
  if (preset === "none") {
    return "None";
  }
  if (preset === "amoled") {
    return "AMOLED";
  }
  return preset.charAt(0).toUpperCase() + preset.slice(1);
}

function highlightPresetButtons() {
  const current = getPreset();
  document.querySelectorAll(`#${PORTAL_ID} [data-preset]`).forEach(button => {
    if (button.dataset.preset === current) {
      button.classList.add("is-active");
    } else {
      button.classList.remove("is-active");
    }
  });
}

function getPreset() {
  try {
    const stored = window.localStorage.getItem(PRESET_STORAGE_KEY);
    if (PRESET_OPTIONS.includes(stored)) {
      return stored;
    }
  } catch (error) {
  }
  return PRESET_DEFAULT;
}

function setPreset(preset, options = {}) {
  const { silent = false, skipStore = false } = options;
  const chosen = PRESET_OPTIONS.includes(preset) ? preset : PRESET_DEFAULT;
  ensureThemeStyles();
  const host = datasetHost();
  if (host) {
    if (chosen === PRESET_DEFAULT) {
      delete host.dataset[PRESET_ATTR];
    } else {
      host.dataset[PRESET_ATTR] = chosen;
    }
  }
  if (!skipStore) {
    try {
      window.localStorage.setItem(PRESET_STORAGE_KEY, chosen);
    } catch (error) {
    }
  }
  applyPresetTokens(chosen);
  if (!silent) {
    highlightPresetButtons();
    syncCustomInputs();
    highlightActiveVariant();
    highlightSurfaceVariant();
  }
  syncCustomSectionState();
  return chosen;
}

function applyPreset() {
  const preset = getPreset();
  applyPresetTokens(preset);
}

function applyPresetTokens(preset) {
  const host = datasetHost();
  if (!host) {
    return;
  }
  if (preset === PRESET_CUSTOM) {
    const tokens = buildCustomTokenSet();
    if (!tokens) {
      return;
    }
    Object.entries(tokens).forEach(([token, value]) => {
      // The app consumes tokens as full colors (var(--x)), not bare HSL triplets.
      host.style.setProperty(`--${token}`, `hsl(${value})`);
    });
    host.dataset[PRESET_ATTR] = PRESET_CUSTOM;
    return;
  }
  PRESET_TOKEN_KEYS.forEach(token => {
    host.style.removeProperty(`--${token}`);
  });
  if (preset === "none") {
    // "None" means: don't override the site's own colors. It must NOT tear
    // out theme.css entirely - that stylesheet also carries all the
    // non-color, functional CSS (settings menu layout/visibility, markdown
    // rendering, embed/preview cards, the hidden-badge greyscale, message
    // log styling...), so removing it broke every feature at once, not just
    // the colors. Marking the preset (rather than clearing the attribute,
    // which is indistinguishable from the default/purple preset) lets
    // theme.css itself opt the base color-token blocks out via CSS, while
    // every unrelated rule in the file keeps working normally.
    host.dataset[PRESET_ATTR] = "none";
    delete host.dataset[THEME_ATTR];
    delete host.dataset[SURFACE_ATTR];
    delete host.dataset[DENSITY_ATTR];
  } else if (preset === PRESET_DEFAULT) {
    delete host.dataset[PRESET_ATTR];
  } else {
    host.dataset[PRESET_ATTR] = preset;
  }
}

function getCustomColors() {
  try {
    const stored = window.localStorage.getItem(CUSTOM_COLORS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === "object") {
        return {
          primary: parsed.primary || CUSTOM_DEFAULTS.primary,
          accent: parsed.accent || CUSTOM_DEFAULTS.accent
        };
      }
    }
  } catch (error) {
  }
  return { ...CUSTOM_DEFAULTS };
}

function setCustomColors(colors) {
  try {
    window.localStorage.setItem(CUSTOM_COLORS_STORAGE_KEY, JSON.stringify(colors));
  } catch (error) {
  }
  if (getPreset() === PRESET_CUSTOM) {
    applyPresetTokens(PRESET_CUSTOM);
  }
  syncCustomInputs();
}

function syncCustomInputs() {
  const colors = getCustomColors();
  document.querySelectorAll(`#${PORTAL_ID} [data-custom-color]`).forEach(input => {
    const key = input.dataset.customColor;
    if (colors[key]) {
      input.value = colors[key];
    }
  });
}

function syncCustomSectionState() {
  const section = document.querySelector(`#${PORTAL_ID} [data-custom-section]`);
  if (!section) {
    return;
  }
  const isCustom = getPreset() === PRESET_CUSTOM;
  section.dataset.enabled = isCustom ? "true" : "false";
  section.querySelectorAll("input").forEach(input => {
    input.disabled = !isCustom;
  });
  if (isCustom) {
    syncCustomInputs();
  }
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

function buildMenuButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.id = GEAR_BUTTON_ID;
  button.className = BUTTON_CLASSES;
  button.setAttribute("aria-label", "Open ChitChat extension menu");
  button.setAttribute("aria-haspopup", "menu");
  button.innerHTML = `
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path fill="currentColor" d="M3 6.5A1 1 0 0 1 4 5.5h16a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm0 5.5a1 1 0 0 1 1-1h16a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm1 4.5a1 1 0 1 0 0 2h16a1 1 0 1 0 0-2H4Z"></path>
    </svg>
  `;
  button.addEventListener("click", event => {
    event.stopPropagation();
    toggleMenuDropdown();
  });
  return button;
}

function insertMenuButton() {
  if (document.getElementById(GEAR_BUTTON_ID)) {
    return true;
  }
  const button = buildMenuButton();
  const friendButton = findFriendButton();
  if (friendButton) {
    friendButton.insertAdjacentElement("afterend", button);
    console.info("[ChitChat Extension] menu button inserted next to friend button");
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
  console.info("[ChitChat Extension] menu button inserted using fallback");
  return true;
}

function ensureMenuDropdown() {
  let dropdown = document.getElementById(MENU_DROPDOWN_ID);
  if (dropdown) {
    return dropdown;
  }
  dropdown = document.createElement("div");
  dropdown.id = MENU_DROPDOWN_ID;
  dropdown.setAttribute("role", "menu");
  dropdown.innerHTML = `
    <button type="button" class="chitchat-menu-item" data-menu-action="settings" role="menuitem">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M19.14 12.94a7.07 7.07 0 0 0 .05-.94 7.07 7.07 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.14 7.14 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7.14 7.14 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.66 8.48a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96c.5.38 1.05.7 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.24 1.13-.56 1.63-.94l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64ZM12 15.25a3.25 3.25 0 1 1 0-6.5 3.25 3.25 0 0 1 0 6.5Z"></path></svg>
      <span>Settings</span>
    </button>
    <button type="button" class="chitchat-menu-item" data-menu-action="export" role="menuitem">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 3a1 1 0 0 1 1 1v9.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42l2.3 2.3V4a1 1 0 0 1 1-1ZM5 19a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1Z"></path></svg>
      <span>Export chat</span>
    </button>
  `;
  document.body.appendChild(dropdown);
  dropdown.querySelector('[data-menu-action="settings"]').addEventListener("click", () => {
    closeMenuDropdown();
    openSettings();
  });
  dropdown.querySelector('[data-menu-action="export"]').addEventListener("click", () => {
    closeMenuDropdown();
    openExportDialog();
  });
  dropdown.addEventListener("click", event => event.stopPropagation());
  return dropdown;
}

function positionMenuDropdown() {
  const button = document.getElementById(GEAR_BUTTON_ID);
  const dropdown = document.getElementById(MENU_DROPDOWN_ID);
  if (!button || !dropdown) {
    return;
  }
  const rect = button.getBoundingClientRect();
  const dropdownWidth = dropdown.offsetWidth || 180;
  const left = Math.max(8, Math.min(rect.right - dropdownWidth, window.innerWidth - dropdownWidth - 8));
  dropdown.style.top = `${Math.round(rect.bottom + 6)}px`;
  dropdown.style.left = `${Math.round(left)}px`;
}

function openMenuDropdown() {
  ensureMenuDropdown();
  document.body.dataset[MENU_OPEN_ATTR] = "true";
  positionMenuDropdown();
  document.addEventListener("click", handleOutsideMenuClick, true);
  window.addEventListener("resize", positionMenuDropdown);
  window.addEventListener("scroll", positionMenuDropdown, true);
}

function closeMenuDropdown() {
  document.body.dataset[MENU_OPEN_ATTR] = "false";
  document.removeEventListener("click", handleOutsideMenuClick, true);
  window.removeEventListener("resize", positionMenuDropdown);
  window.removeEventListener("scroll", positionMenuDropdown, true);
}

function toggleMenuDropdown() {
  if (document.body.dataset[MENU_OPEN_ATTR] === "true") {
    closeMenuDropdown();
  } else {
    openMenuDropdown();
  }
}

function handleOutsideMenuClick(event) {
  const dropdown = document.getElementById(MENU_DROPDOWN_ID);
  const button = document.getElementById(GEAR_BUTTON_ID);
  if (dropdown && (dropdown.contains(event.target) || button?.contains(event.target))) {
    return;
  }
  closeMenuDropdown();
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
  const presetButtonsMarkup = PRESET_OPTIONS.map(preset => {
    const label = formatPresetLabel(preset);
    return `<button type="button" data-preset="${preset}">${label}</button>`;
  }).join("");
  portal.innerHTML = `
    <div id="${PANEL_ID}" role="dialog" aria-modal="true" aria-labelledby="${PANEL_ID}-title">
      <div class="chitchat-settings-header">
        <h2 id="${PANEL_ID}-title">Settings</h2>
        <button type="button" class="chitchat-settings-close" aria-label="Close">&times;</button>
      </div>
      <div class="chitchat-settings-tabs">
        <button type="button" class="chitchat-settings-tab is-active" data-tab="theme">Theme</button>
        <button type="button" class="chitchat-settings-tab" data-tab="chat">Chat</button>
        <button type="button" class="chitchat-settings-tab" data-tab="upload">Upload</button>
      </div>
      <div class="chitchat-settings-body">
        <div class="chitchat-settings-tab-panel is-active" data-tab-panel="theme">
          <div class="chitchat-settings-category">
            <div class="chitchat-settings-section">
              <span class="chitchat-settings-label">Color</span>
              <div class="chitchat-settings-options" role="group" aria-label="Color">
                ${presetButtonsMarkup}
              </div>
            </div>
            <div class="chitchat-settings-section chitchat-settings-section--custom" data-custom-section>
              <div class="chitchat-color-controls">
                <label class="chitchat-color-field">
                  <span>Primary</span>
                  <input type="color" value="${CUSTOM_DEFAULTS.primary}" data-custom-color="primary">
                </label>
                <label class="chitchat-color-field">
                  <span>Accent</span>
                  <input type="color" value="${CUSTOM_DEFAULTS.accent}" data-custom-color="accent">
                </label>
                <button type="button" class="chitchat-settings-apply-button" data-apply-custom-colors>Apply</button>
              </div>
            </div>
            <div class="chitchat-settings-section">
              <span class="chitchat-settings-label">Tone</span>
              <div class="chitchat-settings-options" role="group" aria-label="Tone">
                <button type="button" data-variant="${VARIANT_DEFAULT}">Normal</button>
                <button type="button" data-variant="${VARIANT_SOFT}">Soft</button>
              </div>
            </div>
            <div class="chitchat-settings-section">
              <span class="chitchat-settings-label">Surfaces</span>
              <div class="chitchat-settings-options" role="group" aria-label="Surfaces">
                <button type="button" data-surface="${SURFACE_DEFAULT}">Solid</button>
                <button type="button" data-surface="${SURFACE_FROSTED}">Frosted</button>
              </div>
            </div>
            <label class="chitchat-toggle">
              <input type="checkbox" data-density-toggle>
              <span class="chitchat-toggle-slider" aria-hidden="true"></span>
              <span class="chitchat-toggle-text">Compact</span>
            </label>
          </div>
        </div>
        <div class="chitchat-settings-tab-panel" data-tab-panel="chat">
          <div class="chitchat-settings-category">
            <label class="chitchat-toggle">
              <input type="checkbox" data-flag-toggle="links">
              <span class="chitchat-toggle-slider" aria-hidden="true"></span>
              <span class="chitchat-toggle-text">Clickable links</span>
            </label>
            <label class="chitchat-toggle">
              <input type="checkbox" data-flag-toggle="markdown">
              <span class="chitchat-toggle-slider" aria-hidden="true"></span>
              <span class="chitchat-toggle-text">Markdown</span>
            </label>
            <label class="chitchat-toggle">
              <input type="checkbox" data-flag-toggle="youtube">
              <span class="chitchat-toggle-slider" aria-hidden="true"></span>
              <span class="chitchat-toggle-text">YouTube embeds</span>
            </label>
            <label class="chitchat-toggle">
              <input type="checkbox" data-flag-toggle="previews">
              <span class="chitchat-toggle-slider" aria-hidden="true"></span>
              <span class="chitchat-toggle-text">Link previews</span>
            </label>
            <p class="chitchat-settings-hint" data-web-access-status></p>
            <button type="button" class="chitchat-settings-apply-button" data-web-access-grant hidden>Allow website access</button>
            <label class="chitchat-toggle">
              <input type="checkbox" data-flag-toggle="safety">
              <span class="chitchat-toggle-slider" aria-hidden="true"></span>
              <span class="chitchat-toggle-text">Link warnings</span>
            </label>
            <p class="chitchat-settings-hint">Asks before opening links that look risky.</p>
            <label class="chitchat-toggle">
              <input type="checkbox" data-flag-toggle="badges">
              <span class="chitchat-toggle-slider" aria-hidden="true"></span>
              <span class="chitchat-toggle-text">Hidden premium badges</span>
            </label>
            <p class="chitchat-settings-hint">Gray badge for people who hide theirs.</p>
            <label class="chitchat-toggle">
              <input type="checkbox" data-flag-toggle="messagelog">
              <span class="chitchat-toggle-slider" aria-hidden="true"></span>
              <span class="chitchat-toggle-text">Track edits &amp; deletions</span>
            </label>
            <p class="chitchat-settings-hint">Remembers messages so an edit or a deleted message still shows (in red) after a reload. Stored on this device only, per conversation.</p>
            <button type="button" class="chitchat-settings-apply-button" data-clear-message-log>Clear message log</button>
            <p class="chitchat-settings-hint" data-message-log-status></p>
          </div>
        </div>
        <div class="chitchat-settings-tab-panel" data-tab-panel="upload">
          <div class="chitchat-settings-category">
            <label class="chitchat-field">
              <span class="chitchat-settings-label">Upload URL</span>
              <input type="url" class="chitchat-text-input" data-upload-field="uploadBaseUrl" placeholder="${UPLOAD_DEFAULTS.uploadBaseUrl}" spellcheck="false" autocomplete="off">
            </label>
            <label class="chitchat-field">
              <span class="chitchat-settings-label">Link URL</span>
              <input type="url" class="chitchat-text-input" data-upload-field="publicBaseUrl" placeholder="${UPLOAD_DEFAULTS.publicBaseUrl}" spellcheck="false" autocomplete="off">
            </label>
            <label class="chitchat-field">
              <span class="chitchat-settings-label">Password</span>
              <input type="password" class="chitchat-text-input" data-upload-password autocomplete="new-password">
            </label>
            <p class="chitchat-settings-hint" data-upload-password-hint></p>
            <div class="chitchat-add-friend-controls">
              <button type="button" class="chitchat-settings-apply-button" data-upload-save>Save</button>
              <button type="button" class="chitchat-settings-apply-button" data-upload-clear-password>Forget password</button>
            </div>
            <p class="chitchat-settings-hint" data-upload-status></p>
          </div>
        </div>
      </div>
    </div>
  `;
  host.appendChild(portal);
  portal.addEventListener("click", event => {
    if (event.target === portal) {
      closeSettings();
    }
  });

  const tabs = portal.querySelectorAll(".chitchat-settings-tab");
  const tabPanels = portal.querySelectorAll(".chitchat-settings-tab-panel");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("is-active"));
      tab.classList.add("is-active");

      const targetPanel = tab.dataset.tab;
      tabPanels.forEach(panel => {
        if (panel.dataset.tabPanel === targetPanel) {
          panel.classList.add("is-active");
        } else {
          panel.classList.remove("is-active");
        }
      });
    });
  });

  portal.querySelector(".chitchat-settings-close").addEventListener("click", closeSettings);
  portal.querySelectorAll('[data-preset]').forEach(button => {
    button.addEventListener("click", () => {
      setPreset(button.dataset.preset);
    });
  });
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

  let tempCustomColors = getCustomColors();

  portal.querySelectorAll('[data-custom-color]').forEach(input => {
    input.addEventListener("input", event => {
      tempCustomColors[event.target.dataset.customColor] = event.target.value;
    });
  });

  const applyButton = portal.querySelector('[data-apply-custom-colors]');
  if (applyButton) {
    applyButton.addEventListener("click", () => {
      setCustomColors(tempCustomColors);
      setPreset(PRESET_CUSTOM);
    });
  }

  const densityToggle = portal.querySelector('[data-density-toggle]');
  if (densityToggle) {
    densityToggle.addEventListener("change", () => {
      setDensityMode(densityToggle.checked);
      syncDensityToggle();
    });
  }
  portal.querySelectorAll('[data-flag-toggle]').forEach(toggle => {
    toggle.addEventListener("change", () => setFlag(toggle.dataset.flagToggle, toggle.checked));
  });
  const grantButton = portal.querySelector('[data-web-access-grant]');
  if (grantButton) {
    grantButton.addEventListener("click", requestWebsiteAccess);
  }
  const clearLogButton = portal.querySelector('[data-clear-message-log]');
  if (clearLogButton) {
    clearLogButton.addEventListener("click", clearMessageLog);
  }
  syncFlagToggles();
  wireUploadSettings(portal);
  highlightActiveVariant();
  highlightSurfaceVariant();
  highlightPresetButtons();
  syncCustomInputs();
  syncCustomSectionState();
  syncDensityToggle();
  return portal;
}

// ---------------------------------------------------------------------
// Upload settings
// ---------------------------------------------------------------------
// Kept in chrome.storage.local, NOT window.localStorage like the theme
// settings: localStorage belongs to the chitchat.gg page, so the site's own
// scripts could read anything put there. The password must never live there.

const UPLOAD_DEFAULTS = {
  uploadBaseUrl: "https://cp.liforra.de/exported-chats/",
  publicBaseUrl: "https://chats.liforra.de/"
};
const UPLOAD_STORAGE_KEYS = ["uploadBaseUrl", "publicBaseUrl", "uploadPassword"];

function storageGet(keys) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(keys, items => {
        void chrome.runtime.lastError;
        resolve(items || {});
      });
    } catch (error) {
      resolve({});
    }
  });
}

function storageSet(items) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set(items, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
        } else {
          resolve();
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

function storageRemove(keys) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.remove(keys, () => {
        void chrome.runtime.lastError;
        resolve();
      });
    } catch (error) {
      resolve();
    }
  });
}

async function loadUploadSettings() {
  const stored = await storageGet(UPLOAD_STORAGE_KEYS);
  return {
    uploadBaseUrl: stored.uploadBaseUrl || UPLOAD_DEFAULTS.uploadBaseUrl,
    publicBaseUrl: stored.publicBaseUrl || UPLOAD_DEFAULTS.publicBaseUrl,
    hasPassword: Boolean(stored.uploadPassword)
  };
}

function normalizeBaseUrl(value) {
  const url = new URL(String(value || "").trim());
  if (url.protocol !== "https:") {
    throw new Error("URL must start with https://");
  }
  url.search = "";
  url.hash = "";
  if (!url.pathname.endsWith("/")) {
    url.pathname += "/";
  }
  return url.href;
}

async function syncUploadSettings(portal) {
  const settings = await loadUploadSettings();
  portal.querySelectorAll("[data-upload-field]").forEach(input => {
    input.value = settings[input.dataset.uploadField] || "";
  });
  const passwordInput = portal.querySelector("[data-upload-password]");
  if (passwordInput) {
    passwordInput.value = "";
    passwordInput.placeholder = settings.hasPassword ? "Saved (leave blank to keep)" : "";
  }
  const hint = portal.querySelector("[data-upload-password-hint]");
  if (hint) {
    hint.textContent = settings.hasPassword
      ? "Password saved."
      : "No password saved. Use an account that can only write to that folder.";
  }
}

function wireUploadSettings(portal) {
  const status = portal.querySelector("[data-upload-status]");
  const setStatus = text => {
    if (status) {
      status.textContent = text;
    }
  };

  const saveButton = portal.querySelector("[data-upload-save]");
  if (saveButton) {
    saveButton.addEventListener("click", async () => {
      try {
        const update = {};
        portal.querySelectorAll("[data-upload-field]").forEach(input => {
          const raw = input.value.trim();
          update[input.dataset.uploadField] = normalizeBaseUrl(raw || UPLOAD_DEFAULTS[input.dataset.uploadField]);
        });
        const password = portal.querySelector("[data-upload-password]").value;
        if (password) {
          update.uploadPassword = password;
        }
        await storageSet(update);
        await syncUploadSettings(portal);
        setStatus("Saved.");
      } catch (error) {
        setStatus(`Not saved: ${error.message}`);
      }
    });
  }

  const clearButton = portal.querySelector("[data-upload-clear-password]");
  if (clearButton) {
    clearButton.addEventListener("click", async () => {
      await storageRemove(["uploadPassword"]);
      await syncUploadSettings(portal);
      setStatus("Password removed.");
    });
  }

  syncUploadSettings(portal);
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

function openSettings() {
  const portal = ensurePortal();
  if (portal) {
    syncUploadSettings(portal);
    syncFlagToggles();
  }
  highlightPresetButtons();
  highlightActiveVariant();
  highlightSurfaceVariant();
  syncCustomInputs();
  syncCustomSectionState();
  syncDensityToggle();
  closeMenuDropdown();
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
  applyPresetTokens(getPreset());
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
  applyPresetTokens(getPreset());
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
    closeMenuDropdown();
    closeExportDialog();
  }
}



function hexToHsl(hex) {
  let normalized = hex.replace(/[^0-9a-f]/gi, "").toLowerCase();
  if (normalized.length === 3) {
    normalized = normalized.split("").map(ch => ch + ch).join("");
  }
  if (normalized.length !== 6) {
    return { h: 0, s: 0, l: 0 };
  }
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case r:
        h = (g - b) / delta + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / delta + 2;
        break;
      case b:
        h = (r - g) / delta + 4;
        break;
    }
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

function hslToString(hsl) {
  return `${hsl.h} ${hsl.s}% ${hsl.l}%`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function adjustLightness(hsl, delta) {
  return {
    h: hsl.h,
    s: hsl.s,
    l: clamp(hsl.l + delta, 0, 100)
  };
}

function chooseForeground(lightness) {
  return lightness > 60 ? "0 0% 12%" : "0 0% 100%";
}

function buildCustomTokenSet() {
  const colors = getCustomColors();
  const primaryHsl = hexToHsl(colors.primary);
  const accentHsl = hexToHsl(colors.accent);
  const background = {
    h: primaryHsl.h,
    s: clamp(Math.round(primaryHsl.s * 0.45), 16, 48),
    l: 12
  };
  const foreground = {
    h: primaryHsl.h,
    s: clamp(Math.round(primaryHsl.s * 0.35), 20, 58),
    l: 88
  };
  const panel = { ...background, l: clamp(background.l + 4, 0, 100) };
  const card = { ...background, l: clamp(background.l + 6, 0, 100) };
  const popover = { ...background, l: clamp(background.l + 8, 0, 100) };
  const secondaryHsl = adjustLightness(primaryHsl, -10);
  const mutedHsl = adjustLightness(primaryHsl, -18);
  const borderHsl = adjustLightness(primaryHsl, -32);
  const fieldHsl = { ...background, l: clamp(background.l + 10, 0, 100) };
  const actionHsl = { ...background, l: clamp(background.l + 14, 0, 100) };
  const overlayHsl = adjustLightness(background, -6);
  const placeholderHsl = { ...background, l: clamp(background.l + 8, 0, 100) };
  return {
    brightness: "0 0% 0%",
    "brightness-foreground": "0 0% 100%",
    gradient: hslToString(primaryHsl),
    overlay: hslToString(overlayHsl),
    background: hslToString(foreground),
    foreground: hslToString(foreground),
    panel: hslToString(panel),
    "panel-foreground": hslToString(foreground),
    card: hslToString(card),
    "card-foreground": hslToString(foreground),
    popover: hslToString(popover),
    "popover-foreground": hslToString(foreground),
    placeholder: hslToString(placeholderHsl),
    "placeholder-foreground": hslToString(adjustLightness(foreground, -8)),
    primary: hslToString(primaryHsl),
    "primary-foreground": chooseForeground(primaryHsl.l),
    secondary: hslToString(secondaryHsl),
    "secondary-foreground": chooseForeground(secondaryHsl.l),
    accent: hslToString(accentHsl),
    "accent-foreground": chooseForeground(accentHsl.l),
    muted: hslToString(mutedHsl),
    "muted-foreground": chooseForeground(mutedHsl.l),
    field: hslToString(fieldHsl),
    "field-foreground": chooseForeground(fieldHsl.l),
    action: hslToString(actionHsl),
    "action-foreground": chooseForeground(actionHsl.l),
    destructive: "350 82% 60%",
    "destructive-foreground": "0 0% 100%",
    warning: "40 92% 58%",
    "warning-foreground": "40 96% 16%",
    success: "150 62% 48%",
    "success-foreground": "0 0% 100%",
    border: hslToString(borderHsl),
    input: hslToString(adjustLightness(borderHsl, 6)),
    ring: hslToString(primaryHsl)
  };
}

function injectAddFriendForm(panel) {
  if (panel.querySelector('.add-friend-form')) {
    return; // Already injected
  }

  // Laid out like one of the panel's own request rows: an icon where the
  // avatar goes, a bold title, a muted line under it, then the controls.
  const form = document.createElement('div');
  form.className = 'add-friend-form';
  form.innerHTML = `
    <div class="add-friend-icon" aria-hidden="true">
      <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor">
        <circle cx="6.5" cy="4.5" r="2.75"></circle>
        <path d="M1 13c0-2.5 2.4-4 5.5-4s5.5 1.5 5.5 4v.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5z"></path>
        <path d="M13 3a.6.6 0 0 1 .6.6V5h1.4a.6.6 0 0 1 0 1.2h-1.4v1.4a.6.6 0 0 1-1.2 0V6.2h-1.4a.6.6 0 0 1 0-1.2h1.4V3.6A.6.6 0 0 1 13 3z"></path>
      </svg>
    </div>
    <div class="add-friend-body">
      <div class="add-friend-title">Add a friend by ID</div>
      <div class="add-friend-sub">Send a friend request using someone's user ID.</div>
      <div class="add-friend-controls">
        <input type="text" placeholder="User ID" class="add-friend-input" spellcheck="false" autocomplete="off" aria-label="User ID">
        <button type="button" class="add-friend-button">Add</button>
      </div>
      <div class="add-friend-status" role="status" aria-live="polite"></div>
    </div>
  `;

  panel.appendChild(form);

  const button = form.querySelector('.add-friend-button');
  const input = form.querySelector('.add-friend-input');
  const status = form.querySelector('.add-friend-status');

  // Reuse the panel's own "Accept" button styling, so this is the same
  // component rather than an imitation of it. Falls back to the extension's
  // own button style when there are no requests (and so no Accept button).
  const accept = Array.from(panel.querySelectorAll('button'))
    .find(candidate => !form.contains(candidate) && /^accept$/i.test(candidate.textContent.trim()));
  if (accept && accept.className) {
    button.className = `${accept.className} add-friend-button`;
  }

  let statusTimer = null;
  const showStatus = (text, kind) => {
    status.textContent = text;
    status.dataset.kind = kind || "";
    clearTimeout(statusTimer);
    if (text) {
      statusTimer = setTimeout(() => { status.textContent = ""; status.dataset.kind = ""; }, 8000);
    }
  };

  const submit = async () => {
    const userId = input.value.trim();
    if (!userId) {
      showStatus("Enter a user ID first.", "error");
      input.focus();
      return;
    }
    button.disabled = true;
    showStatus("Sending…", "");
    try {
      await sendFriendRequest(userId);
      showStatus("Friend request sent.", "success");
      input.value = "";
    } catch (error) {
      showStatus(`Couldn't send: ${error.message}`, "error");
      console.error("[ChitChat Extension] API Error:", error);
    } finally {
      button.disabled = false;
    }
  };

  button.addEventListener('click', submit);
  input.addEventListener('keydown', event => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
    // The panel is a popover: don't let typing be treated as its shortcuts.
    event.stopPropagation();
  });
}

// Same call the site itself makes for "add friend" (PUT users/me/relationships/<id>
// with action PENDING_OUTGOING = 2). It has to run from here, in the page's
// own context, rather than from the background script: the API authenticates
// with the site's session cookie, and a request from the extension's own
// origin doesn't carry it, which is what produced "Unauthorized".
const FRIEND_API_BASE = "https://api.chitchat.gg";
const RELATIONSHIP_PENDING_OUTGOING = 2;

async function sendFriendRequest(userId) {
  const response = await fetch(`${FRIEND_API_BASE}/users/me/relationships/${encodeURIComponent(userId)}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: RELATIONSHIP_PENDING_OUTGOING })
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
  }
  if (!response.ok) {
    const detail = (payload && payload.message) || response.statusText || `HTTP ${response.status}`;
    throw new Error(response.status === 401 ? `${detail} (are you logged in to ChitChat in this tab?)` : detail);
  }
  return payload;
}

// The site's UI framework changed since this was first written (Radix ->
// a Base UI-based component set), so the old `div[data-state="open"][role="dialog"]`
// selector no longer matches anything. Rather than pin to another
// framework-specific attribute that can drift again, the panel is recognised
// by its visible title instead. Matching on "any dialog that mentions friend
// requests" was far too loose: it also hit the user popout ("Cancel friend
// request") and the privacy settings ("Allow friend requests"). So this needs
// ALL of: the heading text is exactly "Friend Requests", that heading sits at
// the top of the container it's injected into, and it only runs for a few
// seconds after the friend button was clicked.
const FRIEND_PANEL_TITLE_RE = /^friend requests$/i;
const DIALOG_LIKE_SELECTOR = '[role="dialog"], [role="menu"], [data-open], [data-state], [data-slot$="content"], [data-slot$="popup"]';

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return false;
  }
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }
  // Popovers/dialogs (including this extension's own) are commonly kept in
  // normal layout while closed and hidden purely via opacity/pointer-events,
  // which the checks above don't catch.
  if (parseFloat(style.opacity) === 0 || style.pointerEvents === "none") {
    return false;
  }
  return true;
}

// True if `el` contains a visible text node that is exactly the panel title,
// positioned near the top of `el` (a title label buried lower in a big
// dialog, like a settings row, doesn't count).
function hasFriendPanelTitle(el) {
  const elTop = el.getBoundingClientRect().top;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!FRIEND_PANEL_TITLE_RE.test(node.data.trim())) {
      continue;
    }
    const heading = node.parentElement;
    if (heading && isVisible(heading) && heading.getBoundingClientRect().top - elTop < 100) {
      return true;
    }
  }
  return false;
}

function findFriendRequestsPanel() {
  const candidates = Array.from(document.querySelectorAll(DIALOG_LIKE_SELECTOR));
  let best = null;
  for (const el of candidates) {
    if (!isVisible(el) || !hasFriendPanelTitle(el)) {
      continue;
    }
    if (!best || el.textContent.length < best.textContent.length) {
      best = el;
    }
  }
  return best;
}

function tryInjectFriendForm() {
  // Checked globally, not just within whichever panel this call resolves
  // to: two nested elements (e.g. a popover wrapper and its inner content
  // wrapper) can both match the text/visibility checks above, and which one
  // "wins" the smallest-textContent tie can flip between calls once the
  // first injected form changes that element's textContent length. Gating
  // on a single document-wide instance makes the outcome path-independent
  // instead of trying to make every caller agree on the same element.
  const existing = document.querySelector(".add-friend-form");
  if (existing && existing.isConnected && isVisible(existing)) {
    return true;
  }
  const panel = findFriendRequestsPanel();
  if (!panel) {
    return false;
  }
  injectAddFriendForm(panel);
  return true;
}

// True if `button` is the header's friend-requests button (the one whose
// click opens the panel), recognised by its icon.
function isFriendButton(button) {
  return Array.from(button.querySelectorAll("svg path")).some(
    path => (path.getAttribute("d") || "").includes(FRIEND_ICON_SIGNATURE)
  );
}

function initializeAddFriendFeature() {
  // Only look for the panel for a few seconds after that button is clicked,
  // instead of watching the whole page for anything that mentions friend
  // requests. One delegated listener (rather than one attached to the button
  // itself) so it keeps working if the site re-renders and replaces the
  // button. Polling covers a panel that renders a beat after the click, or
  // whose request list loads asynchronously.
  document.addEventListener("click", event => {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    if (button && isFriendButton(button)) {
      withRetry(tryInjectFriendForm, 250, 20);
    }
  }, true);
}

// ---------------------------------------------------------------------
// Chat export
// ---------------------------------------------------------------------
// This reads whatever is currently rendered in the message list. Chat
// history loads incrementally as you scroll, so only messages that have
// already been loaded into the DOM are captured — scroll up first to pull
// older messages in before exporting a fuller history.

function getMessageListRoot() {
  return document.querySelector("ol.chat-scrollbar") || document.querySelector('ol[class*="chat-scrollbar"]');
}

function countMessageRows(root) {
  return root.querySelectorAll(":scope > li").length;
}

// Resolves once the row count changes, or after timeoutMs - used only to
// wait roughly long enough for a scroll-triggered load to settle before the
// next capture, not as a signal of how much history is left (see below).
function waitForRowCountChange(root, previousCount, timeoutMs) {
  return new Promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      observer.disconnect();
      clearTimeout(timer);
      resolve();
    };
    const observer = new MutationObserver(() => {
      if (countMessageRows(root) !== previousCount) {
        finish();
      }
    });
    observer.observe(root, { childList: true });
    const timer = setTimeout(finish, timeoutMs);
  });
}

// The site appends a small gray "(edited)" <span> INSIDE an edited message's
// text. It's a label, not part of what was written, so it must stay out of
// anything parsed (markdown, link detection) or exported as message text.
// (An unclosed ** in the message would otherwise swallow it and format it.)
function findEditedIndicators(container) {
  return Array.from(container.querySelectorAll("span")).filter(span => {
    if (span.children.length > 0 || span.textContent.trim() !== "(edited)") {
      return false;
    }
    // Its own styling, or failing that, sitting at the very end of the text.
    return /text-neutral-400|text-3xs/.test(span.className)
      || container.textContent.trimEnd().endsWith("(edited)");
  });
}

// `skip` is an optional Set of elements whose text to leave out.
function extractNodeText(node, skip) {
  let out = "";
  node.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent;
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      if (skip && skip.has(child)) {
        return;
      }
      if (child.tagName === "BR") {
        out += "\n";
      } else if (child.tagName === "IMG" && child.alt) {
        // Emoji are often rendered as small inline <img> (Twemoji); fall
        // back to the alt text so the export still contains the character.
        out += child.alt;
      } else if (child.tagName === "A" && child.href) {
        // Keep the URL even when the link text doesn't already show it,
        // so links don't silently disappear from the plain-text exports.
        const linkText = extractNodeText(child, skip);
        out += linkText.includes(child.href) ? linkText : `${linkText} (${child.href})`;
      } else {
        out += extractNodeText(child, skip);
      }
    }
  });
  return out;
}

// The site renders real attachments with these alt texts (regular uploads and
// GIF-picker results). Everything else that's an <img> in a row is either the
// author's avatar, an inline emoji inside the message text, or the small
// avatar in a reply preview - none of which are attachments.
const ATTACHMENT_IMG_ALTS = new Set(["Attachment", "Klippy GIF"]);

// Avatar image URLs carry the owner's user id: the last path segment is the
// base64url of "s3://<bucket>/avatars/<24-hex user id>/<file>". Returns null
// for anyone without a custom avatar or if the URL format ever changes.
function userIdFromAvatarUrl(url) {
  try {
    const last = new URL(url).pathname.split("/").pop() || "";
    let b64 = last.replace(/\.[a-z0-9]+$/i, "").replace(/-/g, "+").replace(/_/g, "/");
    b64 += "=".repeat((4 - (b64.length % 4)) % 4);
    const match = atob(b64).match(/\/avatars\/([0-9a-f]{24})\//i);
    return match ? match[1].toLowerCase() : null;
  } catch (error) {
    return null;
  }
}

// Parses a single <li> into a message record, or null for placeholder/spacer
// rows with nothing to export. `author` is only set when this row has its own
// header (the first message of a same-author/same-day run) - grouped
// continuation rows come back with author: null, resolved later in
// finalizeMessages() once every row that will ever have one has been seen.
function parseMessageRow(li) {
  const textEl = li.querySelector("p[data-from]");
  const timeEl = li.querySelector("time[datetime]");
  const headerEl = li.querySelector("h3");

  const editedNodes = textEl ? findEditedIndicators(textEl) : [];
  const text = textEl ? extractNodeText(textEl, new Set(editedNodes)).trim() : "";

  // Ignore images inside the message text itself (Twemoji glyphs - already
  // represented in `text` via their alt).
  // Also ignore anything this extension added under the message (embed and
  // preview thumbnails) - those are not the author's avatar or attachments.
  const rowImgs = Array.from(li.querySelectorAll("img"))
    .filter(img => !(textEl && textEl.contains(img)) && !img.closest(".cc-enhanced"));
  const attachmentImgs = rowImgs.filter(img => ATTACHMENT_IMG_ALTS.has(img.alt));
  const videos = Array.from(li.querySelectorAll("video"));
  // Lazy-loaded attachments have an empty src until scrolled into view, so
  // count the slots separately from the URLs we actually managed to read.
  const attachmentSlots = attachmentImgs.length + videos.length;
  const attachments = [
    ...attachmentImgs.map(img => ({ type: "image", url: img.currentSrc || img.src || "" })),
    ...videos.map(video => ({ type: "video", url: video.currentSrc || video.src || video.querySelector("source")?.src || "" }))
  ].filter(a => a.url);

  if (!text && attachmentSlots === 0) {
    return null;
  }

  // The reply-preview avatar sits inside a <button>; the row's own avatar
  // (only present on header rows) is the first remaining non-attachment image.
  const avatarImg = rowImgs.find(img => !ATTACHMENT_IMG_ALTS.has(img.alt) && img.alt !== "banner" && !img.closest("button"));
  const avatar = avatarImg ? (avatarImg.currentSrc || avatarImg.src || null) : null;

  let author = null;
  if (headerEl) {
    const clone = headerEl.cloneNode(true);
    clone.querySelectorAll("time").forEach(t => t.remove());
    author = (clone.textContent || "").trim().replace(/\s+/g, " ") || null;
  }

  const rawId = textEl ? textEl.dataset.from : "";
  const timestampISO = timeEl ? timeEl.getAttribute("datetime") : null;
  // Unsent/optimistic messages can render with an empty data-from before the
  // server assigns a real id; fall back to a content-based key so they still
  // dedupe correctly across scroll passes instead of being captured twice.
  const id = rawId || `t:${timestampISO || ""}:${text.slice(0, 40)}`;

  return {
    id,
    author,
    avatar,
    timestampISO,
    timestampText: timeEl ? timeEl.textContent.trim() : "",
    text,
    edited: editedNodes.length > 0,
    attachments,
    attachmentSlots
  };
}

// Merges freshly-parsed rows into the running accumulator. Returns how many
// were genuinely new, which is what the caller uses to decide when to stop -
// not the DOM's current row count (see loadFullChatHistory for why).
function captureVisibleMessages(root, accumulator, orderRef) {
  const items = Array.from(root.querySelectorAll(":scope > li"));
  let added = 0;
  items.forEach(li => {
    const parsed = parseMessageRow(li);
    if (!parsed) {
      return;
    }
    const existing = accumulator.get(parsed.id);
    if (!existing) {
      accumulator.set(parsed.id, { ...parsed, order: orderRef.value++ });
      added += 1;
      return;
    }
    // A header only appears on the first message of a run; prefer whichever
    // observation actually had one over one that didn't, and refresh the
    // rest in case content changed between passes (e.g. an edit).
    // Attachments are unioned by URL, never replaced: a row that has scrolled
    // out of view can report an empty (not-yet-loaded) src on a later pass,
    // and that must not wipe out a URL an earlier pass already read.
    const mergedAttachments = [...existing.attachments];
    parsed.attachments.forEach(a => {
      if (!mergedAttachments.some(e => e.url === a.url)) {
        mergedAttachments.push(a);
      }
    });
    accumulator.set(parsed.id, {
      ...existing,
      text: parsed.text,
      attachments: mergedAttachments,
      attachmentSlots: Math.max(existing.attachmentSlots || 0, parsed.attachmentSlots || 0),
      edited: parsed.edited,
      timestampISO: parsed.timestampISO || existing.timestampISO,
      timestampText: parsed.timestampText || existing.timestampText,
      author: parsed.author || existing.author,
      avatar: parsed.avatar || existing.avatar
    });
  });
  return added;
}

function finalizeMessages(accumulator) {
  const list = Array.from(accumulator.values());
  list.sort((a, b) => {
    const ta = a.timestampISO ? Date.parse(a.timestampISO) : NaN;
    const tb = b.timestampISO ? Date.parse(b.timestampISO) : NaN;
    if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) {
      return ta - tb;
    }
    if (!Number.isNaN(ta) !== !Number.isNaN(tb)) {
      return Number.isNaN(ta) ? 1 : -1;
    }
    return a.order - b.order;
  });

  // Grouped/continuation messages never carry their own author - fill them
  // in from the nearest earlier message that did, mirroring how the site
  // itself only shows a header at the start of each same-author run.
  let lastAuthor = null;
  let lastAvatar = null;
  list.forEach(msg => {
    if (msg.author) {
      lastAuthor = msg.author;
      lastAvatar = msg.avatar || lastAvatar;
    } else {
      msg.author = lastAuthor || "Unknown";
      msg.avatar = msg.avatar || lastAvatar || null;
    }
  });

  return list.map(({ order, ...rest }) => rest);
}

async function scrollToLoadMore(root, direction, accumulator, orderRef, onProgress) {
  const MAX_ROUNDS = 400;
  const MAX_MS = 90000;
  const ROUND_TIMEOUT_MS = 1500;
  const SETTLE_DELAY_MS = 150;
  const startedAt = Date.now();
  let rounds = 0;
  let stableRounds = 0;
  let timedOut = false;

  while (stableRounds < 2) {
    if (rounds >= MAX_ROUNDS || Date.now() - startedAt > MAX_MS) {
      timedOut = true;
      break;
    }
    rounds += 1;

    const beforeCount = countMessageRows(root);
    root.scrollTop = direction === "top" ? 0 : root.scrollHeight;
    await waitForRowCountChange(root, beforeCount, ROUND_TIMEOUT_MS);
    await new Promise(resolve => setTimeout(resolve, SETTLE_DELAY_MS));

    // Capture unconditionally, regardless of whether the row count itself
    // changed: the site keeps only a sliding window of messages mounted and
    // evicts rows from the opposite end as new ones load in, so DOM size can
    // shrink, grow, or bounce between two values even while genuinely new
    // (never-before-seen) messages keep arriving. Tracking distinct message
    // ids instead of DOM row count is what makes this immune to that.
    const added = captureVisibleMessages(root, accumulator, orderRef);
    if (onProgress) {
      onProgress(accumulator.size);
    }
    stableRounds = added > 0 ? 0 : stableRounds + 1;
  }

  return { rounds, timedOut };
}

async function loadFullChatHistory(root, onProgress) {
  const accumulator = new Map();
  const orderRef = { value: 0 };

  // Capture whatever's already loaded before touching scroll position at all.
  captureVisibleMessages(root, accumulator, orderRef);
  if (onProgress) {
    onProgress(accumulator.size);
  }

  // Older history first (the common case: the chat is opened at the bottom).
  // Then newer history, in case the view wasn't already at the very bottom.
  // Deliberately sequential rather than interleaved per round - bouncing
  // scroll direction every round seemed to be part of what confused the
  // site's own pagination into oscillating instead of making progress.
  //
  // Message enhancements (markdown, embeds, link previews) are switched off
  // while this scrolls: they'd otherwise start fetching previews for every
  // message that flies past, for nothing.
  enhancementsPaused = true;
  try {
    const older = await scrollToLoadMore(root, "top", accumulator, orderRef, onProgress);
    const newer = await scrollToLoadMore(root, "bottom", accumulator, orderRef, onProgress);

    // Leave the chat where a user would expect it: at the most recent message.
    root.scrollTop = root.scrollHeight;

    return {
      messages: finalizeMessages(accumulator),
      timedOut: older.timedOut || newer.timedOut
    };
  } finally {
    enhancementsPaused = false;
    scheduleMessageScan();
  }
}

function guessConversationTitle() {
  try {
    const title = (document.title || "").trim();
    if (title && !/^chitchat$/i.test(title)) {
      return title;
    }
  } catch (error) {
  }
  return null;
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function sanitizeFilenamePart(text) {
  return (text || "chat").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "chat";
}

function buildExportFilename(extension, meta) {
  const date = new Date().toISOString().slice(0, 10);
  const who = sanitizeFilenamePart(meta.title);
  return `chitchat-${who}-${date}.${extension}`;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatClock(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function formatDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatUtcOffset(d) {
  const minutes = -d.getTimezoneOffset();
  const abs = Math.abs(minutes);
  return `UTC${minutes >= 0 ? "+" : "-"}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

// e.g. "2026-09-24 18:57:53 UTC+02:00" (24-hour, local time, with seconds)
function formatDateTime(d) {
  return `${formatDate(d)} ${formatClock(d)} ${formatUtcOffset(d)}`;
}

function parseMessageDate(message) {
  const t = Date.parse(message.timestampISO || "");
  return Number.isNaN(t) ? null : new Date(t);
}

function messageClock(message) {
  const d = parseMessageDate(message);
  return d ? formatClock(d) : message.timestampText;
}

function messageDateTime(message) {
  const d = parseMessageDate(message);
  return d ? `${formatDate(d)} ${formatClock(d)}` : message.timestampText;
}

// One entry per distinct author. The id comes from the avatar URL, so it's
// null for anyone without a custom avatar.
function collectParticipants(messages) {
  const byName = new Map();
  messages.forEach(message => {
    if (!message.author || message.author === "Unknown") {
      return;
    }
    let participant = byName.get(message.author);
    if (!participant) {
      participant = { name: message.author, id: null, avatar: null };
      byName.set(message.author, participant);
    }
    if (!participant.avatar && message.avatar) {
      participant.avatar = message.avatar;
      participant.id = userIdFromAvatarUrl(message.avatar);
    }
  });
  return Array.from(byName.values());
}

function sendRuntimeMessage(message) {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage(message, response => {
        void chrome.runtime.lastError;
        resolve(response || null);
      });
    } catch (error) {
      resolve(null);
    }
  });
}

// Version plus a SHA-256 over the extension's own files (computed in the
// background script, which can read them all). It identifies which build
// produced an export; it is self-reported, not a signature.
async function getExtensionInfo() {
  const response = await sendRuntimeMessage({ action: "getExtensionInfo" });
  return response && response.success ? response : null;
}

// Fetches chitchat.gg-hosted images via the background script and returns a
// url -> data: URI map, so the exported file doesn't depend on the CDN's
// signed (expiring) image URLs. Anything that fails just stays a remote link.
async function inlineImages(urls) {
  const MAX_TOTAL_CHARS = 40 * 1024 * 1024;
  const queue = Array.from(new Set(urls)).filter(url => {
    try {
      const host = new URL(url).hostname;
      return host === "chitchat.gg" || host.endsWith(".chitchat.gg");
    } catch (error) {
      return false;
    }
  });
  const result = new Map();
  let total = 0;
  let next = 0;
  const worker = async () => {
    while (next < queue.length && total < MAX_TOTAL_CHARS) {
      const url = queue[next++];
      const response = await sendRuntimeMessage({ action: "fetchImageDataUrl", url });
      if (response && response.success) {
        total += response.dataUrl.length;
        result.set(url, response.dataUrl);
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return result;
}

function missingAttachmentCount(message) {
  return Math.max(0, (message.attachmentSlots || 0) - message.attachments.length);
}

function buildExportNote(meta) {
  if (meta.possiblyIncomplete) {
    return "Export scrolled through the conversation to load its full history, but hit a safety limit (time or round cap) before it stopped finding new messages - this export may be missing some older or newer messages. Running Export again may pick up more.";
  }
  return "Export scrolled through the conversation to load its full history before exporting; this should be the whole loaded conversation, but a very slow connection could still have cut it short.";
}

function extensionSummary(meta) {
  return meta.extension
    ? `ChitChat Theme v${meta.extension.version}, SHA-256 ${meta.extension.hash}`
    : "ChitChat Theme (version/hash unavailable)";
}

function buildJsonExport(messages, meta) {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    exportedAtLocal: formatDateTime(meta.exportedAt),
    conversationTitle: meta.title || null,
    participants: meta.participants.map(p => ({ name: p.name, id: p.id })),
    messageCount: messages.length,
    extension: meta.extension
      ? { name: "ChitChat Theme", version: meta.extension.version, sha256: meta.extension.hash, files: meta.extension.files }
      : null,
    note: buildExportNote(meta),
    messages: messages.map(m => ({
      id: m.id,
      author: m.author,
      timestamp: m.timestampISO,
      timestampLocal: messageDateTime(m),
      timestampDisplay: m.timestampText,
      edited: Boolean(m.edited),
      text: m.text,
      attachments: m.attachments,
      attachmentsNotLoaded: missingAttachmentCount(m)
    }))
  }, null, 2);
}

function buildMarkdownExport(messages, meta) {
  const lines = [];
  lines.push(`# Chat export${meta.title ? `: ${meta.title}` : ""}`);
  lines.push("");
  lines.push(`- **Exported:** ${formatDateTime(meta.exportedAt)}`);
  meta.participants.forEach((p, index) => {
    lines.push(`- **User ${index + 1}:** ${p.name} (id: ${p.id || "unknown"})`);
  });
  lines.push(`- **Messages:** ${messages.length}`);
  lines.push(`- **Extension:** ${extensionSummary(meta)}`);
  lines.push("");
  lines.push(`_${buildExportNote(meta)}_`);
  lines.push("");
  lines.push("---");
  lines.push("");

  let lastAuthor = null;
  messages.forEach(message => {
    if (message.author !== lastAuthor) {
      lines.push(`**${message.author}** — _${messageDateTime(message)}_`);
      lastAuthor = message.author;
    } else {
      lines.push(`_${messageClock(message)}_`);
    }
    if (message.text) {
      lines.push(message.edited ? `${message.text} _(edited)_` : message.text);
    }
    message.attachments.forEach(attachment => {
      lines.push(attachment.type === "video" ? `[video attachment](${attachment.url})` : `![attachment](${attachment.url})`);
    });
    for (let i = 0; i < missingAttachmentCount(message); i += 1) {
      lines.push("_[attachment not loaded]_");
    }
    lines.push("");
  });

  return lines.join("\n");
}

async function fetchTextSafe(url) {
  try {
    const response = await fetch(url, { credentials: "omit" });
    if (!response.ok) {
      return "";
    }
    return await response.text();
  } catch (error) {
    return "";
  }
}

function escapeHtmlAttr(text) {
  return String(text || "").replace(/[&"<>]/g, ch => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" }[ch]));
}

function escapeHtmlText(text) {
  return String(text || "").replace(/[&<>]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]));
}

// A message's text for the HTML export: rendered markdown when it has any
// (the same renderer as live chat), otherwise plain text with links.
function renderExportText(text, edited) {
  // Outside the markdown, so nothing in the message can format it.
  const editedHtml = edited ? ' <span class="cc-export-edited">(edited)</span>' : "";
  if (getFlag("markdown") && mdHasMarkup(text)) {
    const blocks = mdParse(text);
    if (!mdIsPlain(blocks)) {
      return `<div class="dark:text-message cc-export-text cc-export-md">${mdRenderHtml(blocks)}${editedHtml}</div>`;
    }
  }
  return `<p class="dark:text-message cc-export-text">${linkifyToHtml(text)}${editedHtml}</p>`;
}

// Same idea as the site: a header row (avatar, name, time) starts each run,
// and consecutive messages from the same author within a few minutes are
// compact rows that only show their time on hover. A new local day also
// starts a new run and gets a date divider.
const RUN_GAP_MS = 7 * 60 * 1000;

function renderMessagesHtml(messages, dataUrls) {
  const resolve = url => dataUrls.get(url) || url;
  let previous = null;
  let previousDate = null;
  const parts = [];

  messages.forEach(message => {
    const date = parseMessageDate(message);
    const dayKey = date ? formatDate(date) : null;
    const dayChanged = Boolean(dayKey) && dayKey !== previousDate;
    if (dayChanged) {
      parts.push(`<li class="cc-export-day"><span>${escapeHtmlText(dayKey)}</span></li>`);
    }

    const gapExceeded = Boolean(previous && date && parseMessageDate(previous)
      && date.getTime() - parseMessageDate(previous).getTime() > RUN_GAP_MS);
    const startsRun = !previous || previous.author !== message.author || dayChanged || gapExceeded;

    const attachmentsHtml = message.attachments.map(a => (
      a.type === "video"
        ? `<video controls src="${escapeHtmlAttr(a.url)}" class="cc-export-attachment"></video>`
        : `<img src="${escapeHtmlAttr(resolve(a.url))}" alt="attachment" class="cc-export-attachment">`
    )).join("")
      + Array.from({ length: missingAttachmentCount(message) }, () => '<div class="cc-export-missing">Attachment not loaded</div>').join("");
    const textHtml = message.text ? renderExportText(message.text, message.edited) : "";
    const timeAttr = escapeHtmlAttr(message.timestampISO || "");

    if (startsRun) {
      const avatarHtml = message.avatar
        ? `<img src="${escapeHtmlAttr(resolve(message.avatar))}" alt="" class="rounded-full cc-export-avatar">`
        : '<div class="cc-export-avatar cc-export-avatar--placeholder"></div>';
      parts.push(`
    <li class="cc-export-row cc-export-row--start">
      <div class="cc-export-gutter">${avatarHtml}</div>
      <div class="cc-export-body">
        <h3 class="cc-export-name">${escapeHtmlText(message.author)}<time datetime="${timeAttr}" class="cc-export-time">${escapeHtmlText(messageClock(message))}</time></h3>
        ${textHtml}${attachmentsHtml}
      </div>
    </li>`);
    } else {
      parts.push(`
    <li class="cc-export-row">
      <div class="cc-export-gutter"><time datetime="${timeAttr}" class="cc-export-hovertime">${escapeHtmlText(messageClock(message))}</time></div>
      <div class="cc-export-body">${textHtml}${attachmentsHtml}</div>
    </li>`);
    }

    previous = message;
    if (dayKey) {
      previousDate = dayKey;
    }
  });

  return parts.join("\n");
}

function renderExportHeaderHtml(messages, meta) {
  const participantsHtml = meta.participants.map((p, index) => `
      <div class="cc-export-meta-row"><dt>User ${index + 1}</dt><dd>${escapeHtmlText(p.name)} <span class="cc-export-id">${escapeHtmlText(p.id || "id unknown")}</span></dd></div>`).join("");
  const first = messages.length ? parseMessageDate(messages[0]) : null;
  const last = messages.length ? parseMessageDate(messages[messages.length - 1]) : null;
  const span = first && last ? `${formatDateTime(first)} → ${formatDateTime(last)}` : "";
  return `
  <header class="cc-export-header">
    <div class="cc-export-title">Chat export</div>
    <dl class="cc-export-meta">
      <div class="cc-export-meta-row"><dt>Exported</dt><dd>${escapeHtmlText(formatDateTime(meta.exportedAt))}</dd></div>${participantsHtml}
      <div class="cc-export-meta-row"><dt>Messages</dt><dd>${messages.length}${span ? ` <span class="cc-export-id">${escapeHtmlText(span)}</span>` : ""}</dd></div>
      <div class="cc-export-meta-row"><dt>Extension</dt><dd>${escapeHtmlText(meta.extension ? `ChitChat Theme v${meta.extension.version}` : "ChitChat Theme")}${meta.extension ? ` <span class="cc-export-id" title="SHA-256 over manifest.json, background.js, content.js and theme.css of the extension build that produced this file">${escapeHtmlText(meta.extension.hash)}</span>` : ""}</dd></div>
    </dl>
    <p class="cc-export-note">${escapeHtmlText(buildExportNote(meta))}</p>
  </header>`;
}

async function buildHtmlExport(messages, meta, dataUrls, options = {}) {
  // Built from the same accumulated/deduped message list as the JSON and
  // Markdown exports, rather than cloning the live chat DOM: the site only
  // keeps a sliding window of messages mounted, so cloning it would only
  // ever capture whatever window happened to be loaded at the very end.
  const messagesHtml = renderMessagesHtml(messages, dataUrls || new Map());
  const headerHtml = renderExportHeaderHtml(messages, meta);

  const runtime = typeof chrome !== "undefined" && chrome.runtime
    ? chrome.runtime
    : typeof browser !== "undefined" && browser.runtime
    ? browser.runtime
    : null;

  const siteStylesheetHrefs = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map(link => link.href)
    .filter(href => /chitchat\.gg/i.test(href));
  const siteCss = (await Promise.all(siteStylesheetHrefs.map(fetchTextSafe))).join("\n");
  const extensionCss = runtime ? await fetchTextSafe(runtime.getURL("theme.css")) : "";

  const body = document.body;
  // Only the attributes that drive the look (preset/variant/surface/density);
  // not the transient open/closed state of this extension's own dialogs.
  const THEME_DATA_KEYS = [PRESET_ATTR, THEME_ATTR, SURFACE_ATTR, DENSITY_ATTR];
  const dataAttrs = Object.entries(body.dataset)
    .filter(([key]) => THEME_DATA_KEYS.includes(key))
    .map(([key, value]) => `data-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}="${escapeHtmlAttr(value)}"`)
    .join(" ");

  const title = `Chat export${meta.title ? `: ${meta.title}` : ""}`;

  return `<!DOCTYPE html>
<html lang="en" class="${body.classList.contains("dark") ? "dark" : ""}">
<head>
<meta charset="utf-8">
${options.noindex ? '<meta name="robots" content="noindex, nofollow, noarchive">\n<meta name="referrer" content="no-referrer">\n' : ""}<title>${escapeHtmlAttr(title)}</title>
<style>
${siteCss}
${extensionCss}
body { margin: 0; padding: 0; }
.cc-export-wrap { max-width: 760px; margin: 0 auto; min-height: 100vh; }
.cc-export-header { padding: 1rem 1.25rem; border-bottom: 1px solid var(--border, #333); font-size: 0.85rem; line-height: 1.45; }
.cc-export-title { font-size: 1.05rem; font-weight: 700; margin-bottom: 0.5rem; }
.cc-export-meta { margin: 0; display: grid; gap: 0.2rem; }
.cc-export-meta-row { display: flex; gap: 0.75rem; }
.cc-export-meta dt { flex: 0 0 5.5rem; opacity: 0.6; }
.cc-export-meta dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.cc-export-id { font: 0.75rem/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; opacity: 0.65; margin-left: 0.4rem; }
.cc-export-note { margin: 0.6rem 0 0; font-size: 0.75rem; opacity: 0.55; }
.cc-export-list { list-style: none; margin: 0; padding: 0.5rem 0 2rem; }
.cc-export-day { display: flex; align-items: center; gap: 0.75rem; margin: 1rem 1.25rem 0.25rem; font-size: 0.72rem; font-weight: 500; letter-spacing: 0.04em; opacity: 0.6; }
.cc-export-day::before, .cc-export-day::after { content: ""; flex: 1; height: 1px; background: var(--border, #333); }
.cc-export-row { display: flex; gap: 0.75rem; align-items: flex-start; padding: 0.1rem 1.25rem; }
.cc-export-row:hover { background: color-mix(in srgb, var(--popover, #222) 50%, transparent); }
.cc-export-row--start { padding-top: 0.6rem; }
.cc-export-gutter { flex: 0 0 2.5rem; width: 2.5rem; min-width: 0; display: flex; justify-content: center; padding-top: 0.15rem; }
.cc-export-avatar { width: 2.5rem; height: 2.5rem; object-fit: cover; display: block; }
.cc-export-avatar--placeholder { border-radius: 9999px; background: var(--muted, #333); }
.cc-export-hovertime { visibility: hidden; font-size: 0.6rem; font-variant-numeric: tabular-nums; opacity: 0.6; white-space: nowrap; padding-top: 0.25rem; }
.cc-export-row:hover .cc-export-hovertime { visibility: visible; }
.cc-export-body { min-width: 0; flex: 1; }
.cc-export-name { margin: 0; font-weight: 600; font-size: 0.95rem; }
.cc-export-time { font-weight: 400; font-size: 0.72rem; opacity: 0.6; margin-left: 0.5rem; }
.cc-export-text { margin: 0.1rem 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.cc-export-attachment { max-width: min(100%, 420px); border-radius: 0.5rem; margin-top: 0.4rem; display: block; }
.cc-export-missing { margin-top: 0.4rem; font-size: 0.75rem; font-style: italic; opacity: 0.55; }
.cc-export-link { color: #6db3ff; text-decoration: underline; text-underline-offset: 2px; }
.cc-export-edited { font-size: 0.7rem; color: #a3a3a3; }
</style>
</head>
<body class="${escapeHtmlAttr(body.className)}" style="${escapeHtmlAttr(body.style.cssText)}" ${dataAttrs}>
<div class="cc-export-wrap">${headerHtml}
  <ol class="cc-export-list">${messagesHtml}</ol>
</div>
</body>
</html>`;
}

// 128 random bits as base64url: the only thing protecting an uploaded page is
// that nobody can guess its address, so it must not be derived from anything.
function randomUploadFilename() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return `${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.html`;
}

// Returns { uploadedUrl } for the upload format, otherwise undefined.
async function performExport(format, onStatus) {
  // Everything here runs inside the try, including the synchronous DOM
  // scraping: this function is called from an async click handler with its
  // own await, and any throw here (even a synchronous one) must surface as
  // a rejected promise the caller can catch, or the export dialog's buttons
  // are left stuck disabled/showing "Exporting…" forever.
  try {
    const root = getMessageListRoot();
    if (!root) {
      alert("Couldn't find a chat to export. Open a conversation first.");
      return;
    }

    // Fail fast on a bad upload configuration, before the slow history load.
    if (format === "upload") {
      const settings = await loadUploadSettings();
      try {
        normalizeBaseUrl(settings.uploadBaseUrl);
        normalizeBaseUrl(settings.publicBaseUrl);
      } catch (error) {
        alert(`Upload settings look wrong (${error.message}). Check Settings → Upload.`);
        return;
      }
    }

    if (onStatus) {
      onStatus("Loading full history…");
    }
    // Chat history loads incrementally as you scroll; force-load everything
    // that's available in both directions before scraping, instead of only
    // exporting whatever happened to already be on screen. The chat will
    // visibly scroll around while this runs - that's expected.
    const loadResult = await loadFullChatHistory(root, count => {
      if (onStatus) {
        onStatus(`Loading history… ${count} messages so far`);
      }
    });

    if (onStatus) {
      onStatus("Preparing export…");
    }
    const messages = loadResult.messages;
    if (!messages.length) {
      alert("No messages found to export in this chat.");
      return;
    }
    const meta = {
      title: guessConversationTitle(),
      possiblyIncomplete: loadResult.timedOut,
      exportedAt: new Date(),
      participants: collectParticipants(messages),
      extension: await getExtensionInfo()
    };
    if (format === "json") {
      downloadFile(buildExportFilename("json", meta), buildJsonExport(messages, meta), "application/json");
    } else if (format === "md") {
      downloadFile(buildExportFilename("md", meta), buildMarkdownExport(messages, meta), "text/markdown");
    } else if (format === "html" || format === "upload") {
      if (onStatus) {
        onStatus("Embedding images…");
      }
      const imageUrls = [
        ...messages.map(m => m.avatar).filter(Boolean),
        ...messages.flatMap(m => m.attachments.filter(a => a.type === "image").map(a => a.url))
      ];
      const dataUrls = await inlineImages(imageUrls);
      const html = await buildHtmlExport(messages, meta, dataUrls, { noindex: format === "upload" });
      if (format === "html") {
        downloadFile(buildExportFilename("html", meta), html, "text/html");
      } else {
        if (onStatus) {
          onStatus("Uploading…");
        }
        const response = await sendRuntimeMessage({ action: "uploadExport", filename: randomUploadFilename(), html });
        if (!response || !response.success) {
          alert(`Upload failed: ${(response && response.error) || "no response from the extension background"}`);
          return;
        }
        return { uploadedUrl: response.url };
      }
    }
  } catch (error) {
    console.error("[ChitChat Extension] Export failed:", error);
    alert("Export failed. See the browser console for details.");
  }
}

function ensureExportDialog() {
  let dialog = document.getElementById(EXPORT_DIALOG_ID);
  if (dialog) {
    return dialog;
  }
  dialog = document.createElement("div");
  dialog.id = EXPORT_DIALOG_ID;
  dialog.innerHTML = `
    <div class="chitchat-export-panel" role="dialog" aria-modal="true" aria-labelledby="${EXPORT_DIALOG_ID}-title">
      <div class="chitchat-settings-header">
        <h2 id="${EXPORT_DIALOG_ID}-title">Export chat</h2>
        <button type="button" class="chitchat-settings-close" aria-label="Close">&times;</button>
      </div>
      <p class="chitchat-settings-hint">Loads the whole chat first, so long ones take a moment.</p>
      <div class="chitchat-export-options">
        <button type="button" data-export-format="html">HTML</button>
        <button type="button" data-export-format="json">JSON</button>
        <button type="button" data-export-format="md">Markdown</button>
        <button type="button" data-export-format="upload">Upload HTML to my server</button>
      </div>
      <div class="chitchat-export-result" hidden>
        <p class="chitchat-settings-hint">Uploaded. Anyone with this link can read the chat.</p>
        <input type="text" class="chitchat-text-input" readonly data-export-result-url>
        <div class="chitchat-add-friend-controls">
          <button type="button" class="chitchat-settings-apply-button" data-export-result-copy>Copy link</button>
          <button type="button" class="chitchat-settings-apply-button" data-export-result-open>Open</button>
          <button type="button" class="chitchat-settings-apply-button" data-export-result-done>Done</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);
  const resultCopy = dialog.querySelector("[data-export-result-copy]");
  resultCopy.addEventListener("click", async () => {
    const field = dialog.querySelector("[data-export-result-url]");
    try {
      await navigator.clipboard.writeText(field.value);
      resultCopy.textContent = "Copied";
    } catch (error) {
      field.select();
      resultCopy.textContent = "Press Ctrl+C";
    }
    setTimeout(() => { resultCopy.textContent = "Copy link"; }, 2000);
  });
  dialog.querySelector("[data-export-result-open]").addEventListener("click", () => {
    window.open(dialog.querySelector("[data-export-result-url]").value, "_blank", "noopener,noreferrer");
  });
  dialog.querySelector("[data-export-result-done]").addEventListener("click", closeExportDialog);
  dialog.addEventListener("click", event => {
    if (event.target === dialog) {
      closeExportDialog();
    }
  });
  dialog.querySelector(".chitchat-settings-close").addEventListener("click", closeExportDialog);
  dialog.querySelectorAll("[data-export-format]").forEach(button => {
    button.addEventListener("click", async () => {
      const buttons = dialog.querySelectorAll("[data-export-format]");
      const originalHtml = button.innerHTML;
      buttons.forEach(b => { b.disabled = true; });
      button.textContent = "Loading history…";
      let result;
      try {
        // performExport already catches its own errors, but this stays
        // belt-and-braces so a future change there can never leave the
        // dialog's buttons stuck disabled/showing a status message.
        result = await performExport(button.dataset.exportFormat, status => {
          button.textContent = status;
        });
      } finally {
        button.innerHTML = originalHtml;
        buttons.forEach(b => { b.disabled = false; });
      }
      if (result && result.uploadedUrl) {
        showExportResult(dialog, result.uploadedUrl);
      } else {
        closeExportDialog();
      }
    });
  });
  return dialog;
}

function setExportDialogView(dialog, view) {
  const showResult = view === "result";
  dialog.querySelector(".chitchat-export-options").hidden = showResult;
  dialog.querySelector(".chitchat-export-panel > .chitchat-settings-hint").hidden = showResult;
  dialog.querySelector(".chitchat-export-result").hidden = !showResult;
}

function showExportResult(dialog, url) {
  dialog.querySelector("[data-export-result-url]").value = url;
  setExportDialogView(dialog, "result");
}

function openExportDialog() {
  const dialog = ensureExportDialog();
  setExportDialogView(dialog, "options");
  closeMenuDropdown();
  document.body.dataset[EXPORT_OPEN_ATTR] = "true";
}

function closeExportDialog() {
  document.body.dataset[EXPORT_OPEN_ATTR] = "false";
}

// ---------------------------------------------------------------------
// Link detection
// ---------------------------------------------------------------------
// Finds links in message text - including ones typed with a comma instead of
// a dot ("google,com") to slip past the site's own link handling - and shows
// them as blue, clickable links.
//
// The message DOM belongs to React, so nothing here rewrites it (swapping
// text nodes for <a> elements can make React throw when a message is edited).
// Links are marked with the CSS Custom Highlight API instead, which colors a
// text range without touching the elements, and clicks are handled by hit-
// testing those ranges.

// Any of these count as a "dot" in a hostname. Commas are the main one; the
// bracketed spellings are the other common ways people obfuscate a link.
const LINK_SEP_SOURCE = "(?:[.,]|\\[\\.\\]|\\(\\.\\)|\\(dot\\)|\\[dot\\])";
const LINK_LABEL_SOURCE = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?";
// A few spaces or tabs (never a newline) - people pad a link with spaces to
// dodge detection: "https:// x .com/path". That's only trusted after an
// explicit scheme ("hxxp" is the usual defanged spelling); without one, spaces
// end the link, or ordinary sentences would get swallowed.
const LINK_SPACE = "[ \\t]{0,3}";
// A host, spacing allowed around every separator - used both after a scheme
// and bare, so "web.janusxr .org" and "vesta.janusxr .org" (embedded further
// into the same pasted link, past where the scheme text had already ended)
// are found the same way regardless of how many labels they have.
const LINK_HOST_SOURCE = `${LINK_LABEL_SOURCE}(?:${LINK_SPACE}${LINK_SEP_SOURCE}${LINK_SPACE}${LINK_LABEL_SOURCE})+`;
// Groups: 1 scheme (+ any padding after it), 2 host written with a scheme,
// 3 host written without one, 4 port, 5 path.
const LINK_CANDIDATE_RE = new RegExp(
  `(?<![\\w@/:.\\-])(?:(h(?:tt|xx)ps?://${LINK_SPACE})(${LINK_HOST_SOURCE})` +
  `|(${LINK_HOST_SOURCE}))(?::(\\d{1,5})(?!\\w))?([/?#][^\\s<>"]*)?`,
  "gi"
);
const LINK_SEP_SPLIT_RE = new RegExp(`(${LINK_SEP_SOURCE})`, "i");

// Erring on the side of linking too much rather than too little: any
// two-letter ending is a country domain, so "ok,so" or "thanks.it" become
// links, along with these longer endings. (Longer words that aren't domains,
// like "hello,world", stay plain.)
const LINK_GTLDS = new Set((
  "com net org xyz dev app info gov edu mil int biz top site online store tech blog wiki link live pro name shop club " +
  "space news cloud page fun lol mobi art fyi one wtf chat life social email media games game tube moe"
).split(" "));
// A padded host with no scheme or "www" to vouch for it is much more
// speculative, so it only counts for endings that are unmistakably domains.
const LINK_STRONG_TLDS = new Set([...LINK_GTLDS, "gg", "io", "tv", "co", "uk", "de", "eu", "ly", "fm", "ai"]);
// Labels that can sit between a name and a country code (bbc.co.uk, x.com.au).
const LINK_SECOND_LEVELS = new Set(["co", "com", "org", "net", "ac", "gov", "edu", "or"]);

function linkTldAllowed(tld, { explicitScheme, wwwPrefix }) {
  if (!/^[a-z]{2,24}$/.test(tld)) {
    return false;
  }
  if (explicitScheme || wwwPrefix) {
    return true;
  }
  return tld.length === 2 || LINK_GTLDS.has(tld);
}

function trimLinkPath(path) {
  let out = path;
  for (;;) {
    const before = out;
    out = out.replace(/[.,!?;:'"]+$/, "");
    for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
      if (out.endsWith(close) && out.split(close).length > out.split(open).length) {
        out = out.slice(0, -1);
      }
    }
    if (out.endsWith(">")) {
      out = out.slice(0, -1);
    }
    if (out === before) {
      return out;
    }
  }
}

// Returns [{ start, end, url }] for each link in `text`; start/end index the
// original text (the text as typed, e.g. "google,com"), url is the normalized
// address to open (https://google.com).
function findLinksInText(text) {
  const hits = [];
  if (!text || text.length < 4) {
    return hits;
  }
  const re = new RegExp(LINK_CANDIDATE_RE.source, LINK_CANDIDATE_RE.flags);
  let match;
  while ((match = re.exec(text)) !== null) {
    const scheme = match[1] || ""; // includes any padding after "://"
    const hostRaw = match[2] || match[3];
    const parts = hostRaw.split(LINK_SEP_SPLIT_RE); // label, sep, label, sep, ...
    const labels = [];
    const seps = [];
    const labelOffsets = []; // offset of each label inside hostRaw
    const labelLeads = []; // padding directly before each label
    let offset = 0;
    parts.forEach((part, index) => {
      if (index % 2 === 0) {
        // A label can carry padding around it in a spaced link; skip past it.
        const lead = part.length - part.trimStart().length;
        labels.push(part.trim().toLowerCase());
        labelOffsets.push(offset + lead);
        labelLeads.push(lead);
      } else {
        seps.push(part);
      }
      offset += part.length;
    });
    const spaced = /\s/.test(hostRaw);

    // "hey,google.com": a real dot plus a stray comma means the comma is just
    // punctuation, so the link starts after the last comma - but only when
    // that leaves a real host behind it ("google.com,thanks" doesn't).
    let first = 0;
    const lastComma = seps.lastIndexOf(",");
    if (!spaced && lastComma !== -1 && seps.some(sep => sep !== ",") && lastComma + 3 <= labels.length) {
      first = lastComma + 1;
    }
    const explicitScheme = first === 0 && scheme !== "";
    const wwwPrefix = labels[first] === "www";

    const okAt = k => linkTldAllowed(labels[k - 1], { explicitScheme, wwwPrefix });
    // http://192.168.1.5/login: an IPv4 address has no domain ending, but with
    // an explicit scheme it's clearly meant as a link (and worth a warning).
    const isIPv4 = explicitScheme && labels.length === 4 && seps.every(sep => sep === ".")
      && labels.every(label => /^\d{1,3}$/.test(label) && Number(label) <= 255);
    let cut = -1;
    if (isIPv4) {
      cut = 4;
    } else if (spaced) {
      // Padding makes the end of the link ambiguous ("https://a.com. Then"
      // reads as a.com.Then), so the link stops at the first REAL-looking
      // ending, and only continues into a country code that follows a
      // second-level label with no gap after the dot ("bbc .co.uk"), never
      // after a sentence-style ". It". This has to hold even with an explicit
      // scheme present ("https://web.janusxr .org" must reach "org", not stop
      // at "janusxr" just because a scheme trusts any word elsewhere) - so
      // unlike the other branches, padding always means only an unmistakable
      // ending counts, scheme or not.
      // After a leading "www" the next label is the site's name, not its
      // ending, same as the comma-written case below.
      for (let k = first + (wwwPrefix ? 3 : 2); k <= labels.length; k += 1) {
        if (LINK_STRONG_TLDS.has(labels[k - 1])) {
          cut = k;
          break;
        }
      }
    } else if (seps.slice(first).includes(",")) {
      // Comma-written: take the earliest place that ends in a valid domain, so
      // "google,com,youtube,com" is two links rather than one long host.
      // (After a leading "www" the next label is the site's name, not its
      // ending, so the ending can't come before the third label.)
      for (let k = first + (wwwPrefix ? 3 : 2); k <= labels.length; k += 1) {
        if (okAt(k)) {
          cut = k;
          break;
        }
      }
    } else {
      for (let k = labels.length; k >= first + 2; k -= 1) {
        if (okAt(k)) {
          cut = k;
          break;
        }
      }
    }
    // Where the link ends at the FIRST valid ending (comma-written or padded
    // hosts), carry on into a country code that follows a second-level label
    // with no gap after the dot: "google,co,uk", "bbc .co.uk". Never after a
    // sentence-style ". It".
    if (cut !== -1 && (spaced || seps.slice(first).includes(","))) {
      while (
        cut < labels.length && labelLeads[cut] === 0
        && LINK_SECOND_LEVELS.has(labels[cut - 1]) && /^[a-z]{2}$/.test(labels[cut])
      ) {
        cut += 1;
      }
    }
    if (cut === -1) {
      // Not a link. Resume just after this candidate's first label so a real
      // link later in the same run of characters isn't swallowed.
      re.lastIndex = match.index + scheme.length + (parts[0] || "").length;
      continue;
    }

    const cutHost = cut < labels.length;
    let end;
    let port = "";
    let path = "";
    if (cutHost) {
      end = match.index + scheme.length + labelOffsets[cut - 1] + labels[cut - 1].length;
    } else {
      port = match[4] ? `:${match[4]}` : "";
      path = trimLinkPath(match[5] || "");
      end = match.index + match[0].length - ((match[5] || "").length - path.length);
    }
    // The scheme belongs to the link only when the host starts at its first label.
    const start = match.index + (first === 0 ? 0 : scheme.length + labelOffsets[first]);
    const host = labels.slice(first, cut).join(".");
    // "hxxp" is the usual defanged spelling of "http".
    const normalizedScheme = scheme.trim().toLowerCase().replace(/^hxxp/, "http");
    hits.push({
      start,
      end,
      url: `${explicitScheme ? normalizedScheme : "https://"}${host}${port}${path}`
    });
    // Rescan from the end of the link so any text left over after a cut (the
    // rest of a comma chain) can still contain another link.
    re.lastIndex = end;
  }
  return hits;
}

// ---- Message enhancements: link highlighting, markdown, embeds --------------

// On/off switches (Settings -> General). Kept in the page's localStorage like
// the theme settings - none of it is secret.
const FLAG_DEFAULTS = { links: true, markdown: true, youtube: true, previews: true, safety: true, badges: true, messagelog: true };
const FLAG_STORAGE_KEYS = {
  links: "chitchat-extension-link-detection",
  markdown: "chitchat-extension-markdown",
  youtube: "chitchat-extension-youtube-embeds",
  previews: "chitchat-extension-link-previews",
  safety: "chitchat-extension-link-safety",
  badges: "chitchat-extension-hidden-badges",
  messagelog: "chitchat-extension-message-log"
};
const LINK_HIGHLIGHT_NAME = "cc-link";
const LINK_WARN_HIGHLIGHT_NAME = "cc-link-warn";
const LINK_HOVER_ATTR = "ccLinkHover";
const MAX_EMBEDS_PER_MESSAGE = 3;

const linkRegistry = new Map(); // <p> -> [{ range, url, warnings }]
const linkSignatures = new WeakMap(); // <p> -> textContent last highlighted
let enhanceSignatures = new WeakMap(); // <p> -> flags + textContent last enhanced
const youtubeInfoCache = new Map(); // video id -> Promise<response>
let linkHighlight = null;
let linkWarnHighlight = null;
let messageScanTimer = null;
let linkMoveFrame = null;
let enhancementsPaused = false; // true while an export is scrolling the chat

// Staying on the newest message. A preview loading, an image arriving or a
// markdown block replacing text all change a message's height; if you're at the
// bottom of the chat that should keep you at the bottom (as a new message
// does), and if you've scrolled up it must never move you. "At the bottom" is
// within the same 100px the site itself uses for new messages, tracked from
// real scroll events so growth of our own content can't flip it by itself.
const BOTTOM_STICK_PX = 100;
let pinnedToBottom = true;
let sizeObserver = null;
const observedWrappers = new Set();

function distanceFromBottom(root) {
  return root.scrollHeight - root.scrollTop - root.clientHeight;
}

function watchWrapperSize(wrapper) {
  if (typeof ResizeObserver !== "function") {
    return;
  }
  if (!sizeObserver) {
    sizeObserver = new ResizeObserver(() => {
      if (!pinnedToBottom || enhancementsPaused) {
        return;
      }
      const root = getMessageListRoot();
      if (root) {
        root.scrollTop = root.scrollHeight;
      }
    });
  }
  sizeObserver.observe(wrapper);
  observedWrappers.add(wrapper);
}

function unwatchDisconnectedWrappers() {
  observedWrappers.forEach(wrapper => {
    if (!wrapper.isConnected) {
      if (sizeObserver) {
        sizeObserver.unobserve(wrapper);
      }
      observedWrappers.delete(wrapper);
    }
  });
}

function linkHighlightSupported() {
  return typeof CSS !== "undefined" && Boolean(CSS.highlights) && typeof Highlight === "function";
}

function getFlag(name) {
  try {
    const stored = window.localStorage.getItem(FLAG_STORAGE_KEYS[name]);
    if (stored === "off") {
      return false;
    }
    if (stored === "on") {
      return true;
    }
  } catch (error) {
  }
  return FLAG_DEFAULTS[name];
}

function setFlag(name, enabled) {
  try {
    window.localStorage.setItem(FLAG_STORAGE_KEYS[name], enabled ? "on" : "off");
  } catch (error) {
  }
  clearEnhancements();
  clearAllLinks();
  if (name === "messagelog" && !enabled) {
    document.querySelectorAll(".cc-deleted-row").forEach(row => row.remove());
  }
  scheduleMessageScan();
}

function syncFlagToggles() {
  document.querySelectorAll(`#${PORTAL_ID} [data-flag-toggle]`).forEach(toggle => {
    toggle.checked = getFlag(toggle.dataset.flagToggle);
  });
  syncWebAccessStatus();
}

// Link previews (and YouTube titles) are fetched by the background script, which
// needs Firefox's "access all websites" permission; show whether it has it.
async function syncWebAccessStatus() {
  const status = document.querySelector(`#${PORTAL_ID} [data-web-access-status]`);
  const button = document.querySelector(`#${PORTAL_ID} [data-web-access-grant]`);
  if (!status || !button) {
    return;
  }
  const response = await sendRuntimeMessage({ action: "getWebsiteAccess" });
  const granted = response ? response.granted : null;
  if (granted === true) {
    status.textContent = ""; // nothing to say when it's fine
    button.hidden = true;
  } else if (granted === false) {
    status.textContent = "Website access is off, so previews won't load. Turn it on in about:addons > ChitChat Theme > Permissions.";
    button.hidden = false;
  } else {
    status.textContent = "";
    button.hidden = true;
  }
}

async function requestWebsiteAccess() {
  const status = document.querySelector(`#${PORTAL_ID} [data-web-access-status]`);
  const response = await sendRuntimeMessage({ action: "requestWebsiteAccess" });
  if (response && response.granted) {
    previewCache.clear(); // earlier failures were caused by the missing permission
    clearEnhancements();
    scheduleMessageScan();
  } else if (status) {
    status.textContent = "Firefox won't allow that from here. Turn on \"Access your data for all websites\" in about:addons > ChitChat Theme > Permissions, then reload.";
    return;
  }
  syncWebAccessStatus();
}

function clearAllLinks() {
  if (linkHighlight) {
    linkHighlight.clear();
  }
  if (linkWarnHighlight) {
    linkWarnHighlight.clear();
  }
  linkRegistry.clear();
  document.body.dataset[LINK_HOVER_ATTR] = "false";
}

function clearEnhancements() {
  document.querySelectorAll(".cc-enhanced").forEach(node => node.remove());
  enhanceSignatures = new WeakMap();
  unwatchDisconnectedWrappers();
}

// Asks before opening a link that looks off (raw IP, lookalike domain, IP
// logger, disguised link text...). Returns true when it's fine to proceed.
function confirmRiskyLink(url, label) {
  if (!getFlag("safety")) {
    return true;
  }
  const warnings = checkLinkSafety(url, label);
  if (!warnings.length) {
    return true;
  }
  const danger = highestWarningLevel(warnings) === "danger";
  return window.confirm(
    `${danger ? "This link looks dangerous." : "Be careful with this link."}\n\n`
    + `${warnings.map(w => `• ${w.text}`).join("\n")}\n\n${url}\n\nOpen it anyway?`
  );
}

// ---- Highlighting (colors links in place without touching React's DOM) ------

function removeEntryRanges(entries) {
  entries.forEach(entry => {
    if (linkHighlight) {
      linkHighlight.delete(entry.range);
    }
    if (linkWarnHighlight) {
      linkWarnHighlight.delete(entry.range);
    }
  });
}

function rebuildParagraphLinks(paragraph) {
  const previous = linkRegistry.get(paragraph);
  if (previous) {
    removeEntryRanges(previous);
  }
  const entries = [];
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT, {
    // Text that's already inside a real link keeps the site's own handling.
    acceptNode: node => (node.parentElement && node.parentElement.closest("a")
      ? NodeFilter.FILTER_REJECT
      : NodeFilter.FILTER_ACCEPT)
  });
  while (walker.nextNode()) {
    const node = walker.currentNode;
    findLinksInText(node.data).forEach(hit => {
      const range = new Range();
      range.setStart(node, hit.start);
      range.setEnd(node, hit.end);
      const warnings = getFlag("safety") ? checkLinkSafety(hit.url, node.data.slice(hit.start, hit.end)) : [];
      (warnings.length ? linkWarnHighlight : linkHighlight).add(range);
      entries.push({ range, url: hit.url, warnings });
    });
  }
  linkRegistry.set(paragraph, entries);
  linkSignatures.set(paragraph, paragraph.textContent);
}

function updateLinkHighlights(root) {
  if (!linkHighlightSupported() || !getFlag("links")) {
    return;
  }
  if (!linkHighlight) {
    linkHighlight = new Highlight();
    linkWarnHighlight = new Highlight();
    linkWarnHighlight.priority = 1;
    CSS.highlights.set(LINK_HIGHLIGHT_NAME, linkHighlight);
    CSS.highlights.set(LINK_WARN_HIGHLIGHT_NAME, linkWarnHighlight);
  }
  root.querySelectorAll("p[data-from]").forEach(paragraph => {
    const entries = linkRegistry.get(paragraph);
    // Rescan when the text changed, or when React replaced the text nodes our
    // ranges point at (same text, new nodes) - the old ranges are then dead.
    const alive = entries && entries.every(entry => paragraph.contains(entry.range.startContainer));
    if (alive && linkSignatures.get(paragraph) === paragraph.textContent) {
      return;
    }
    rebuildParagraphLinks(paragraph);
  });
  // Forget messages the site has since unmounted (it only keeps a window).
  for (const [paragraph, entries] of linkRegistry) {
    if (!paragraph.isConnected) {
      removeEntryRanges(entries);
      linkRegistry.delete(paragraph);
    }
  }
}

// ---- Embeds -------------------------------------------------------------

function ytInfoOnce(id) {
  if (!youtubeInfoCache.has(id)) {
    youtubeInfoCache.set(id, sendRuntimeMessage({ action: "getYouTubeInfo", id }));
  }
  return youtubeInfoCache.get(id);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

// A YouTube card in the style of Discord's: title, channel, a thumbnail with
// a play button, and the real player swapped in when you press play (nothing
// from the player itself loads until then). The player uses the privacy-
// enhanced youtube-nocookie.com domain.
function buildYouTubeCard(info, url) {
  const card = el("div", "cc-embed cc-embed-youtube");
  card.appendChild(el("div", "cc-embed-provider", "YouTube"));
  const title = el("a", "cc-embed-title", "YouTube video");
  title.href = url;
  title.target = "_blank";
  title.rel = "noopener noreferrer nofollow";
  card.appendChild(title);
  const author = el("div", "cc-embed-author");
  card.appendChild(author);

  const stage = el("div", "cc-embed-stage");
  const play = el("button", "cc-embed-play");
  play.type = "button";
  play.setAttribute("aria-label", "Play video");
  const thumb = document.createElement("img");
  thumb.className = "cc-embed-thumb";
  thumb.alt = "";
  thumb.loading = "lazy";
  thumb.referrerPolicy = "no-referrer";
  thumb.src = `https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`;
  play.appendChild(thumb);
  play.appendChild(el("span", "cc-embed-play-icon", "\u25B6"));
  stage.appendChild(play);
  card.appendChild(stage);

  play.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    const frame = document.createElement("iframe");
    frame.className = "cc-embed-frame";
    frame.title = title.textContent;
    frame.src = `https://www.youtube-nocookie.com/embed/${info.id}?autoplay=1&rel=0${info.start ? `&start=${info.start}` : ""}`;
    frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen";
    frame.allowFullscreen = true;
    // The site sends referrer-policy: same-origin, and YouTube refuses to play
    // an embed that arrives with no referrer.
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox");
    stage.replaceChildren(frame);
  });

  // Title/channel via YouTube's public oEmbed endpoint. This is also the
  // "check": a private, removed or embedding-disabled video is refused there.
  ytInfoOnce(info.id).then(response => {
    if (!card.isConnected && !card.parentNode) {
      return;
    }
    if (response && response.success) {
      title.textContent = response.title || "YouTube video";
      author.textContent = response.author || "";
    } else if (response && [401, 403, 404].includes(response.status)) {
      card.classList.add("is-unavailable");
      stage.replaceChildren(el("div", "cc-embed-unavailable", "This video is unavailable or can't be embedded."));
    }
  });
  return card;
}

// ---- Link previews (any other link) -------------------------------------
// Link previews work like the link embeds in most chat apps: the extension
// fetches the linked page to read its title, description and image. The only
// request is a plain GET to the linked address (for x.com links, to
// publish.twitter.com's public oEmbed endpoint) No cookies, referrer
// or ChitChat account data are sent, nothing is sent to the extension's
// developer, and addresses are kept in memory only, never stored or logged
// elsewhere.
//
// No relevant information is sent to any third party, including the Website in the link.

const PREVIEW_CONCURRENCY = 3;
const previewCache = new Map(); // url -> Promise<response>
const previewWaiting = [];
let previewActive = 0;
let previewObserver = null;
const previewTargets = new Map(); // observed element -> { card, url }

function pumpPreviews() {
  while (previewActive < PREVIEW_CONCURRENCY && previewWaiting.length) {
    const job = previewWaiting.shift();
    previewActive += 1;
    sendRuntimeMessage({ action: "fetchLinkPreview", url: job.url })
      .then(job.resolve)
      .finally(() => {
        previewActive -= 1;
        pumpPreviews();
      });
  }
}

// At most PREVIEW_CONCURRENCY fetches at a time, and each address only once
// per page load (failures are remembered too, so a scan never re-asks).
function previewOnce(url) {
  if (!previewCache.has(url)) {
    previewCache.set(url, new Promise(resolve => {
      previewWaiting.push({ url, resolve });
      pumpPreviews();
    }));
  }
  return previewCache.get(url);
}

function fillPreviewCard(card, data) {
  const url = data.url || card.dataset.ccUrl;
  if (data.color) {
    card.style.borderLeftColor = data.color;
  }
  card.appendChild(el("div", "cc-embed-provider", data.siteName || ""));
  if (data.title) {
    const title = el("a", "cc-embed-title", data.title);
    title.href = url;
    title.target = "_blank";
    title.rel = "noopener noreferrer nofollow";
    card.appendChild(title);
  }
  if (data.description) {
    card.appendChild(el("div", "cc-embed-description", data.description));
  }
  if (data.image) {
    const link = el("a", "cc-embed-image-link");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer nofollow";
    const image = document.createElement("img");
    image.className = "cc-embed-image";
    image.alt = "";
    image.src = data.image; // a data: URL fetched and size-checked by the background script
    link.appendChild(image);
    card.appendChild(link);
  }
  card.hidden = false;
}

function loadPreviewCard(card) {
  previewOnce(card.dataset.ccUrl).then(response => {
    if (!card.isConnected) {
      return;
    }
    if (response && response.success && (response.title || response.description || response.image)) {
      fillPreviewCard(card, response);
    } else {
      // No preview available: leave the message as it was, but say why in the
      // console, since otherwise this failure would be invisible.
      console.info(`[ChitChat Extension] No link preview for ${card.dataset.ccUrl}: ${(response && response.error) || "no response from the extension background"}`);
      card.remove();
    }
  });
}

// Previews are fetched only once their message scrolls near the screen, not
// for every message the site happens to have mounted.
function watchPreviewCard(card, target) {
  if (typeof IntersectionObserver !== "function") {
    loadPreviewCard(card);
    return;
  }
  if (!previewObserver) {
    previewObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const watched = previewTargets.get(entry.target);
        if (!entry.isIntersecting || !watched) {
          return;
        }
        previewObserver.unobserve(entry.target);
        previewTargets.delete(entry.target);
        if (!enhancementsPaused) {
          loadPreviewCard(watched.card);
        }
      });
    }, { rootMargin: "300px" });
  }
  previewTargets.set(target, { card });
  previewObserver.observe(target);
}

function buildPreviewCard(url) {
  const card = el("div", "cc-embed cc-embed-preview");
  card.hidden = true;
  card.dataset.ccUrl = url;
  return card;
}

// ---- Hidden premium badges ---------------------------------------------------
// A user can have premium but set "show badge" to private/friends, in which
// case the site leaves the badge out. The API still sends their premium tier
// (user.premium: "basic" | "plus", also on a DM's participant list), so this
// puts the badge back in gray to show it's there but hidden.
//
// That data isn't in the DOM, only in the page's React component props, which
// Firefox lets a content script read via wrappedJSObject (read-only here). If
// the site's internals change and this can't find it, it does nothing, and
// says so once in the console.

const BADGE_PREMIUM_PLUS = 4;
const BADGE_PREMIUM_BASIC = 5;
const hiddenBadgeState = new WeakMap(); // <h3> -> "<userId>:<tier>" last applied
let reactAccessWarned = false;

// Walks up the React fiber chain from a DOM node and returns the message it
// belongs to and (if seen on the way) the conversation's participant list.
function readReactContext(element) {
  try {
    const raw = element.wrappedJSObject;
    if (!raw) {
      return null;
    }
    const key = Object.keys(raw).find(name => name.startsWith("__reactFiber$"));
    if (!key) {
      return null;
    }
    let message = null;
    let participants = null;
    let fiber = raw[key];
    for (let depth = 0; fiber && depth < 40 && !(message && participants); depth += 1) {
      const props = fiber.memoizedProps;
      if (props && typeof props === "object") {
        if (!message && props.message && props.message.author) {
          message = props.message;
        }
        if (!participants && props.conversation && props.conversation.participants) {
          participants = props.conversation.participants;
        }
      }
      fiber = fiber.return;
    }
    return { message, participants };
  } catch (error) {
    return null;
  }
}

// -> "plus" | "basic" | null: the tier of a user whose badge is NOT being shown.
function hiddenPremiumTier(context) {
  const author = context && context.message && context.message.author;
  if (!author) {
    return null;
  }
  let premium = author.premium;
  if (!premium && context.participants) {
    for (let i = 0; i < context.participants.length; i += 1) {
      const profile = context.participants[i] && context.participants[i].profile;
      if (profile && profile.id === author.id) {
        premium = profile.premium;
        break;
      }
    }
  }
  if (premium !== "plus" && premium !== "basic") {
    return null;
  }
  const badges = author.badges;
  if (badges && typeof badges.length === "number") {
    for (let i = 0; i < badges.length; i += 1) {
      if (badges[i] === BADGE_PREMIUM_PLUS || badges[i] === BADGE_PREMIUM_BASIC) {
        return null; // the site is already showing it
      }
    }
  }
  return premium;
}

function buildHiddenBadge(tier) {
  const plus = tier === "plus";
  const badge = el("span", "cc-hidden-badge");
  badge.title = `Premium ${plus ? "PLUS" : "Basic"} — this user has hidden their badge`;
  const image = document.createElement("img");
  image.className = "cc-hidden-badge-img";
  image.alt = "hidden premium badge";
  image.width = 18;
  image.height = 18;
  image.src = plus ? "/svgs/orange-diamond.svg" : "/svgs/blue-diamond.svg"; // the site's own icons
  badge.appendChild(image);
  return badge;
}

function updateHiddenBadges(root) {
  const enabled = getFlag("badges");
  root.querySelectorAll("h3").forEach(heading => {
    const existing = heading.querySelector(".cc-hidden-badge");
    if (!enabled) {
      if (existing) {
        existing.remove();
      }
      hiddenBadgeState.delete(heading);
      return;
    }
    const context = readReactContext(heading);
    if (!context) {
      if (!reactAccessWarned) {
        reactAccessWarned = true;
        console.info("[ChitChat Extension] Can't read message data from the page, so hidden premium badges are unavailable.");
      }
      return;
    }
    const tier = hiddenPremiumTier(context);
    const key = tier ? `${context.message.author.id}:${tier}` : "";
    if (existing && hiddenBadgeState.get(heading) === key) {
      return;
    }
    if (existing) {
      existing.remove();
    }
    hiddenBadgeState.set(heading, key);
    if (tier) {
      // Beside the name (inside the same span as the site's own badges).
      const host = heading.firstElementChild && heading.firstElementChild.tagName === "SPAN"
        ? heading.firstElementChild
        : heading;
      host.appendChild(buildHiddenBadge(tier));
    }
  });
}

function buildWarningNote(url, warnings) {
  const level = highestWarningLevel(warnings);
  const note = el("div", `cc-note cc-note-${level}`);
  let host = url;
  try {
    host = new URL(url).hostname;
  } catch (error) {
  }
  note.appendChild(el("strong", "", `\u26A0 ${host}`));
  note.appendChild(document.createTextNode(` \u2014 ${warnings[0].text}`));
  return note;
}

// ---- Per-message pass -------------------------------------------------------

// Builds (or refreshes) the block placed right after a message's <p>: rendered
// markdown, embeds and warnings. It's a sibling added after React's own
// nodes, never a change to them; the original <p> is only hidden by CSS
// (p:has(+ .cc-enhanced > .cc-md)) when markdown replaced its content.
function enhanceParagraph(paragraph) {
  const wantMarkdown = getFlag("markdown");
  const wantYoutube = getFlag("youtube");
  const wantPreviews = getFlag("previews");
  const wantSafety = getFlag("safety");
  const wantMessageLog = getFlag("messagelog");
  const id = paragraph.dataset.from;
  const next = paragraph.nextElementSibling;
  const existing = next && next.classList.contains("cc-enhanced") && next.dataset.ccFor === id ? next : null;

  const logEntry = wantMessageLog && msgLog && msgLogConvId === getCurrentConversationId() ? msgLog.messages[id] : null;
  const editCount = logEntry ? logEntry.edits.length : 0;

  // Skip unless the text or a setting changed, or the block we added earlier
  // has gone missing (e.g. the site re-rendered the message).
  const signature = `${wantMarkdown}${wantYoutube}${wantPreviews}${wantSafety}${wantMessageLog}:${editCount}|${paragraph.textContent}`;
  const previous = enhanceSignatures.get(paragraph);
  if (previous && previous.signature === signature && (!previous.inserted || existing)) {
    return;
  }
  if (existing) {
    existing.remove();
    unwatchDisconnectedWrappers();
  }
  enhanceSignatures.set(paragraph, { signature, inserted: false });

  // The site's "(edited)" label is left out of the text that gets parsed, so
  // formatting in the message can't reach it, and put back untouched below.
  const editedIndicators = findEditedIndicators(paragraph);
  const text = extractNodeText(paragraph, new Set(editedIndicators)).trim();
  if (!text) {
    return;
  }
  const wrapper = el("div", "cc-enhanced");
  wrapper.dataset.ccFor = id;

  if (editCount > 0) {
    wrapper.appendChild(buildEditHistoryBlock(logEntry));
  }

  let blocks = null;
  if (wantMarkdown && mdHasMarkup(text)) {
    const parsed = mdParse(text);
    if (!mdIsPlain(parsed)) {
      blocks = parsed;
      const rendered = el("div", `${paragraph.className} cc-md`);
      rendered.appendChild(mdRenderDom(document, blocks));
      if (editedIndicators.length) {
        // A copy of the site's own element (same classes, so the same look),
        // kept inline at the end of the last line when that's a text block.
        const label = editedIndicators[0].cloneNode(true);
        const last = rendered.lastElementChild;
        (last && last.matches(".cc-md-p, .cc-md-h") ? last : rendered).appendChild(label);
      }
      wrapper.appendChild(rendered);
    }
  }

  const links = [];
  const seen = new Set();
  const addLink = (url, label) => {
    if (!seen.has(url)) {
      seen.add(url);
      links.push({ url, label });
    }
  };
  findLinksInText(text).forEach(hit => addLink(hit.url, text.slice(hit.start, hit.end)));
  if (blocks) {
    mdCollectLinks(blocks).forEach(link => addLink(link.url, link.label));
  }

  let embedCount = 0;
  if (wantYoutube) {
    links.filter(link => youtubeInfo(link.url)).slice(0, MAX_EMBEDS_PER_MESSAGE).forEach(link => {
      wrapper.appendChild(buildYouTubeCard(youtubeInfo(link.url), link.url));
      embedCount += 1;
    });
  }

  // Every other link gets a preview card (title, description, image) fetched
  // by the background script - lazily, once the message is near the screen.
  const previewCards = [];
  if (wantPreviews) {
    links
      .filter(link => !(wantYoutube && youtubeInfo(link.url)) && !isOwnSiteUrl(link.url))
      .slice(0, Math.max(0, MAX_EMBEDS_PER_MESSAGE - embedCount))
      .forEach(link => {
        const card = buildPreviewCard(link.url);
        wrapper.appendChild(card);
        previewCards.push(card);
      });
  }

  if (wantSafety) {
    let notes = 0;
    links.forEach(link => {
      const warnings = checkLinkSafety(link.url, link.label);
      if (warnings.length && notes < 2) {
        wrapper.appendChild(buildWarningNote(link.url, warnings));
        notes += 1;
      }
    });
    // Links drawn by our own markdown renderer get the warning color too.
    wrapper.querySelectorAll("a.cc-link").forEach(anchor => {
      if (checkLinkSafety(anchor.href, anchor.textContent).length) {
        anchor.classList.add("cc-link-warn");
      }
    });
  }

  if (wrapper.childNodes.length) {
    paragraph.after(wrapper);
    watchWrapperSize(wrapper);
    enhanceSignatures.set(paragraph, { signature, inserted: true });
    // Watch the visible part of the message: the original <p> is display:none
    // when markdown replaced it, and a hidden element never "intersects".
    const target = wrapper.querySelector(".cc-md") || paragraph;
    previewCards.forEach(card => watchPreviewCard(card, target));
  }
}

// Links back to ChitChat itself don't need a preview card.
function isOwnSiteUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "chitchat.gg" || host.endsWith(".chitchat.gg");
  } catch (error) {
    return false;
  }
}

// ---- Message log (edit / delete tracking) --------------------------------
// Keeps a permanent local record of every message this browser has seen in
// each conversation, so an edit or a deletion is still visible after a
// reload - the server only ever shows the CURRENT state, so catching either
// one means remembering what came before. Nothing here is sent anywhere;
// it's chrome.storage.local, per conversation.
//
// Detecting a deletion only works passively: if a cached message is missing
// from what's currently loaded, but its two nearest still-loaded neighbours
// are now sitting right next to each other where it used to be, that's a
// deletion, not just pagination (the site only trims loaded history from
// the ends - confirmed while building the chat export - never punches a
// hole in the middle of an already-loaded range). A deletion further back
// than whatever's currently loaded isn't flagged until you scroll to it,
// which is also the only time you'd otherwise see that part of the chat at
// all, so nothing that could actually have been seen is missed.

const MSGLOG_MAX_MESSAGES = 4000; // per conversation; oldest trimmed first
const MSGLOG_PREFIX = "chitchat-msglog:";
const MSGLOG_SAVE_DELAY_MS = 800;

function getCurrentConversationId() {
  const match = /\/chat\/[^/]+\/([^/?#]+)/.exec(location.pathname);
  return match ? match[1] : null;
}

function emptyMessageLog() {
  return { order: [], messages: {} };
}

let msgLogConvId = null;
let msgLog = null;
let msgLogLoadToken = 0;
let msgLogBusy = false;
let msgLogSaveTimer = null;

async function loadMessageLog(conversationId) {
  const token = ++msgLogLoadToken;
  const key = MSGLOG_PREFIX + conversationId;
  const stored = await storageGet([key]);
  if (token !== msgLogLoadToken) {
    return; // a newer conversation switch happened while this was loading
  }
  msgLog = stored[key] || emptyMessageLog();
  msgLogConvId = conversationId;
}

function scheduleMessageLogSave() {
  if (msgLogSaveTimer !== null || !msgLogConvId || !msgLog) {
    return;
  }
  msgLogSaveTimer = setTimeout(() => {
    msgLogSaveTimer = null;
    const key = MSGLOG_PREFIX + msgLogConvId;
    storageSet({ [key]: msgLog }).catch(() => {});
  }, MSGLOG_SAVE_DELAY_MS);
}

function trimMessageLog(log) {
  while (log.order.length > MSGLOG_MAX_MESSAGES) {
    const id = log.order.shift();
    delete log.messages[id];
  }
}

// Pure: given the full sequence of ids ever tracked (`order`) and the ids
// currently loaded (`currentIds`, DOM order), returns [{id, afterId}] for
// every id that can be CONFIDENTLY called deleted - present before, missing
// now, with the gap it left fully accounted for by currently-loaded
// neighbours (never by an edge of the loaded window, which is just
// pagination). `afterId` is which currently-visible id the ghost row
// belongs right after (null = belongs before all of them).
function findHoleDeletions(order, currentIds) {
  const orderSet = new Set(order);
  const currentSet = new Set(currentIds);
  const currentIndex = new Map(currentIds.map((id, i) => [id, i]));
  const results = [];
  for (let i = 0; i < order.length; i += 1) {
    const id = order[i];
    if (currentSet.has(id)) {
      continue;
    }
    let prevPresent = null;
    for (let p = i - 1; p >= 0; p -= 1) {
      if (currentSet.has(order[p])) {
        prevPresent = order[p];
        break;
      }
    }
    let nextPresent = null;
    for (let n = i + 1; n < order.length; n += 1) {
      if (currentSet.has(order[n])) {
        nextPresent = order[n];
        break;
      }
    }
    if (prevPresent === null && nextPresent === null) {
      continue; // nothing currently loaded to anchor this on - just unloaded
    }
    if (prevPresent !== null && nextPresent !== null) {
      const pi = currentIndex.get(prevPresent);
      const ni = currentIndex.get(nextPresent);
      let onlyNew = true;
      for (let k = pi + 1; k < ni; k += 1) {
        if (orderSet.has(currentIds[k])) {
          onlyNew = false; // another already-tracked id sits here too; ambiguous for now
          break;
        }
      }
      if (!onlyNew) {
        continue;
      }
    } else if (prevPresent === null) {
      if (currentIds[0] !== nextPresent) {
        continue; // more (never-tracked) history may still load before this point
      }
    } else if (currentIds[currentIds.length - 1] !== prevPresent) {
      continue; // more (never-tracked) history may still load after this point
    }
    results.push({ id, afterId: prevPresent });
  }
  return results;
}

// Merges the currently visible rows into the log, in place. Returns the ids
// that were edited this pass and the deletions just confirmed, so the caller
// knows what UI to refresh without re-diffing everything itself.
function applyVisibleRowsToLog(log, visibleRows) {
  const editedIds = [];
  visibleRows.forEach(row => {
    const existing = log.messages[row.id];
    if (!existing) {
      log.messages[row.id] = {
        author: row.author,
        avatar: row.avatar || null,
        text: row.text,
        timestampISO: row.timestampISO,
        timestampText: row.timestampText,
        edits: [],
        deleted: false,
        deletedSeenAt: null
      };
      log.order.push(row.id);
      return;
    }
    if (existing.deleted) {
      // Reappeared after being marked deleted: a false positive from the
      // hole heuristic (or the site re-sent it) - un-ghost it rather than
      // leave a stale row around forever.
      existing.deleted = false;
      existing.deletedSeenAt = null;
    }
    if (existing.text !== row.text) {
      existing.edits.push({ text: existing.text, seenAt: Date.now() });
      existing.text = row.text;
      editedIds.push(row.id);
    }
    // A grouped/continuation row has no header (author: null upstream, which
    // parseMessageRow already forward-fills, but be defensive here too); only
    // ever replace a known author/avatar with a more complete one, never blank.
    if (row.author && row.author !== "Unknown") {
      existing.author = row.author;
    }
    if (row.avatar) {
      existing.avatar = row.avatar;
    }
  });

  const currentIds = visibleRows.map(row => row.id);
  const deletions = findHoleDeletions(log.order, currentIds);
  deletions.forEach(({ id }) => {
    const entry = log.messages[id];
    if (entry && !entry.deleted) {
      entry.deleted = true;
      entry.deletedSeenAt = Date.now();
    }
  });

  trimMessageLog(log);
  return { editedIds, deletions };
}

function buildDeletedRowElement(id, entry) {
  const row = el("li", "cc-deleted-row");
  row.dataset.ccDeletedId = id;
  const avatarHtml = entry.avatar
    ? `<img src="${escapeHtmlAttr(entry.avatar)}" alt="" class="rounded-full cc-deleted-avatar">`
    : `<div class="cc-deleted-avatar cc-deleted-avatar--placeholder"></div>`;
  const label = el("span", "cc-deleted-tag", "(deleted)");
  row.innerHTML = `
    <div class="cc-deleted-gutter">${avatarHtml}</div>
    <div class="cc-deleted-body">
      <h3 class="cc-deleted-name">${escapeHtmlText(entry.author)}<time class="cc-deleted-time">${escapeHtmlText(entry.timestampText || "")}</time></h3>
      <p class="cc-deleted-text"></p>
    </div>
  `;
  row.querySelector(".cc-deleted-text").textContent = entry.text || "";
  row.querySelector(".cc-deleted-text").appendChild(label);
  return row;
}

function buildEditHistoryBlock(entry) {
  const block = el("div", "cc-edit-history");
  entry.edits.forEach(edit => {
    const line = el("div", "cc-edit-history-line");
    line.appendChild(el("span", "cc-edit-history-text", edit.text));
    block.appendChild(line);
  });
  return block;
}

// Places or refreshes the deleted-message ghost rows in the live DOM: one
// per confirmed deletion, right after the still-present neighbour it
// belongs after (or at the very top of the list if it was the oldest thing
// loaded). Idempotent - safe to call on every scan.
function renderDeletedRows(root, log) {
  const seen = new Set();
  root.querySelectorAll(":scope > li.cc-deleted-row").forEach(row => {
    const id = row.dataset.ccDeletedId;
    const entry = log.messages[id];
    if (!entry || !entry.deleted) {
      row.remove(); // stale (e.g. un-ghosted after reappearing)
      return;
    }
    seen.add(id);
  });

  log.order.forEach(id => {
    const entry = log.messages[id];
    if (!entry || !entry.deleted || seen.has(id)) {
      return;
    }
    const existingParagraph = root.querySelector(`p[data-from="${cssEscape(id)}"]`);
    if (existingParagraph) {
      return; // reappeared since the log was last saved; not actually missing
    }
    const row = buildDeletedRowElement(id, entry);
    const anchorIndex = log.order.indexOf(id);
    let afterElement = null;
    for (let i = anchorIndex - 1; i >= 0 && !afterElement; i -= 1) {
      const neighborParagraph = root.querySelector(`p[data-from="${cssEscape(log.order[i])}"]`);
      afterElement = neighborParagraph ? neighborParagraph.closest("li") : root.querySelector(`:scope > li.cc-deleted-row[data-cc-deleted-id="${cssEscape(log.order[i])}"]`);
    }
    if (afterElement) {
      afterElement.after(row);
    } else {
      root.prepend(row);
    }
  });
}

function cssEscape(value) {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : String(value).replace(/["\\]/g, "\\$&");
}

// Returns true when the caller should re-scan soon (a conversation's log
// just finished loading, or something changed that a paragraph's cached
// signature won't pick up on its own).
async function updateMessageLog(root) {
  const conversationId = getCurrentConversationId();
  if (!conversationId) {
    return false;
  }
  if (msgLogBusy) {
    return false; // a previous pass is still loading; next scan will catch up
  }
  let justLoaded = false;
  if (conversationId !== msgLogConvId) {
    msgLogBusy = true;
    try {
      await loadMessageLog(conversationId);
      justLoaded = true;
    } finally {
      msgLogBusy = false;
    }
    if (conversationId !== getCurrentConversationId()) {
      return false; // switched conversations again while loading
    }
  }
  if (!msgLog || msgLogConvId !== conversationId) {
    return false;
  }

  // A grouped/continuation row has no header of its own (author: null from
  // parseMessageRow); forward-fill from the nearest preceding row that had
  // one, the same as the export feature's finalizeMessages does.
  let lastAuthor = null;
  let lastAvatar = null;
  const visibleRows = Array.from(root.querySelectorAll(":scope > li"))
    .map(li => {
      const parsed = parseMessageRow(li);
      if (!parsed) {
        return null;
      }
      if (parsed.author) {
        lastAuthor = parsed.author;
        lastAvatar = parsed.avatar || lastAvatar;
      }
      return { ...parsed, author: parsed.author || lastAuthor || "Unknown", avatar: parsed.avatar || lastAvatar, li };
    })
    .filter(Boolean);
  if (!visibleRows.length) {
    return justLoaded;
  }

  const { editedIds, deletions } = applyVisibleRowsToLog(msgLog, visibleRows);
  if (editedIds.length || deletions.length) {
    scheduleMessageLogSave();
  }

  editedIds.forEach(id => {
    const row = visibleRows.find(r => r.id === id);
    if (row) {
      enhanceSignatures.delete(row.li.querySelector("p[data-from]")); // force enhanceParagraph to refresh
    }
  });

  renderDeletedRows(root, msgLog);
  return justLoaded || editedIds.length > 0 || deletions.length > 0;
}

async function clearMessageLog() {
  const status = document.querySelector(`#${PORTAL_ID} [data-message-log-status]`);
  const setStatus = text => { if (status) { status.textContent = text; } };
  setStatus("Clearing…");
  try {
    const all = await new Promise(resolve => {
      try {
        chrome.storage.local.get(null, items => { void chrome.runtime.lastError; resolve(items || {}); });
      } catch (error) {
        resolve({});
      }
    });
    const keys = Object.keys(all).filter(key => key.startsWith(MSGLOG_PREFIX));
    await storageRemove(keys);
    msgLog = null;
    msgLogConvId = null;
    document.querySelectorAll(".cc-deleted-row").forEach(row => row.remove());
    clearEnhancements();
    scheduleMessageScan();
    setStatus(`Cleared (${keys.length} conversation${keys.length === 1 ? "" : "s"}).`);
  } catch (error) {
    setStatus(`Couldn't clear: ${error.message}`);
  }
}

function enhanceMessages(root) {
  root.querySelectorAll("p[data-from]").forEach(paragraph => {
    try {
      enhanceParagraph(paragraph);
    } catch (error) {
      // One odd message must never stop the rest from being processed.
      console.warn("[ChitChat Extension] Couldn't enhance a message:", error);
    }
  });
}

function scanMessages() {
  messageScanTimer = null;
  if (enhancementsPaused) {
    return; // resumed (and rescanned) by loadFullChatHistory when it finishes
  }
  const root = getMessageListRoot();
  if (!root) {
    return;
  }
  updateLinkHighlights(root);
  enhanceMessages(root);
  updateHiddenBadges(root);
  unwatchDisconnectedWrappers();
  if (getFlag("messagelog")) {
    // Async (storage I/O); re-scan once it's settled so a freshly-loaded
    // conversation's edit history and any deleted rows actually appear,
    // instead of waiting for the next unrelated DOM change.
    updateMessageLog(root).then(changed => {
      if (changed) {
        scheduleMessageScan();
      }
    });
  }
}

function scheduleMessageScan() {
  if (messageScanTimer === null) {
    messageScanTimer = setTimeout(scanMessages, 120);
  }
}

function linkAtPoint(x, y, target) {
  const paragraph = target instanceof Element ? target.closest("p[data-from]") : null;
  const entries = paragraph ? linkRegistry.get(paragraph) : null;
  if (!entries) {
    return null;
  }
  for (const entry of entries) {
    for (const rect of entry.range.getClientRects()) {
      if (x >= rect.left - 1 && x <= rect.right + 1 && y >= rect.top - 1 && y <= rect.bottom + 1) {
        return entry;
      }
    }
  }
  return null;
}

function initializeMessageEnhancements() {
  new MutationObserver(scheduleMessageScan).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
  scheduleMessageScan();

  // Scroll events don't bubble, so listen in the capture phase. Only real
  // scrolling of the message list updates whether we're at the bottom.
  document.addEventListener("scroll", event => {
    const root = getMessageListRoot();
    if (root && event.target === root) {
      pinnedToBottom = distanceFromBottom(root) <= BOTTOM_STICK_PX;
    }
  }, true);

  document.addEventListener("click", event => {
    if (event.button !== 0) {
      return;
    }
    // Links drawn by the markdown renderer are real <a> elements: just vet them.
    const anchor = event.target instanceof Element ? event.target.closest("a.cc-link") : null;
    if (anchor) {
      if (!confirmRiskyLink(anchor.href, anchor.textContent)) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if (!getFlag("links")) {
      return;
    }
    const entry = linkAtPoint(event.clientX, event.clientY, event.target);
    if (!entry) {
      return;
    }
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      return; // the user is selecting text, not clicking a link
    }
    event.preventDefault();
    event.stopPropagation();
    if (confirmRiskyLink(entry.url, entry.range.toString())) {
      window.open(entry.url, "_blank", "noopener,noreferrer");
    }
  }, true);

  document.addEventListener("mousemove", event => {
    if (linkMoveFrame !== null || !getFlag("links")) {
      return;
    }
    const { clientX, clientY, target } = event;
    linkMoveFrame = requestAnimationFrame(() => {
      linkMoveFrame = null;
      document.body.dataset[LINK_HOVER_ATTR] = linkAtPoint(clientX, clientY, target) ? "true" : "false";
    });
  }, { passive: true });
}

// Same detector, for the exported HTML: escaped text with real <a> tags.
function linkifyToHtml(text) {
  let html = "";
  let cursor = 0;
  findLinksInText(text).forEach(hit => {
    html += escapeHtmlText(text.slice(cursor, hit.start));
    html += `<a href="${escapeHtmlAttr(hit.url)}" target="_blank" rel="noopener noreferrer nofollow" class="cc-export-link">${escapeHtmlText(text.slice(hit.start, hit.end))}</a>`;
    cursor = hit.end;
  });
  return html + escapeHtmlText(text.slice(cursor));
}

// ---- Startup gate ------------------------------------------------------------
// Everything (theme, menu, links, markdown, previews...) depends on Firefox's
// "access all websites" permission for this extension. Without it the extension
// loads NOTHING and shows one small notice instead. That includes the theme
// stylesheet, which used to be injected by the manifest before any code could
// check: it is now only added by ensureThemeStyles() after the check passes.

const PERMISSION_POLL_MS = 3000;
let extensionStarted = false;

// true / false, or null when the background script can't be reached at all
// (then we carry on rather than block on something we can't measure).
async function checkWebsiteAccess() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await sendRuntimeMessage({ action: "getWebsiteAccess" });
    if (response && typeof response.granted === "boolean") {
      return response.granted;
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return null;
}

// Self-contained on purpose: none of the extension's own CSS is loaded here.
function showPermissionNotice() {
  if (document.getElementById("chitchat-permission-notice")) {
    return null;
  }
  const notice = document.createElement("div");
  notice.id = "chitchat-permission-notice";
  notice.textContent = "Permissions are missing";
  notice.title = "ChitChat Theme needs \"Access your data for all websites\". In Firefox: about:addons → ChitChat Theme → Permissions. It starts by itself once that's on. Click to hide this.";
  notice.style.cssText = [
    "position:fixed", "right:16px", "bottom:16px", "z-index:2147483647",
    "padding:10px 14px", "border-radius:8px", "cursor:pointer",
    "background:#2b1d3f", "color:#f3e8ff", "border:1px solid #7c4dbd",
    "font:600 13px/1.2 system-ui,sans-serif", "box-shadow:0 6px 24px rgba(0,0,0,.45)"
  ].join(";");
  notice.addEventListener("click", () => { notice.style.display = "none"; });
  (document.body || document.documentElement).appendChild(notice);
  return notice;
}

// ---------------------------------------------------------------------
// Paste image to attach
// ---------------------------------------------------------------------
// The message composer already supports choosing a file (a hidden
// <input type="file"> wired up through the site's own form library) and
// dragging one in, but not pasting an image from the clipboard. This adds
// that by feeding the pasted image into that SAME hidden input - via the
// standard DataTransfer + dispatchEvent("change") technique - so the site's
// own preview, validation (images always allowed, video needs Premium Plus,
// 8MB cap) and upload logic all run exactly as if the file had been picked
// by hand. Nothing here talks to the network directly.

// The composer's file input accepts exactly this set of types; matching on
// it (rather than a class name, which has changed under us before) finds it
// even if the site's markup changes again.
const COMPOSER_FILE_ACCEPT = ["image/png", "image/jpg", "image/jpeg", "image/webp", "video/mp4", "video/webm", "video/mov"];

function isComposerFileInput(input) {
  const accept = (input.getAttribute("accept") || "").split(",").map(s => s.trim());
  return COMPOSER_FILE_ACCEPT.every(type => accept.includes(type));
}

function findComposerFileInput(near) {
  // Prefer one near the focused textarea (its own form/wrapper); fall back
  // to a document-wide search by its accept list if that doesn't find it.
  let scope = near;
  for (let depth = 0; scope && depth < 6; depth += 1) {
    const input = scope.querySelector('input[type="file"]');
    if (input && isComposerFileInput(input)) {
      return input;
    }
    scope = scope.parentElement;
  }
  return Array.from(document.querySelectorAll('input[type="file"]')).find(isComposerFileInput) || null;
}

function initializePasteAttachment() {
  document.addEventListener("paste", event => {
    const active = document.activeElement;
    // Only when the message box itself has focus, so pasting text anywhere
    // else on the page - including this extension's own settings fields -
    // is left completely alone.
    if (!(active instanceof HTMLTextAreaElement && active.getAttribute("aria-label") === "Send a message")) {
      return;
    }
    const items = event.clipboardData && event.clipboardData.items;
    if (!items) {
      return;
    }
    const imageItem = Array.from(items).find(item => item.kind === "file" && item.type.startsWith("image/"));
    if (!imageItem) {
      return; // an ordinary text paste; let it proceed as normal
    }
    const blob = imageItem.getAsFile();
    const input = blob && findComposerFileInput(active);
    if (!input) {
      return;
    }
    event.preventDefault();
    const extension = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg");
    const file = new File([blob], `pasted-image-${Date.now()}.${extension}`, { type: blob.type });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    // The site's form library listens for this on the input itself, the
    // same event a real file picker selection fires.
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, true);
}

function startExtension() {
  if (extensionStarted) {
    return;
  }
  extensionStarted = true;
  const notice = document.getElementById("chitchat-permission-notice");
  if (notice) {
    notice.remove();
  }
  console.info("[ChitChat Extension] Initializing content script");
  withRetry(() => {
    const host = datasetHost();
    if (!host) {
      return false;
    }
    enforceDarkMode(host);
    ensureThemeStyles();
    applyStoredVariant();
    applySurfaceVariant();
    applyDensityMode();
    applyPreset();
    ensurePortal();
    highlightPresetButtons();
    syncCustomInputs();
    syncCustomSectionState();
    document.addEventListener("keydown", handleEscape);
    withRetry(insertMenuButton, 400, 80);
    initializeAddFriendFeature();
    initializeMessageEnhancements();
    initializePasteAttachment();
    return true;
  }, 200, 50);
}

async function initialize() {
  if ((await checkWebsiteAccess()) !== false) {
    startExtension();
    return;
  }
  // Permission missing: nothing else loads. Watch for it being granted, so the
  // user doesn't have to reload the page after switching it on.
  showPermissionNotice();
  const timer = setInterval(async () => {
    if ((await checkWebsiteAccess()) !== false) {
      clearInterval(timer);
      startExtension();
    }
  }, PERMISSION_POLL_MS);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}
