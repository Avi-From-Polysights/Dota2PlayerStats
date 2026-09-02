import { getStorageBackend } from "./storage/backend.js";

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
  const backend = await getStorageBackend();
  return backend.recordParseFailure({ accountId, matchId, reason, attempts, message });
}

export async function clearParseFailure(accountId, matchId) {
  const backend = await getStorageBackend();
  return backend.clearParseFailure(accountId, matchId);
}

export async function listParseFailures(accountId) {
  const backend = await getStorageBackend();
  return backend.listParseFailures(accountId);
}

export async function getParseFailureCount(accountId) {
  const rows = await listParseFailures(accountId);
  return rows.length;
}

export async function clearAllParseFailures() {
  const backend = await getStorageBackend();
  return backend.clearAllParseFailures();
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
