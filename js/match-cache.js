import {
  ACCOUNT_STORE,
  MATCH_LIST_STORE,
  MATCH_STORE,
  openDb,
} from "./db.js";
import { clearAllParseFailures } from "./parse-failures.js";

export function buildMatchListCacheKey({
  accountId,
  heroId,
  limit,
  significant,
  patchId,
  excludeTurbo,
  rankedOnly,
}) {
  return [
    accountId,
    heroId,
    limit,
    significant ? 1 : 0,
    patchId ?? "",
    excludeTurbo ? 1 : 0,
    rankedOnly ? 1 : 0,
  ].join("|");
}

export async function getCachedMatches(matchIds) {
  const ids = [...new Set(matchIds.map(Number))];
  const map = new Map();
  if (!ids.length) return map;

  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(MATCH_STORE, "readonly");
    const store = tx.objectStore(MATCH_STORE);
    let pending = ids.length;

    for (const id of ids) {
      const request = store.get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        if (request.result?.data) {
          map.set(id, request.result.data);
        }
        pending -= 1;
        if (pending === 0) resolve();
      };
    }
  });

  return map;
}

export async function getCachedMatch(matchId) {
  const map = await getCachedMatches([matchId]);
  return map.get(Number(matchId)) ?? null;
}

export async function setCachedMatch(matchId, data, meta = {}) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MATCH_STORE, "readwrite");
    const store = tx.objectStore(MATCH_STORE);
    const id = Number(matchId);

    const request = store.get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const existing = request.result ?? {};
      store.put({
        matchId: id,
        data,
        savedAt: Date.now(),
        parseStatus: meta.parseStatus ?? existing.parseStatus ?? null,
        parseAccountId: meta.parseAccountId ?? existing.parseAccountId ?? null,
        parseAttempts: meta.parseAttempts ?? existing.parseAttempts ?? 0,
      });
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedMatchList(cacheKey) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MATCH_LIST_STORE, "readonly");
    const request = tx.objectStore(MATCH_LIST_STORE).get(cacheKey);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const row = request.result;
      if (!row?.matches?.length) {
        resolve(null);
        return;
      }
      resolve({ matches: row.matches, turboSkipped: row.turboSkipped ?? 0, rankedSkipped: row.rankedSkipped ?? 0 });
    };
  });
}

export async function setCachedMatchList(cacheKey, { matches, turboSkipped, rankedSkipped = 0 }) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MATCH_LIST_STORE, "readwrite");
    tx.objectStore(MATCH_LIST_STORE).put({
      cacheKey,
      matches,
      turboSkipped,
      rankedSkipped,
      savedAt: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearMatchCache() {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction([MATCH_STORE, MATCH_LIST_STORE], "readwrite");
    tx.objectStore(MATCH_STORE).clear();
    tx.objectStore(MATCH_LIST_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await clearAllParseFailures();
}

export async function getMatchCacheCount() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MATCH_STORE, "readonly");
    const request = tx.objectStore(MATCH_STORE).count();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

/** All cached match details where the account appears in the player list. */
export async function getCachedMatchesForAccount(accountId) {
  const id = Number(accountId);
  if (!id) return [];

  const db = await openDb();
  const rows = await new Promise((resolve, reject) => {
    const tx = db.transaction(MATCH_STORE, "readonly");
    const request = tx.objectStore(MATCH_STORE).getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result ?? []);
  });

  const details = [];
  const seen = new Set();
  for (const row of rows) {
    if (!row?.data?.match_id) continue;
    const me = (row.data.players ?? []).find((p) => p.account_id === id);
    if (!me) continue;
    const matchId = Number(row.matchId ?? row.data.match_id);
    if (seen.has(matchId)) continue;
    seen.add(matchId);
    details.push(row.data);
  }

  return details;
}
