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
      host.style.setProperty(`--${token}`, value);
    });
    host.dataset[PRESET_ATTR] = PRESET_CUSTOM;
    return;
  }
  PRESET_TOKEN_KEYS.forEach(token => {
    host.style.removeProperty(`--${token}`);
  });
  if (preset === "none") {
    delete host.dataset[PRESET_ATTR];
    delete host.dataset[THEME_ATTR];
    delete host.dataset[SURFACE_ATTR];
    delete host.dataset[DENSITY_ATTR];
    const themeStyle = document.getElementById(THEME_STYLE_ID);
    if (themeStyle) {
      themeStyle.remove();
    }
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
  const presetButtonsMarkup = PRESET_OPTIONS.map(preset => {
    const label = formatPresetLabel(preset);
    return `<button type="button" data-preset="${preset}">${label}</button>`;
  }).join("");
  portal.innerHTML = `
    <div id="${PANEL_ID}" role="dialog" aria-modal="true" aria-labelledby="${PANEL_ID}-title">
      <div class="chitchat-settings-header">
        <h2 id="${PANEL_ID}-title">ChitChat Extension Settings</h2>
        <button type="button" class="chitchat-settings-close" aria-label="Close settings">&times;</button>
      </div>
      <div class="chitchat-settings-tabs">
        <button type="button" class="chitchat-settings-tab is-active" data-tab="theme">Theme</button>
        <button type="button" class="chitchat-settings-tab" data-tab="appearance">Appearance</button>
        <button type="button" class="chitchat-settings-tab" data-tab="general">General</button>
      </div>
      <div class="chitchat-settings-body">
        <div class="chitchat-settings-tab-panel is-active" data-tab-panel="theme">
          <div class="chitchat-settings-category">
            <h3 class="chitchat-settings-subtitle">Theme</h3>
            <div class="chitchat-settings-section">
              <span class="chitchat-settings-label">Preset palettes</span>
              <div class="chitchat-settings-options chitchat-settings-options--wrap" role="group" aria-label="Theme presets">
                ${presetButtonsMarkup}
              </div>
            </div>
            <div class="chitchat-settings-section chitchat-settings-section--custom" data-custom-section>
              <span class="chitchat-settings-label">Custom palette</span>
              <p class="chitchat-settings-hint">Choose the “Custom” preset to edit primary and accent colors.</p>
              <div class="chitchat-color-controls">
                <label class="chitchat-color-field">
                  <span>Primary</span>
                  <input type="color" value="${CUSTOM_DEFAULTS.primary}" data-custom-color="primary">
                </label>
                <label class="chitchat-color-field">
                  <span>Accent</span>
                  <input type="color" value="${CUSTOM_DEFAULTS.accent}" data-custom-color="accent">
                </label>
              </div>
              <button type="button" class="chitchat-settings-apply-button" data-apply-custom-colors>Apply</button>
            </div>
          </div>
        </div>
        <div class="chitchat-settings-tab-panel" data-tab-panel="appearance">
          <div class="chitchat-settings-category">
            <h3 class="chitchat-settings-subtitle">Appearance</h3>
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
          </div>
        </div>
        <div class="chitchat-settings-tab-panel" data-tab-panel="general">
            <div class="chitchat-settings-category">
                <h3 class="chitchat-settings-subtitle">General</h3>
                <div class="chitchat-settings-section">
                    <span class="chitchat-settings-label">Layout density</span>
                    <label class="chitchat-toggle">
                    <input type="checkbox" data-density-toggle>
                    <span class="chitchat-toggle-slider" aria-hidden="true"></span>
                    <span class="chitchat-toggle-text">Compact mode</span>
                    </label>
                    <p class="chitchat-settings-hint">Reduces radii and surface padding for tighter layouts.</p>
                </div>
            </div>
        </div>
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
  highlightActiveVariant();
  highlightSurfaceVariant();
  highlightPresetButtons();
  syncCustomInputs();
  syncCustomSectionState();
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
  highlightPresetButtons();
  highlightActiveVariant();
  highlightSurfaceVariant();
  syncCustomInputs();
  syncCustomSectionState();
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

const API_BASE_URL = "https://chitchat.gg/api"; // Assumption

function injectAddFriendForm(menu) {
  if (menu.querySelector('.add-friend-form')) {
    return; // Already injected
  }

  const form = document.createElement('div');
  form.className = 'add-friend-form chitchat-settings-category'; // Reuse existing class for styling
  form.innerHTML = `
    <h3 class="chitchat-settings-subtitle">Add Friend</h3>
    <div class="chitchat-settings-section">
      <span class="chitchat-settings-label">Add by ID</span>
      <div class="chitchat-add-friend-controls">
        <input type="text" placeholder="Enter user ID" class="chitchat-add-friend-input">
        <button type="button" class="chitchat-add-friend-button">Add</button>
      </div>
    </div>
  `;

  menu.appendChild(form);

  const button = form.querySelector('.chitchat-add-friend-button');
  const input = form.querySelector('.chitchat-add-friend-input');

  button.addEventListener('click', () => { // Changed to non-async
    const userId = input.value.trim();
    if (!userId) {
      alert('Please enter a user ID.');
      return;
    }

    // Send message to background script
    chrome.runtime.sendMessage({ action: "addFriend", userId: userId }, (response) => {
      if (response.success) {
        alert('Friend request sent successfully!');
        input.value = '';
      } else {
        alert(`Failed to send friend request: ${response.error}`);
        console.error("[ChitChat Extension] API Error:", response.error);
      }
    });
  });
}

function initializeAddFriendFeature() {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const menu = node.querySelector('div[data-state="open"][role="dialog"]');
                    if (menu) {
                        const friendTitle = menu.querySelector('span');
                        if(friendTitle && friendTitle.innerText.includes('Friend Requests')){
                            injectAddFriendForm(menu);
                        }
                    }
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

function initialize() {
  console.info("[ChitChat Extension] Initializing content script - Version 1.3"); // Added version log
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
    withRetry(insertGearButton, 400, 80);
    initializeAddFriendFeature();
    return true;
  }, 200, 50);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}
