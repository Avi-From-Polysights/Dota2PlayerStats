import { captureFormConfig, applyFormConfig } from "./form-config.js";
import { syncUrlFromForm } from "./share.js";

const SESSION_KEY = "d2ps-session-config";
const PRESETS_KEY = "d2ps-saved-configs";
const ACTIVE_PRESET_KEY = "d2ps-active-preset-id";

function escHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private mode / quota
  }
}

function formatWhen(iso) {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function presetSummary(values) {
  const parts = [];
  if (values.account) parts.push(`ID ${values.account}`);
  if (values.heroName) parts.push(values.heroName);
  else if (values.hero) parts.push(`hero ${values.hero}`);
  if (values.parse === "1") parts.push("OpenDota parse");
  if (values.stratz === "1") parts.push("STRATZ");
  return parts.length ? parts.join(" · ") : "Parameters preset";
}

export function readSessionConfig() {
  return readJson(SESSION_KEY, null);
}

export function persistSessionConfig() {
  const now = new Date().toISOString();
  const existing = readSessionConfig();
  writeJson(SESSION_KEY, {
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastIngestionAt: existing?.lastIngestionAt ?? null,
    values: captureFormConfig(),
  });
}

export function recordConfigIngestion() {
  const now = new Date().toISOString();
  const session = readSessionConfig() ?? {};
  writeJson(SESSION_KEY, {
    createdAt: session.createdAt ?? now,
    updatedAt: now,
    lastIngestionAt: now,
    values: captureFormConfig(),
  });

  const activeId = localStorage.getItem(ACTIVE_PRESET_KEY);
  if (!activeId) return;

  const presets = listNamedPresets();
  const idx = presets.findIndex((p) => p.id === activeId);
  if (idx === -1) return;

  presets[idx] = {
    ...presets[idx],
    updatedAt: now,
    lastIngestionAt: now,
    values: captureFormConfig(),
  };
  writeJson(PRESETS_KEY, presets);
}

export function restoreSessionConfigToForm(ctx) {
  const session = readSessionConfig();
  if (!session?.values) return false;
  applyFormConfig(session.values, ctx);
  return true;
}

function listNamedPresets() {
  return readJson(PRESETS_KEY, []);
}

function saveNamedPresets(presets) {
  writeJson(PRESETS_KEY, presets);
}

function generateId() {
  return `cfg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function openModal(modal) {
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  modal.querySelector("#config-save-name")?.focus();
}

function closeModal(modal) {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function renderPresetList(listEl, emptyEl, ctx, onChange) {
  const presets = listNamedPresets().sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  const activeId = localStorage.getItem(ACTIVE_PRESET_KEY);

  if (!presets.length) {
    listEl.innerHTML = "";
    emptyEl.classList.remove("hidden");
    return;
  }

  emptyEl.classList.add("hidden");
  listEl.innerHTML = presets
    .map((preset) => {
      const isActive = preset.id === activeId;
      return `
        <li class="config-item${isActive ? " config-item--active" : ""}" data-preset-id="${escHtml(preset.id)}">
          <div class="config-item__main">
            <span class="config-item__name">${escHtml(preset.name)}</span>
            <span class="config-item__summary">${escHtml(presetSummary(preset.values))}</span>
            <span class="config-item__meta">
              Created ${escHtml(formatWhen(preset.createdAt))}
              · Saved ${escHtml(formatWhen(preset.updatedAt))}
              · Last run ${escHtml(formatWhen(preset.lastIngestionAt))}
            </span>
          </div>
          <div class="config-item__actions">
            <button type="button" class="btn btn--outline btn--sm" data-load-preset>Load</button>
            <button type="button" class="btn btn--outline btn--sm btn--danger" data-delete-preset>Delete</button>
          </div>
        </li>
      `;
    })
    .join("");

  listEl.querySelectorAll("[data-load-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.closest("[data-preset-id]")?.dataset.presetId;
      const preset = presets.find((p) => p.id === id);
      if (!preset) return;
      applyFormConfig(preset.values, ctx);
      localStorage.setItem(ACTIVE_PRESET_KEY, preset.id);
      syncUrlFromForm();
      persistSessionConfig();
      onChange?.();
    });
  });

  listEl.querySelectorAll("[data-delete-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.closest("[data-preset-id]")?.dataset.presetId;
      if (!id) return;
      const next = listNamedPresets().filter((p) => p.id !== id);
      saveNamedPresets(next);
      if (localStorage.getItem(ACTIVE_PRESET_KEY) === id) {
        localStorage.removeItem(ACTIVE_PRESET_KEY);
      }
      onChange?.();
    });
  });
}

function renderSessionBanner(bannerEl) {
  const session = readSessionConfig();
  if (!session) {
    bannerEl.classList.add("hidden");
    bannerEl.textContent = "";
    return;
  }

  bannerEl.classList.remove("hidden");
  bannerEl.textContent = `Auto-saved in this browser · last saved ${formatWhen(session.updatedAt)} · last run ${formatWhen(session.lastIngestionAt)}`;
}

export function initSavedConfigs(ctx = {}) {
  const modal = document.getElementById("config-modal");
  const openBtn = document.getElementById("saved-configs-open");
  const listEl = document.getElementById("config-list");
  const emptyEl = document.getElementById("config-list-empty");
  const saveForm = document.getElementById("config-save-form");
  const nameInput = document.getElementById("config-save-name");
  const sessionBanner = document.getElementById("config-session-banner");

  if (!modal || !openBtn || !listEl || !emptyEl || !saveForm) return;

  const refresh = () => {
    renderPresetList(listEl, emptyEl, ctx, refresh);
    renderSessionBanner(sessionBanner);
  };

  openBtn.addEventListener("click", () => {
    refresh();
    openModal(modal);
  });

  modal.querySelectorAll("[data-modal-close]").forEach((el) => {
    el.addEventListener("click", () => closeModal(modal));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) {
      closeModal(modal);
    }
  });

  saveForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = nameInput?.value?.trim();
    if (!name) {
      nameInput?.focus();
      return;
    }

    const now = new Date().toISOString();
    const session = readSessionConfig();
    const preset = {
      id: generateId(),
      name,
      createdAt: now,
      updatedAt: now,
      lastIngestionAt: session?.lastIngestionAt ?? null,
      values: captureFormConfig(),
    };

    const presets = listNamedPresets();
    presets.push(preset);
    saveNamedPresets(presets);
    localStorage.setItem(ACTIVE_PRESET_KEY, preset.id);
    persistSessionConfig();

    if (nameInput) nameInput.value = "";
    refresh();
  });

  const form = document.getElementById("stats-form");
  let saveTimer = null;
  const schedulePersist = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      persistSessionConfig();
      renderSessionBanner(sessionBanner);
    }, 400);
  };

  form?.addEventListener("input", schedulePersist);
  form?.addEventListener("change", schedulePersist);

  renderSessionBanner(sessionBanner);
}
