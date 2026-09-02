/**
 * Headless equivalent of the browser's Tools → Parse-all flow
 * (js/tools/parse-all.js), minus the DOM. Reuses the same loaders, parser,
 * rate limiter and analytics as the website.
 */
import { loadHeroes, loadPlayerMatchesAll, loadPlayerProfile, profileFromPlayerResponse } from "../../../js/api.js";
import { getCachedMatches } from "../../../js/match-cache.js";
import { isMatchParsedForPlayer } from "../../../js/parse.js";
import { PARSE_MAX_AGE_DAYS } from "../../../js/parse-age.js";
import {
  createLoadStats,
  formatLoadStats,
  loadMatchDetailsBatch,
} from "../../../js/match-loader.js";
import { analyzeMatches } from "../../../js/stats.js";
import { aggregateAllHeroStats } from "../../../js/all-heroes-stats.js";
import { writeAccountExports, writeCombinedExports } from "./exports.mjs";

let heroMapPromise = null;

async function getHeroMap(signal) {
  if (!heroMapPromise) {
    heroMapPromise = loadHeroes({ signal }).then(
      (list) => new Map(list.map((h) => [h.id, h.name]))
    );
  }
  return heroMapPromise;
}

async function resolveDisplayName(account, signal) {
  if (account.name && !/^Player \d+$/.test(account.name)) return account.name;
  try {
    const data = await loadPlayerProfile(account.accountId, signal);
    const profile = profileFromPlayerResponse(data, account.accountId);
    return profile.personaname ?? profile.name ?? account.name;
  } catch {
    return account.name;
  }
}

/** Fetch, parse and analyze one account's recent history. */
export async function runAccount(account, options, { log, signal, onProgress } = {}) {
  const startedAt = Date.now();
  const sinceUnix = Math.floor(startedAt / 1000) - options.days * 24 * 60 * 60;
  const loadStats = createLoadStats();
  const heroMap = await getHeroMap(signal);

  log?.info(
    `${account.name} (${account.accountId}) — scanning last ${options.days} days ` +
      `(since ${new Date(sinceUnix * 1000).toISOString().slice(0, 10)})`
  );

  const scan = await loadPlayerMatchesAll(account.accountId, 0, {
    ...options.filters,
    significant: options.significant,
    sinceUnix,
    signal,
    onRateLimitWait: (info) => {
      loadStats.throttlePauses += 1;
      log?.wait(
        `OpenDota limit — waiting ${Math.ceil(info.waitMs / 1000)}s before the next match-list page…`
      );
    },
    onBatch: ({ collected, offset }) => {
      onProgress?.({ phase: "scan", collected, offset });
    },
  });

  const skipNotes = [
    scan.turboSkipped ? `${scan.turboSkipped} turbo` : null,
    scan.rankedSkipped ? `${scan.rankedSkipped} non-ranked` : null,
    scan.botsSkipped ? `${scan.botsSkipped} bots` : null,
    scan.practiceSkipped ? `${scan.practiceSkipped} practice` : null,
    scan.modeSkipped ? `${scan.modeSkipped} non-standard modes` : null,
  ].filter(Boolean);

  log?.info(
    `${account.name}: ${scan.matches.length} matches in window` +
      (skipNotes.length ? ` (${skipNotes.join(", ")} filtered out)` : "")
  );

  if (!scan.matches.length) {
    return {
      account,
      analysis: null,
      loadStats,
      games: 0,
      startedAt,
      finishedAt: Date.now(),
      message: "No matches in the selected window.",
    };
  }

  const matchIds = scan.matches.map((m) => Number(m.match_id));
  const cachedDetailsMap = await getCachedMatches(matchIds);

  const needsWork = scan.matches.filter((match) => {
    const cached = cachedDetailsMap.get(Number(match.match_id));
    if (!cached) return true;
    // Without parsing there is nothing more to gain from a cached match.
    return options.requestParse && !isMatchParsedForPlayer(cached, account.accountId);
  });
  const fromCache = scan.matches.length - needsWork.length;

  log?.info(
    `${account.name}: ${fromCache} served from cache · ${needsWork.length} to fetch` +
      (options.requestParse
        ? `/parse (replays older than ${PARSE_MAX_AGE_DAYS} days are fetched but not parsed)`
        : " (parsing disabled)")
  );

  const results = needsWork.length
    ? await loadMatchDetailsBatch({
        matchList: needsWork,
        accountId: account.accountId,
        requestParse: options.requestParse,
        parseBudget: { remaining: Infinity },
        parseRetry: options.requestParse && options.parseRetries > 0,
        parseMaxRetries: options.parseRetries,
        concurrency: options.parseConcurrency,
        signal,
        cachedDetailsMap,
        multiLog: log,
        loadStats,
        useStratzFallback: false,
        onProgress: ({ completed, total, matchId, workerId, hasCachedEntry }) => {
          onProgress?.({
            phase: "parse",
            completed,
            total,
            matchId,
            workerId,
            hasCachedEntry,
          });
        },
      })
    : [];

  // Final sample: freshly loaded details win, cached details fill the rest.
  const byId = new Map();
  for (const id of matchIds) {
    const cached = cachedDetailsMap.get(id);
    if (cached) byId.set(id, cached);
  }
  for (const details of results) {
    if (details?.match_id) byId.set(Number(details.match_id), details);
  }

  const detailsList = matchIds.map((id) => byId.get(id)).filter(Boolean);

  const analysis = analyzeMatches(detailsList, account.accountId, heroMap, options.confidence, {
    ...options.filters,
    turboSkippedList: scan.turboSkipped,
    rankedSkippedList: scan.rankedSkipped,
    botsSkippedList: scan.botsSkipped,
    practiceSkippedList: scan.practiceSkipped,
    modeSkippedList: scan.modeSkipped,
    laneFilters: {},
  });

  const heroes = aggregateAllHeroStats(
    detailsList,
    account.accountId,
    heroMap,
    options.confidence,
    { excludeTurbo: options.filters.excludeTurbo, rankedOnly: options.filters.rankedOnly }
  );

  const summary = formatLoadStats(loadStats);
  log?.info(`${account.name}: ${summary || "no network work needed"}`);
  log?.info(
    `${account.name}: ${analysis.totalGames} games · ${analysis.overallWinrate.toFixed(1)}% win · ` +
      `${analysis.overallLaneWinrate.toFixed(1)}% lane win · ` +
      `${analysis.parsedReplayCount}/${analysis.totalGames} with lane data`
  );

  return {
    account,
    analysis,
    heroes,
    loadStats,
    games: analysis.totalGames,
    startedAt,
    finishedAt: Date.now(),
  };
}

/** Run every selected account in sequence and write all exports. */
export async function runAll(accounts, options, { log, signal, onProgress } = {}) {
  const startedAt = Date.now();
  const results = [];

  log?.info(
    `Run started — ${accounts.length} account(s), ${options.days} day window, ` +
      `${options.parseConcurrency} lanes` +
      (options.requestParse ? "" : ", parsing disabled")
  );

  for (const [index, account] of accounts.entries()) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    onProgress?.({ phase: "account", index, total: accounts.length, account });

    const named = { ...account, name: await resolveDisplayName(account, signal) };

    try {
      const result = await runAccount(named, options, { log, signal, onProgress });
      if (result.analysis) {
        await writeAccountExports(result, options);
        log?.info(`${named.name}: exports written`);
      }
      results.push(result);
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      log?.warn(`${named.name} failed: ${error.message ?? error}`);
      results.push({ account: named, analysis: null, error: String(error.message ?? error) });
    }
  }

  const withData = results.filter((r) => r.analysis);
  if (withData.length) {
    await writeCombinedExports(withData, options);
    log?.info(`Combined exports written for ${withData.length} account(s)`);
  }

  const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1);
  log?.info(`Run complete in ${elapsedMin} min`);

  return { startedAt, finishedAt: Date.now(), results };
}
