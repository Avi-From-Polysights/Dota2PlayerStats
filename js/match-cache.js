import {
  ACCOUNT_STORE,
  MATCH_LIST_STORE,
  MATCH_STORE,
  openDb,
} from "./db.js";

export function buildMatchListCacheKey({
  accountId,
  heroId,
  limit,
  significant,
  patchId,
  excludeTurbo,
}) {
  return [
    accountId,
    heroId,
    limit,
    significant ? 1 : 0,
    patchId ?? "",
    excludeTurbo ? 1 : 0,
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

export async function setCachedMatch(matchId, data) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MATCH_STORE, "readwrite");
    tx.objectStore(MATCH_STORE).put({
      matchId: Number(matchId),
      data,
      savedAt: Date.now(),
    });
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
      resolve({ matches: row.matches, turboSkipped: row.turboSkipped ?? 0 });
    };
  });
}

export async function setCachedMatchList(cacheKey, { matches, turboSkipped }) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MATCH_LIST_STORE, "readwrite");
    tx.objectStore(MATCH_LIST_STORE).put({
      cacheKey,
      matches,
      turboSkipped,
      savedAt: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearMatchCache() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([MATCH_STORE, MATCH_LIST_STORE], "readwrite");
    tx.objectStore(MATCH_STORE).clear();
    tx.objectStore(MATCH_LIST_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
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
