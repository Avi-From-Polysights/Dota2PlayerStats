import { loadMatchDetails } from "./api.js";
import { ensureMatchParsed, isMatchParsedForPlayer } from "./parse.js";
import {
  PARSE_OUTCOME,
  clearParseFailure,
  parseFailureLabel,
  recordParseFailure,
} from "./parse-failures.js";
import { formatRateLimitWaitMessage } from "./rate-limit.js";
import { setCachedMatch } from "./match-cache.js";
import { runPool } from "./parallel-pool.js";
import { effectiveConcurrency } from "./parse-concurrency.js";
import {
  isMatchEligibleForParse,
  PARSE_MAX_AGE_DAYS,
  parseAgeSkipMessage,
} from "./parse-age.js";
import { enrichMatchFromStratz } from "./stratz.js";

export function createLoadStats() {
  return {
    cacheHits: 0,
    fetched: 0,
    parseQueued: 0,
    newlyParsed: 0,
    parseTimedOut: 0,
    parseFailed: 0,
    parseIncomplete: 0,
    parseExcluded: 0,
    parseRetries: 0,
    parseSkippedTooOld: 0,
    stratzEnriched: 0,
    stratzFailed: 0,
    rateLimited: 0,
    throttlePauses: 0,
    unparsed: 0,
    matchListFromCache: false,
    excludedMatches: [],
    incompleteMatches: [],
  };
}

export function formatLoadStats(loadStats) {
  const parts = [];
  if (loadStats.matchListFromCache) parts.push("match list from cache");
  if (loadStats.cacheHits) parts.push(`${loadStats.cacheHits} from cache`);
  if (loadStats.fetched) parts.push(`${loadStats.fetched} from OpenDota`);
  if (loadStats.newlyParsed) parts.push(`${loadStats.newlyParsed} newly parsed`);
  if (loadStats.parseIncomplete) {
    parts.push(`${loadStats.parseIncomplete} incomplete parse (no lane data)`);
  }
  if (loadStats.parseExcluded) {
    parts.push(`${loadStats.parseExcluded} excluded after max retries`);
  }
  if (loadStats.parseRetries) parts.push(`${loadStats.parseRetries} parse retry(s)`);
  if (loadStats.parseSkippedTooOld) {
    parts.push(`${loadStats.parseSkippedTooOld} skipped (>${PARSE_MAX_AGE_DAYS}d)`);
  }
  if (loadStats.stratzEnriched) parts.push(`${loadStats.stratzEnriched} via STRATZ`);
  if (loadStats.stratzFailed) parts.push(`${loadStats.stratzFailed} STRATZ miss`);
  if (loadStats.parseFailed) parts.push(`${loadStats.parseFailed} parse failed`);
  if (loadStats.throttlePauses) {
    parts.push(`${loadStats.throttlePauses} rate-limit pause(s)`);
  }
  if (loadStats.rateLimited) parts.push("some requests rejected (429)");
  if (loadStats.unparsed) parts.push(`${loadStats.unparsed} still unparsed`);
  return parts.length ? parts.join(" · ") : "";
}

export function createRateLimitWaitHandler(loadStats, log) {
  return (info) => {
    loadStats.throttlePauses += 1;
    const msg = formatRateLimitWaitMessage(info);
    log?.wait(msg);
  };
}

function formatParseProgress(matchIndex, total, matchId, meta = {}) {
  const label = `${matchIndex + 1}/${total}`;
  const elapsed = meta.elapsedSec ?? Math.round((meta.elapsedMs ?? 0) / 1000);

  switch (meta.phase) {
    case "initial-wait":
      return `OpenDota processing replay ${label} (${elapsed}s, first check soon)…`;
    case "poll-wait":
      return `Waiting for parse ${label} — ${elapsed}s elapsed (ID ${matchId})…`;
    case "poll-error":
      return `Parse check failed ${label} (${elapsed}s) — retrying…`;
    case "done":
      return `Parse complete ${label} in ${elapsed}s (ID ${matchId})`;
    case "timeout":
      return `Parse timed out ${label} after ${elapsed}s (ID ${matchId})`;
    default:
      return `Waiting for OpenDota parse ${label} — ${elapsed}s (ID ${matchId})…`;
  }
}

async function cacheMatchProgress(matchId, data, accountId, parseStatus, parseAttempts) {
  await setCachedMatch(matchId, data, {
    parseStatus,
    parseAccountId: accountId,
    parseAttempts,
  });
}

async function runParseAttempt(
  matchId,
  accountId,
  {
    signal,
    onRateLimitWait,
    log,
    matchIndex,
    total,
    initialDetails,
  }
) {
  return ensureMatchParsed(matchId, accountId, {
    signal,
    initialDetails,
    onRateLimitWait,
    onLog: (message) => log?.parse(message),
    onPoll: (_details, meta) => {
      log?.parse(formatParseProgress(matchIndex, total, matchId, meta));
    },
  });
}

function isParseSuccess(outcome) {
  return outcome === PARSE_OUTCOME.SUCCESS || outcome === PARSE_OUTCOME.ALREADY;
}

export async function resolveMatchDetails(
  matchId,
  accountId,
  {
    signal,
    requestParse,
    parseBudget,
    parseRetry,
    parseMaxRetries,
    loadStats,
    matchIndex,
    total,
    onRateLimitWait,
    cachedDetails = null,
    hasCachedEntry = false,
    log,
    parseIgnoreAgeLimit = false,
    matchListItem = null,
    useStratzFallback = false,
    stratzToken = "",
  }
) {
  let details = hasCachedEntry ? cachedDetails : null;
  let usedNetwork = false;
  let excluded = false;
  let incomplete = false;

  if (hasCachedEntry) {
    loadStats.cacheHits += 1;
    log?.cache(`Match ${matchId} loaded from local cache`);
  } else {
    log?.fetch(`Fetching match ${matchId} from OpenDota`);
    details = await loadMatchDetails(matchId, signal, { onRateLimitWait });
    loadStats.fetched += 1;
    usedNetwork = true;
    await cacheMatchProgress(matchId, details, accountId, "fetched", 0);
    log?.cache(`Match ${matchId} saved to local cache`);
  }

  const alreadyParsed = details && isMatchParsedForPlayer(details, accountId);
  const ageSource = matchListItem ?? details;
  const parseEligible = isMatchEligibleForParse(ageSource, {
    ignoreAgeLimit: parseIgnoreAgeLimit,
  });

  const shouldParse =
    requestParse &&
    details &&
    !alreadyParsed &&
    parseEligible &&
    (parseBudget.remaining === Infinity || parseBudget.remaining > 0);

  if (requestParse && details && !alreadyParsed && !parseEligible) {
    loadStats.parseSkippedTooOld += 1;
    loadStats.unparsed += 1;
    log?.info(parseAgeSkipMessage(matchId, ageSource?.start_time ?? details?.start_time));
  } else if (shouldParse) {
    loadStats.parseQueued += 1;
    if (parseBudget.remaining !== Infinity) parseBudget.remaining -= 1;
    usedNetwork = true;

    const maxAttempts = parseRetry ? 1 + Math.max(0, parseMaxRetries) : 1;
    log?.parse(`Starting parse for match ${matchId} (${matchIndex + 1}/${total})`);

    let attempt = 0;
    let lastOutcome = null;

    while (attempt < maxAttempts) {
      attempt += 1;
      if (attempt > 1) {
        loadStats.parseRetries += 1;
        log?.parse(`Retry ${attempt - 1}/${parseMaxRetries} for match ${matchId}…`);
      }

      try {
        const result = await runParseAttempt(matchId, accountId, {
          signal,
          onRateLimitWait,
          log,
          matchIndex,
          total,
          initialDetails: details,
        });

        details = result.details;
        lastOutcome = result.outcome;

        if (isParseSuccess(result.outcome)) {
          loadStats.newlyParsed += 1;
          await cacheMatchProgress(matchId, details, accountId, "complete", attempt);
          await clearParseFailure(accountId, matchId);
          log?.cache(`Match ${matchId} parse complete — cached`);
          break;
        }

        await cacheMatchProgress(matchId, details, accountId, "partial", attempt);

        if (attempt < maxAttempts && parseRetry) {
          continue;
        }

        if (parseRetry && attempt >= maxAttempts) {
          excluded = true;
          loadStats.parseExcluded += 1;
          loadStats.excludedMatches.push({
            matchId: Number(matchId),
            reason: result.outcome,
            attempts: attempt,
          });
          await recordParseFailure({
            accountId,
            matchId,
            reason: result.outcome,
            attempts: attempt,
            message: parseFailureLabel(result.outcome),
          });
          log?.warn(
            `Match ${matchId} excluded after ${attempt} attempt(s) — ${parseFailureLabel(result.outcome)}`
          );
          details = null;
        } else {
          incomplete = true;
          loadStats.parseIncomplete += 1;
          loadStats.incompleteMatches.push({
            matchId: Number(matchId),
            reason: result.outcome,
          });
          if (result.outcome === PARSE_OUTCOME.TIMEOUT) loadStats.parseTimedOut += 1;
          else loadStats.parseFailed += 1;
          log?.cache(`Match ${matchId} saved without lane data (parse incomplete)`);
        }
      } catch (error) {
        loadStats.parseFailed += 1;
        if (error?.rateLimited) loadStats.rateLimited += 1;
        lastOutcome = PARSE_OUTCOME.ERROR;

        if (details) {
          await cacheMatchProgress(matchId, details, accountId, "partial", attempt);
        }

        if (attempt < maxAttempts && parseRetry && !error?.rateLimited) {
          continue;
        }

        if (parseRetry && attempt >= maxAttempts) {
          excluded = true;
          loadStats.parseExcluded += 1;
          loadStats.excludedMatches.push({
            matchId: Number(matchId),
            reason: PARSE_OUTCOME.ERROR,
            attempts: attempt,
          });
          await recordParseFailure({
            accountId,
            matchId,
            reason: PARSE_OUTCOME.ERROR,
            attempts: attempt,
            message: error.message ?? "Parse error",
          });
          details = null;
        } else if (!error?.rateLimited) {
          incomplete = true;
          loadStats.parseIncomplete += 1;
          loadStats.incompleteMatches.push({
            matchId: Number(matchId),
            reason: PARSE_OUTCOME.ERROR,
          });
        }
        break;
      }
    }

    if (lastOutcome && !isParseSuccess(lastOutcome) && !excluded && !incomplete) {
      incomplete = true;
      loadStats.parseIncomplete += 1;
    }
  } else if (details && !alreadyParsed) {
    loadStats.unparsed += 1;
  } else if (details && alreadyParsed) {
    await cacheMatchProgress(matchId, details, accountId, "complete", 0);
  }

  if (
    details &&
    useStratzFallback &&
    stratzToken &&
    !isMatchParsedForPlayer(details, accountId)
  ) {
    const stratzResult = await enrichMatchFromStratz(
      details,
      matchId,
      accountId,
      stratzToken,
      { signal, log }
    );
    details = stratzResult.details;
    if (stratzResult.enriched) {
      loadStats.stratzEnriched += 1;
      await cacheMatchProgress(matchId, details, accountId, "complete", 0);
      await clearParseFailure(accountId, matchId).catch(() => {});
    } else if (stratzResult.error) {
      loadStats.stratzFailed += 1;
    }
  }

  return { details, usedNetwork, excluded, incomplete };
}

/**
 * Load match details for a list, optionally parsing in parallel worker lanes.
 */
export async function loadMatchDetailsBatch({
  matchList,
  accountId,
  requestParse,
  parseBudget,
  parseRetry = false,
  parseMaxRetries = 0,
  concurrency,
  signal,
  cachedDetailsMap,
  multiLog,
  loadStats,
  onProgress,
  patchId = null,
  parseIgnoreAgeLimit = false,
  useStratzFallback = false,
  stratzToken = "",
}) {
  const total = matchList.length;
  const slots = effectiveConcurrency(requestParse, concurrency, concurrency);
  multiLog?.configureWorkers(slots);

  if (slots > 1) {
    multiLog?.info(
      `Parallel ${requestParse ? "parse" : "fetch"}: ${slots} lanes (OpenDota ~60 req/min shared across lanes)`
    );
  }

  if (requestParse && !parseIgnoreAgeLimit) {
    multiLog?.info(
      `Parse age limit: replays older than ${PARSE_MAX_AGE_DAYS} days are skipped (use Full history parse in Tools to attempt anyway)`
    );
  } else if (requestParse && parseIgnoreAgeLimit) {
    multiLog?.info(
      `Full history parse — attempting all ages (OpenDota usually fails beyond ~${PARSE_MAX_AGE_DAYS} days)`
    );
  }

  if (requestParse && parseRetry) {
    multiLog?.info(`Parse retries enabled — up to ${parseMaxRetries} retry per match`);
  } else if (requestParse) {
    multiLog?.info(
      "Parse retries off — timed-out matches stay in sample without lane data (noted in results)"
    );
  }

  if (useStratzFallback && stratzToken) {
    multiLog?.info("STRATZ fallback enabled for matches still missing lane data after OpenDota");
  } else if (useStratzFallback) {
    multiLog?.warn("STRATZ fallback checked but no API token — add one from stratz.com/api");
  }

  const onRateLimitWait = createRateLimitWaitHandler(loadStats, multiLog?.overview());

  let completed = 0;

  const results = await runPool(
    matchList,
    async (match, index, workerId) => {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      const matchId = match.match_id;
      const numericId = Number(matchId);
      const hasCachedEntry = cachedDetailsMap.has(numericId);
      const laneLog = multiLog?.lane(workerId);

      try {
        const { details, excluded } = await resolveMatchDetails(matchId, accountId, {
          signal,
          requestParse,
          parseBudget,
          parseRetry,
          parseMaxRetries,
          loadStats,
          matchIndex: index,
          total,
          onRateLimitWait,
          cachedDetails: cachedDetailsMap.get(numericId) ?? null,
          hasCachedEntry,
          log: laneLog,
          parseIgnoreAgeLimit,
          matchListItem: match,
          useStratzFallback,
          stratzToken,
        });

        completed += 1;
        onProgress?.({
          completed,
          total,
          matchId,
          index,
          hasCachedEntry,
          workerId,
          excluded,
        });

        if (excluded || !details) return null;

        if (patchId != null && details?.patch != null && details.patch !== patchId) {
          return null;
        }
        return details;
      } catch (error) {
        completed += 1;
        onProgress?.({ completed, total, matchId, index, error: true, workerId });
        if (error?.rateLimited) loadStats.rateLimited += 1;
        return null;
      }
    },
    { concurrency: slots, signal }
  );

  return results;
}
