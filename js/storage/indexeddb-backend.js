/**
 * Browser storage backend — the original IndexedDB implementation, unchanged in
 * behaviour, moved behind the backend interface in ./backend.js.
 */
import {
  ACCOUNT_STORE,
  MATCH_LIST_STORE,
  MATCH_STORE,
  PARSE_FAILURES_STORE,
  openDb,
} from "../db.js";

function parseFailureKey(accountId, matchId) {
  return `${accountId}|${matchId}`;
}

export function createIndexedDbBackend() {
  return {
    async getMatches(matchIds) {
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
    },

    async setMatch(matchId, data, meta = {}) {
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
    },

    async getMatchList(cacheKey) {
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
          resolve({
            matches: row.matches,
            turboSkipped: row.turboSkipped ?? 0,
            rankedSkipped: row.rankedSkipped ?? 0,
            botsSkipped: row.botsSkipped ?? 0,
            practiceSkipped: row.practiceSkipped ?? 0,
            modeSkipped: row.modeSkipped ?? 0,
          });
        };
      });
    },

    async setMatchList(cacheKey, payload) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(MATCH_LIST_STORE, "readwrite");
        tx.objectStore(MATCH_LIST_STORE).put({
          cacheKey,
          matches: payload.matches,
          turboSkipped: payload.turboSkipped,
          rankedSkipped: payload.rankedSkipped ?? 0,
          botsSkipped: payload.botsSkipped ?? 0,
          practiceSkipped: payload.practiceSkipped ?? 0,
          modeSkipped: payload.modeSkipped ?? 0,
          savedAt: Date.now(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },

    async clearMatches() {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction([MATCH_STORE, MATCH_LIST_STORE], "readwrite");
        tx.objectStore(MATCH_STORE).clear();
        tx.objectStore(MATCH_LIST_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },

    async countMatches() {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(MATCH_STORE, "readonly");
        const request = tx.objectStore(MATCH_STORE).count();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    },

    async getMatchesForAccount(accountId) {
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
    },

    async recordParseFailure({ accountId, matchId, reason, attempts, message = null }) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(PARSE_FAILURES_STORE, "readwrite");
        tx.objectStore(PARSE_FAILURES_STORE).put({
          key: parseFailureKey(accountId, matchId),
          accountId: Number(accountId),
          matchId: Number(matchId),
          reason,
          attempts,
          message,
          lastAttemptAt: Date.now(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },

    async clearParseFailure(accountId, matchId) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(PARSE_FAILURES_STORE, "readwrite");
        tx.objectStore(PARSE_FAILURES_STORE).delete(parseFailureKey(accountId, matchId));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },

    async listParseFailures(accountId) {
      const db = await openDb();
      const id = Number(accountId);
      return new Promise((resolve, reject) => {
        const tx = db.transaction(PARSE_FAILURES_STORE, "readonly");
        const request = tx.objectStore(PARSE_FAILURES_STORE).getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const rows = (request.result ?? []).filter((row) => row.accountId === id);
          rows.sort((a, b) => b.lastAttemptAt - a.lastAttemptAt);
          resolve(rows);
        };
      });
    },

    async clearAllParseFailures() {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(PARSE_FAILURES_STORE, "readwrite");
        tx.objectStore(PARSE_FAILURES_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },

    async listAccounts() {
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
    },

    async getAccount(accountId) {
      const db = await openDb();
      const id = Number(accountId);
      return new Promise((resolve, reject) => {
        const tx = db.transaction(ACCOUNT_STORE, "readonly");
        const request = tx.objectStore(ACCOUNT_STORE).get(id);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result ?? null);
      });
    },

    async putAccount(entry) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(ACCOUNT_STORE, "readwrite");
        tx.objectStore(ACCOUNT_STORE).put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },

    async removeAccount(accountId) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(ACCOUNT_STORE, "readwrite");
        tx.objectStore(ACCOUNT_STORE).delete(Number(accountId));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
  };
}
