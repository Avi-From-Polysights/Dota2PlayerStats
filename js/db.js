export const DB_NAME = "dota2-player-stats";
export const DB_VERSION = 5;
export const MATCH_STORE = "matches";
export const MATCH_LIST_STORE = "matchLists";
export const ACCOUNT_STORE = "accounts";
export const PARSE_FAILURES_STORE = "parseFailures";

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error ?? new Error("Could not open local storage"));
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (event.oldVersion > 0 && event.oldVersion < 5) {
        for (const store of [MATCH_STORE, MATCH_LIST_STORE]) {
          if (db.objectStoreNames.contains(store)) {
            db.deleteObjectStore(store);
          }
        }
      }

      if (!db.objectStoreNames.contains(MATCH_STORE)) {
        db.createObjectStore(MATCH_STORE, { keyPath: "matchId" });
      }
      if (!db.objectStoreNames.contains(MATCH_LIST_STORE)) {
        db.createObjectStore(MATCH_LIST_STORE, { keyPath: "cacheKey" });
      }
      if (!db.objectStoreNames.contains(ACCOUNT_STORE)) {
        db.createObjectStore(ACCOUNT_STORE, { keyPath: "accountId" });
      }
      if (!db.objectStoreNames.contains(PARSE_FAILURES_STORE)) {
        db.createObjectStore(PARSE_FAILURES_STORE, { keyPath: "key" });
      }
    };
  });

  return dbPromise;
}
