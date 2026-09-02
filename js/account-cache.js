import { getStorageBackend } from "./storage/backend.js";

const MAX_ACCOUNTS = 12;

export function accountDisplayName(account) {
  if (account?.name) return account.name;
  if (account?.personaname) return account.personaname;
  return `Player ${account?.accountId ?? "?"}`;
}

export function accountAvatarUrl(account) {
  return account?.avatarFull || account?.avatar || null;
}

export async function listSavedAccounts() {
  const backend = await getStorageBackend();
  return backend.listAccounts();
}

export async function saveAccount(record) {
  const backend = await getStorageBackend();
  const now = Date.now();
  const entry = {
    accountId: Number(record.accountId),
    personaname: record.personaname ?? null,
    name: record.name ?? null,
    avatar: record.avatar ?? null,
    avatarFull: record.avatarFull ?? null,
    profileUrl:
      record.profileUrl ??
      `https://www.opendota.com/players/${Number(record.accountId)}`,
    savedAt: record.savedAt ?? now,
    lastUsedAt: record.lastUsedAt ?? now,
  };

  await backend.putAccount(entry);

  const all = await listSavedAccounts();
  if (all.length <= MAX_ACCOUNTS) return entry;

  const toRemove = all.slice(MAX_ACCOUNTS);
  await Promise.all(toRemove.map((row) => removeSavedAccount(row.accountId)));
  return entry;
}

export async function touchSavedAccount(accountId, updates = {}) {
  const backend = await getStorageBackend();
  const id = Number(accountId);
  const existing = await backend.getAccount(id);
  if (!existing) return null;

  return saveAccount({
    ...existing,
    ...updates,
    accountId: id,
    lastUsedAt: Date.now(),
  });
}

export async function removeSavedAccount(accountId) {
  const backend = await getStorageBackend();
  return backend.removeAccount(accountId);
}
