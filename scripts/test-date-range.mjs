/**
 * Offline coverage for date filtering: the day-range helpers, the match-list
 * scan window used before analysis, and the matchup-only range used after it.
 * Run: node scripts/test-date-range.mjs
 */
import {
  dayEndUnix,
  dayRangeBounds,
  dayStartUnix,
  formatDayRange,
  hasDayRange,
  indexRangeForBounds,
  isInvertedDayRange,
  isWithinBounds,
  normalizeDayRange,
  toDayInput,
} from "../js/date-range.js";
import { loadPlayerMatchesFiltered } from "../js/api.js";
import { buildMatchListCacheKey } from "../js/match-cache.js";
import { analyzeMatches } from "../js/stats.js";
import { resetOpenDotaQuotaLedger } from "../js/rate-limit.js";

let ok = true;
const assert = (label, cond) => {
  if (!cond) {
    console.error("FAIL:", label);
    ok = false;
  } else {
    console.log("OK:", label);
  }
};

const DAY = 24 * 60 * 60;
const localMidnight = (y, m, d) => Math.floor(new Date(y, m - 1, d).getTime() / 1000);

// --- day helpers ------------------------------------------------------------
{
  assert("day start is local midnight", dayStartUnix("2026-09-01") === localMidnight(2026, 9, 1));
  assert(
    "day end is the second before the next midnight",
    dayEndUnix("2026-09-01") === localMidnight(2026, 9, 2) - 1
  );
  assert("impossible day rejected", dayStartUnix("2026-02-31") === null);
  assert("garbage rejected", dayStartUnix("yesterday") === null && dayEndUnix("") === null);
  assert("toDayInput round-trips", toDayInput(localMidnight(2026, 3, 7) + 3600) === "2026-03-07");

  const swapped = normalizeDayRange({ from: "2026-09-20", to: "2026-09-01" });
  assert("normalize puts ends in order", swapped.from === "2026-09-01" && swapped.to === "2026-09-20");
  assert("inverted range detected", isInvertedDayRange({ from: "2026-09-20", to: "2026-09-01" }));
  assert("ordered range not inverted", !isInvertedDayRange({ from: "2026-09-01", to: "2026-09-20" }));
  assert("open-ended range not inverted", !isInvertedDayRange({ from: "2026-09-20", to: "" }));
  assert("invalid end dropped", normalizeDayRange({ from: "2026-09-01", to: "nope" }).to === "");

  assert("empty range has no bounds", dayRangeBounds({ from: "", to: "" }) === null);
  assert("empty range is inactive", !hasDayRange({}) && hasDayRange({ to: "2026-09-01" }));
  const open = dayRangeBounds({ from: "2026-09-01" });
  assert("missing end leaves side open", open.toUnix === null && open.fromUnix === dayStartUnix("2026-09-01"));

  const bounds = dayRangeBounds({ from: "2026-09-01", to: "2026-09-03" });
  assert("start of first day is inside", isWithinBounds(dayStartUnix("2026-09-01"), bounds));
  assert("late on last day is inside", isWithinBounds(dayEndUnix("2026-09-03"), bounds));
  assert("day after is outside", !isWithinBounds(dayEndUnix("2026-09-03") + 1, bounds));
  assert("no bounds keep everything", isWithinBounds(0, null));
  assert("missing start time excluded when filtering", !isWithinBounds(undefined, bounds));

  const times = [1, 2, 3, 4, 5, 6].map((d) => localMidnight(2026, 9, d) + 12 * 3600);
  const range = indexRangeForBounds(times, bounds);
  assert("index range covers the days", range?.start === 0 && range?.end === 2);
  assert(
    "index range is null when nothing falls inside",
    indexRangeForBounds(times, dayRangeBounds({ from: "2027-01-01" })) === null
  );
  assert("index range is null without bounds", indexRangeForBounds(times, null) === null);

  assert("format names both ends", formatDayRange({ from: "2026-09-01", to: "2026-09-03" }).includes("–"));
  assert("format open start", formatDayRange({ from: "2026-09-01" }).startsWith("since "));
  assert("format open end", formatDayRange({ to: "2026-09-01" }).startsWith("until "));
  assert("format empty", formatDayRange({}) === "");
}

// --- match-list cache key ---------------------------------------------------
{
  const base = {
    accountId: 1,
    heroId: 2,
    limit: 250,
    significant: false,
    patchId: null,
    excludeTurbo: true,
    rankedOnly: false,
  };
  assert(
    "cache key unchanged when no dates are set",
    buildMatchListCacheKey(base) === "1|2|250|0||1|0|1|1|0"
  );
  assert(
    "cache key differs per date range",
    buildMatchListCacheKey({ ...base, dateFrom: "2026-09-01" }) !==
      buildMatchListCacheKey({ ...base, dateTo: "2026-09-01" })
  );
}

// --- match-list scan window -------------------------------------------------
{
  const now = Math.floor(Date.now() / 1000);
  const realFetch = globalThis.fetch;
  // Newest-first history: one match per day going back 400 days.
  const history = Array.from({ length: 400 }, (_, i) => ({
    match_id: 500_000 - i,
    start_time: now - i * DAY,
    game_mode: 22,
    lobby_type: 7,
  }));

  async function scan(limit, window) {
    let requests = 0;
    globalThis.fetch = async (url) => {
      requests += 1;
      const params = new URL(url).searchParams;
      const offset = Number(params.get("offset"));
      const batchLimit = Number(params.get("limit"));
      const body = history.slice(offset, offset + batchLimit);
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(body) };
    };
    resetOpenDotaQuotaLedger();
    try {
      const result = await loadPlayerMatchesFiltered(1, 2, limit, false, null, window);
      return { ...result, requests };
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  const sinceUnix = now - 30 * DAY;
  const recent = await scan(250, { sinceUnix });
  assert("since: keeps only the window", recent.matches.length === 31);
  assert("since: stops at the first older match", recent.requests === 1);

  const untilUnix = now - 300 * DAY;
  const old = await scan(20, { untilUnix });
  assert("until: skips newer matches", old.matches.every((m) => m.start_time <= untilUnix));
  assert("until: still fills the limit", old.matches.length === 20);
  // limit 20 gives a scan budget of 120; the 300 newer matches must not use it up.
  assert("until: newer matches do not use the scan budget", old.matches[0].start_time === now - 300 * DAY);

  const both = await scan(250, { sinceUnix: now - 100 * DAY, untilUnix: now - 90 * DAY });
  assert(
    "since + until: inclusive window",
    both.matches.length === 11 &&
      both.matches.every((m) => m.start_time >= now - 100 * DAY && m.start_time <= now - 90 * DAY)
  );

  const unfiltered = await scan(50, {});
  assert("no window: unchanged behaviour", unfiltered.matches.length === 50);
}

// --- selected date range ----------------------------------------------------
{
  const ME = 42;
  const heroNames = new Map([
    [1, "Kez"],
    [2, "Axe"],
    [3, "Lina"],
  ]);
  const match = (id, startTime, enemyHeroId, radiantWin) => ({
    match_id: id,
    start_time: startTime,
    radiant_win: radiantWin,
    duration: 1800,
    game_mode: 22,
    lobby_type: 7,
    players: [
      { account_id: ME, player_slot: 0, hero_id: 1, kills: 5, deaths: 2 },
      { account_id: 7, player_slot: 128, hero_id: enemyHeroId },
    ],
  });
  const sept = (d) => localMidnight(2026, 9, d) + 18 * 3600;
  const matches = [
    match(1, sept(1), 2, true),
    match(2, sept(2), 2, false),
    match(3, sept(10), 3, true),
    match(4, sept(11), 3, true),
  ];
  const opts = { excludeBots: false };

  const all = analyzeMatches(matches, ME, heroNames, 0.95, opts);
  const narrowed = analyzeMatches(matches, ME, heroNames, 0.95, {
    ...opts,
    dateRange: dayRangeBounds({ from: "2026-09-10", to: "2026-09-30" }),
  });

  assert("no range: every match counts", all.totalGames === 4 && all.dateSkipped === 0);
  assert(
    "range narrows matchup rows",
    narrowed.matchupRows.length === 1 && narrowed.matchupRows[0].hero === "Lina"
  );
  assert(
    "range narrows the totals, like the position filter",
    narrowed.totalGames === 2 && narrowed.totalWins === 2 && narrowed.overallWinrate === 100
  );
  assert("range counts what it left out", narrowed.dateSkipped === 2 && narrowed.processed === 2);
  assert("range narrows the timeline", narrowed.timeline.every((m) => m.startTime >= sept(10)));
  assert("range narrows the patch rows", narrowed.patchRows.reduce((sum, row) => sum + row.games, 0) === 2);

  const empty = analyzeMatches(matches, ME, heroNames, 0.95, {
    ...opts,
    dateRange: dayRangeBounds({ from: "2027-01-01" }),
  });
  assert("range with no games leaves nothing", empty.matchupRows.length === 0 && empty.totalGames === 0);
}

if (!ok) process.exit(1);
console.log("All date range tests passed.");
