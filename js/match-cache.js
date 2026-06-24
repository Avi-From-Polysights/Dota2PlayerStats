import { MATCH_STORE, openDb } from "./db.js";

export async function getCachedMatch(matchId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MATCH_STORE, "readonly");
    const request = tx.objectStore(MATCH_STORE).get(Number(matchId));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result?.data ?? null);
  });
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

export async function clearMatchCache() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MATCH_STORE, "readwrite");
    tx.objectStore(MATCH_STORE).clear();
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
