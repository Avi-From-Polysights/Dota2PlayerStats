import { ACCOUNT_STORE, openDb } from "./db.js";

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
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ACCOUNT_STORE, "readonly");
    const request = tx.objectStore(ACCOUNT_STORE).getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const rows = (request.result ?? []).sort(
        (a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0)
      );
      resolve(rows);
    };
  });
}

export async function saveAccount(record) {
  const db = await openDb();
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

  await new Promise((resolve, reject) => {
    const tx = db.transaction(ACCOUNT_STORE, "readwrite");
    tx.objectStore(ACCOUNT_STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  const all = await listSavedAccounts();
  if (all.length <= MAX_ACCOUNTS) return entry;

  const toRemove = all.slice(MAX_ACCOUNTS);
  await Promise.all(toRemove.map((row) => removeSavedAccount(row.accountId)));
  return entry;
}

export async function touchSavedAccount(accountId, updates = {}) {
  const db = await openDb();
  const id = Number(accountId);

  const existing = await new Promise((resolve, reject) => {
    const tx = db.transaction(ACCOUNT_STORE, "readonly");
    const request = tx.objectStore(ACCOUNT_STORE).get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result ?? null);
  });

  if (!existing) return null;

  return saveAccount({
    ...existing,
    ...updates,
    accountId: id,
    lastUsedAt: Date.now(),
  });
}

export async function removeSavedAccount(accountId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ACCOUNT_STORE, "readwrite");
    tx.objectStore(ACCOUNT_STORE).delete(Number(accountId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
