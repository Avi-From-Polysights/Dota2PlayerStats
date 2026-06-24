import { loadMatchDetails, requestMatchParse } from "./api.js";

/** Lane stats need gold at minute 10 from a parsed replay. */
export function isMatchParsedForPlayer(details, accountId) {
  const me = details?.players?.find((p) => p.account_id === accountId);
  return Array.isArray(me?.gold_t) && me.gold_t.length > 10;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Queue an OpenDota parse and poll until lane data appears or timeout.
 * Each request counts as ~10 API calls toward OpenDota rate limits.
 */
export async function ensureMatchParsed(
  matchId,
  accountId,
  {
    signal,
    pollMs = 6000,
    maxWaitMs = 120000,
    onPoll,
    initialDetails = null,
  } = {}
) {
  let details = initialDetails ?? (await loadMatchDetails(matchId, signal));
  if (isMatchParsedForPlayer(details, accountId)) return details;

  await requestMatchParse(matchId, signal);

  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    await sleep(pollMs);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    details = await loadMatchDetails(matchId, signal);
    onPoll?.(details);

    if (isMatchParsedForPlayer(details, accountId)) return details;
  }

  return details;
}
