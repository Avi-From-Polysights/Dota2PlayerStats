import { openDb, PARSE_FAILURES_STORE } from "./db.js";

export const PARSE_OUTCOME = {
  SUCCESS: "success",
  ALREADY: "already_parsed",
  TIMEOUT: "timeout",
  ERROR: "error",
};

export function parseFailureKey(accountId, matchId) {
  return `${accountId}|${matchId}`;
}

export async function recordParseFailure({
  accountId,
  matchId,
  reason,
  attempts,
  message = null,
}) {
  const db = await openDb();
  const key = parseFailureKey(accountId, matchId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PARSE_FAILURES_STORE, "readwrite");
    tx.objectStore(PARSE_FAILURES_STORE).put({
      key,
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
}

export async function clearParseFailure(accountId, matchId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PARSE_FAILURES_STORE, "readwrite");
    tx.objectStore(PARSE_FAILURES_STORE).delete(parseFailureKey(accountId, matchId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listParseFailures(accountId) {
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
}

export async function getParseFailureCount(accountId) {
  const rows = await listParseFailures(accountId);
  return rows.length;
}

export async function clearAllParseFailures() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PARSE_FAILURES_STORE, "readwrite");
    tx.objectStore(PARSE_FAILURES_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function parseFailureLabel(reason) {
  switch (reason) {
    case PARSE_OUTCOME.TIMEOUT:
      return "Parse timed out (no lane data)";
    case PARSE_OUTCOME.ERROR:
      return "Parse request failed";
    default:
      return reason ?? "Unknown";
  }
}
