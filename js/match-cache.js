/**
 * Match cache API. Storage lives behind ./storage/backend.js so the same calls
 * work against IndexedDB (browser) and the filesystem (Home Assistant app).
 */
import { getStorageBackend } from "./storage/backend.js";
import { clearAllParseFailures } from "./parse-failures.js";

export function buildMatchListCacheKey({
  accountId,
  heroId,
  limit,
  significant,
  patchId,
  excludeTurbo,
  rankedOnly,
  excludeBots = true,
  excludePractice = true,
  standardModesOnly = false,
}) {
  return [
    accountId,
    heroId,
    limit,
    significant ? 1 : 0,
    patchId ?? "",
    excludeTurbo ? 1 : 0,
    rankedOnly ? 1 : 0,
    excludeBots ? 1 : 0,
    excludePractice ? 1 : 0,
    standardModesOnly ? 1 : 0,
  ].join("|");
}

export async function getCachedMatches(matchIds) {
  const backend = await getStorageBackend();
  return backend.getMatches(matchIds);
}

export async function getCachedMatch(matchId) {
  const map = await getCachedMatches([matchId]);
  return map.get(Number(matchId)) ?? null;
}

export async function setCachedMatch(matchId, data, meta = {}) {
  const backend = await getStorageBackend();
  return backend.setMatch(matchId, data, meta);
}

export async function getCachedMatchList(cacheKey) {
  const backend = await getStorageBackend();
  return backend.getMatchList(cacheKey);
}

export async function setCachedMatchList(
  cacheKey,
  {
    matches,
    turboSkipped,
    rankedSkipped = 0,
    botsSkipped = 0,
    practiceSkipped = 0,
    modeSkipped = 0,
  }
) {
  const backend = await getStorageBackend();
  return backend.setMatchList(cacheKey, {
    matches,
    turboSkipped,
    rankedSkipped,
    botsSkipped,
    practiceSkipped,
    modeSkipped,
  });
}

export async function clearMatchCache() {
  const backend = await getStorageBackend();
  await backend.clearMatches();
  await clearAllParseFailures();
}

export async function getMatchCacheCount() {
  const backend = await getStorageBackend();
  return backend.countMatches();
}

/** All cached match details where the account appears in the player list. */
export async function getCachedMatchesForAccount(accountId) {
  const backend = await getStorageBackend();
  return backend.getMatchesForAccount(accountId);
}
