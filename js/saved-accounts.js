import {
  accountAvatarUrl,
  accountDisplayName,
  listSavedAccounts,
  removeSavedAccount,
  saveAccount,
} from "./account-cache.js";
import { loadPlayerProfile, profileFromPlayerResponse } from "./api.js";

const container = () => document.getElementById("saved-accounts");
const accountInput = () => document.getElementById("account-id");

function escHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

let onSelectCallback = null;

function renderAvatar(account) {
  const url = accountAvatarUrl(account);
  const label = accountDisplayName(account);
  if (url) {
    return `<img class="saved-account__avatar" src="${url}" alt="" width="28" height="28" loading="lazy" referrerpolicy="no-referrer" />`;
  }
  return `<span class="saved-account__avatar saved-account__avatar--fallback" aria-hidden="true">${label.charAt(0).toUpperCase()}</span>`;
}

export async function renderSavedAccounts() {
  const el = container();
  if (!el) return;

  let accounts = [];
  try {
    accounts = await listSavedAccounts();
  } catch {
    el.classList.add("hidden");
    return;
  }

  if (!accounts.length) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }

  el.classList.remove("hidden");
  el.innerHTML = `
    <p class="saved-accounts__label">Recent accounts</p>
    <div class="saved-accounts__list" role="list">
      ${accounts
        .map(
          (account) => `
        <div class="saved-account" role="listitem">
          <button
            type="button"
            class="saved-account__pick"
            data-account-id="${account.accountId}"
            title="Use ${escHtml(accountDisplayName(account))} (${account.accountId})"
          >
            ${renderAvatar(account)}
            <span class="saved-account__meta">
              <span class="saved-account__name">${escHtml(accountDisplayName(account))}</span>
              <span class="saved-account__id">${account.accountId}</span>
            </span>
          </button>
          <button
            type="button"
            class="saved-account__remove"
            data-remove-account="${account.accountId}"
            aria-label="Remove ${escHtml(accountDisplayName(account))} from recent accounts"
          >×</button>
        </div>
      `
        )
        .join("")}
    </div>
  `;

  el.querySelectorAll(".saved-account__pick").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.accountId;
      accountInput().value = id;
      onSelectCallback?.(Number(id));
    });
  });

  el.querySelectorAll(".saved-account__remove").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      event.stopPropagation();
      await removeSavedAccount(Number(btn.dataset.removeAccount));
      await renderSavedAccounts();
    });
  });
}

export async function rememberAccountFromApi(accountId, { signal } = {}) {
  const id = Number(accountId);
  if (!id) return null;

  try {
    const data = await loadPlayerProfile(id, signal);
    const profile = profileFromPlayerResponse(data, id);
    const saved = await saveAccount(profile);
    await renderSavedAccounts();
    return saved;
  } catch {
    const saved = await saveAccount({
      accountId: id,
      personaname: null,
      name: null,
      avatar: null,
      avatarFull: null,
    });
    await renderSavedAccounts();
    return saved;
  }
}

export function initSavedAccounts({ onSelect } = {}) {
  onSelectCallback = onSelect;
  renderSavedAccounts();
}
