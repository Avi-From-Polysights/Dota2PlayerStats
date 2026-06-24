import { wilsonInterval } from "./wilson.js";
import { didPlayerWin, isRadiant } from "./api.js";
import { computeLaneOutcome, computeLaneOutcomeVsOpponent, laneLabel, resolvePlayerLane } from "./lane.js";
import { matchEnemyLaneFilter, matchMyLaneFilter } from "./lane-filters.js";
import { GAMEMODE_TURBO } from "./game-modes.js";

function emptyBucket() {
  return {
    games: 0,
    wins: 0,
    losses: 0,
    laneWon: 0,
    laneLost: 0,
    laneDraw: 0,
    laneKnown: 0,
  };
}

function emptyMatchup() {
  return {
    games: 0,
    wins: 0,
    losses: 0,
    laneWon: 0,
    laneLost: 0,
    laneDraw: 0,
    laneGames: 0,
    totalDurationMin: 0,
    totalKills: 0,
    totalDeaths: 0,
  };
}

function laneWinRate(bucket) {
  const decided = bucket.laneWon + bucket.laneLost;
  return decided ? (bucket.laneWon / decided) * 100 : 0;
}

function gameWinRate(bucket) {
  return bucket.games ? (bucket.wins / bucket.games) * 100 : 0;
}

export function analyzeMatches(
  matches,
  accountId,
  heroNames,
  confidence,
  { turboSkippedList = 0, laneFilters = {} } = {}
) {
  const filterMyPosition = Boolean(laneFilters.myLane || laneFilters.myRole);
  const filterEnemyPosition = Boolean(laneFilters.enemyLane || laneFilters.enemyRole);

  const matchups = new Map();
  const laneStats = new Map();
  const patchStats = new Map();
  const timeline = [];

  let processed = 0;
  let skipped = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let laneWon = 0;
  let laneLost = 0;
  let laneDraw = 0;
  let laneUnknown = 0;
  let lanePositionKnown = 0;
  let lanePositionUnknown = 0;
  let parsedReplayCount = 0;
  let turboSkipped = 0;
  let gameWinsWhenLaneWon = 0;
  let gameWinsWhenLaneLost = 0;
  let gameWinsWhenLaneDraw = 0;
  let laneFilterSkipped = 0;

  for (const details of matches) {
    if (!details) {
      skipped += 1;
      continue;
    }

    const players = details.players ?? [];
    const me = players.find((p) => p.account_id === accountId);

    if (!me) {
      skipped += 1;
      continue;
    }

    const mySlot = me.player_slot;
    const mySideRadiant = isRadiant(mySlot);
    const win = didPlayerWin(mySlot, details.radiant_win);
    const durationMin = (details.duration ?? 0) / 60;
    const kills = me.kills ?? 0;
    const deaths = me.deaths ?? 0;
    const laneInfo = resolvePlayerLane(me);
    const lane = laneInfo.lane;
    const laneOutcome = computeLaneOutcome(me, players);
    const goldAt10 = me.gold_t?.[10] ?? null;
    const patch = details.patch ?? null;

    if (details.game_mode === GAMEMODE_TURBO) {
      skipped += 1;
      turboSkipped += 1;
      continue;
    }

    if (filterMyPosition && !matchMyLaneFilter(me, laneFilters, players)) {
      skipped += 1;
      laneFilterSkipped += 1;
      continue;
    }

    if (laneInfo.source === "none") lanePositionUnknown += 1;
    else lanePositionKnown += 1;
    if (laneInfo.hasParsedReplay) parsedReplayCount += 1;

    if (win) totalWins += 1;
    else totalLosses += 1;

    if (laneOutcome === "won") {
      laneWon += 1;
      if (win) gameWinsWhenLaneWon += 1;
    } else if (laneOutcome === "lost") {
      laneLost += 1;
      if (win) gameWinsWhenLaneLost += 1;
    } else if (laneOutcome === "draw") {
      laneDraw += 1;
      if (win) gameWinsWhenLaneDraw += 1;
    } else {
      laneUnknown += 1;
    }

    const laneBucket = laneStats.get(lane) ?? emptyBucket();
    laneBucket.games += 1;
    if (win) laneBucket.wins += 1;
    else laneBucket.losses += 1;
    if (laneOutcome === "won") laneBucket.laneWon += 1;
    else if (laneOutcome === "lost") laneBucket.laneLost += 1;
    else if (laneOutcome === "draw") laneBucket.laneDraw += 1;
    if (laneOutcome) laneBucket.laneKnown += 1;
    laneStats.set(lane, laneBucket);

    const patchKey = patch ?? -1;
    const patchBucket = patchStats.get(patchKey) ?? emptyBucket();
    patchBucket.games += 1;
    if (win) patchBucket.wins += 1;
    else patchBucket.losses += 1;
    patchStats.set(patchKey, patchBucket);

    timeline.push({
      matchId: details.match_id,
      startTime: details.start_time,
      win,
      lane,
      laneLabel: laneInfo.label,
      laneSource: laneInfo.source,
      laneOutcome,
      goldAt10,
      patch,
      durationMin,
      kills,
      deaths,
    });

    for (const p of players) {
      if (isRadiant(p.player_slot) === mySideRadiant) continue;
      if (filterEnemyPosition && !matchEnemyLaneFilter(p, laneFilters, players)) continue;

      const enemyId = p.hero_id;
      const enemyName = heroNames.get(enemyId) ?? `hero_${enemyId}`;
      const bucket = matchups.get(enemyName) ?? emptyMatchup();
      const heroLaneOutcome = computeLaneOutcomeVsOpponent(me, p, players);

      bucket.games += 1;
      bucket.totalDurationMin += durationMin;
      bucket.totalKills += kills;
      bucket.totalDeaths += deaths;
      if (win) bucket.wins += 1;
      else bucket.losses += 1;

      if (heroLaneOutcome === "won") bucket.laneWon += 1;
      else if (heroLaneOutcome === "lost") bucket.laneLost += 1;
      else if (heroLaneOutcome === "draw") bucket.laneDraw += 1;
      if (heroLaneOutcome) bucket.laneGames += 1;

      matchups.set(enemyName, bucket);
    }

    processed += 1;
  }

  const matchupRows = [...matchups.entries()]
    .map(([hero, s]) => {
      const ci = wilsonInterval(s.wins, s.games, confidence);
      const winrate = s.games ? (s.wins / s.games) * 100 : 0;
      const laneDecided = s.laneWon + s.laneLost;
      const laneWinrate = laneDecided ? (s.laneWon / laneDecided) * 100 : null;
      return {
        hero,
        games: s.games,
        wins: s.wins,
        losses: s.losses,
        winrate,
        laneWon: s.laneWon,
        laneLost: s.laneLost,
        laneDraw: s.laneDraw,
        laneRecord: `${s.laneWon}-${s.laneLost}-${s.laneDraw}`,
        laneWinrate,
        laneDecided,
        laneGames: s.laneGames,
        wilsonCenter: ci.center,
        wilsonLower: ci.lower,
        wilsonUpper: ci.upper,
        avgDuration: s.games ? s.totalDurationMin / s.games : 0,
        avgKills: s.games ? s.totalKills / s.games : 0,
        avgDeaths: s.games ? s.totalDeaths / s.games : 0,
      };
    })
    .sort((a, b) => b.games - a.games || a.winrate - b.winrate);

  const laneRows = [...laneStats.entries()]
    .map(([lane, s]) => {
      const gameCi = wilsonInterval(s.wins, s.games, confidence);
      const laneDecided = s.laneWon + s.laneLost;
      const laneCi = wilsonInterval(s.laneWon, laneDecided, confidence);
      return {
        lane,
        label: laneLabel(lane),
        games: s.games,
        wins: s.wins,
        losses: s.losses,
        gameWinrate: gameWinRate(s),
        laneWinrate: laneWinRate(s),
        laneWon: s.laneWon,
        laneLost: s.laneLost,
        laneDraw: s.laneDraw,
        laneKnown: s.laneKnown,
        gameWilsonLower: gameCi.lower,
        gameWilsonUpper: gameCi.upper,
        laneWilsonLower: laneCi.lower,
        laneWilsonUpper: laneCi.upper,
      };
    })
    .sort((a, b) => b.games - a.games);

  const patchRows = [...patchStats.entries()]
    .map(([patchKey, s]) => {
      const patchId = patchKey === -1 ? null : patchKey;
      const ci = wilsonInterval(s.wins, s.games, confidence);
      return {
        patchId,
        games: s.games,
        wins: s.wins,
        losses: s.losses,
        winrate: s.games ? (s.wins / s.games) * 100 : 0,
        wilsonLower: ci.lower,
        wilsonUpper: ci.upper,
      };
    })
    .sort((a, b) => (b.patchId ?? -1) - (a.patchId ?? -1));

  timeline.sort((a, b) => a.startTime - b.startTime);

  const totalGames = totalWins + totalLosses;
  const overallCi = wilsonInterval(totalWins, totalGames, confidence);
  const laneDecided = laneWon + laneLost;
  const overallLaneWinrate = laneDecided ? (laneWon / laneDecided) * 100 : 0;
  const overallLaneCi = wilsonInterval(laneWon, laneDecided, confidence);

  return {
    processed,
    skipped,
    totalWins,
    totalLosses,
    totalGames,
    overallWinrate: totalGames ? (totalWins / totalGames) * 100 : 0,
    overallCi,
    laneWon,
    laneLost,
    laneDraw,
    laneUnknown,
    laneDecided,
    laneOutcomeUnknown: laneUnknown,
    lanePositionKnown,
    lanePositionUnknown,
    parsedReplayCount,
    turboSkipped: turboSkippedList + turboSkipped,
    overallLaneWinrate,
    overallLaneCi,
    gameWinWhenLaneWon: laneWon ? (gameWinsWhenLaneWon / laneWon) * 100 : null,
    gameWinWhenLaneLost: laneLost ? (gameWinsWhenLaneLost / laneLost) * 100 : null,
    gameWinWhenLaneDraw: laneDraw ? (gameWinsWhenLaneDraw / laneDraw) * 100 : null,
    matchupRows,
    laneRows,
    patchRows,
    timeline,
    laneFilterSkipped,
  };
}

export function rollingWinRate(timeline, windowSize) {
  if (!timeline.length) return [];

  const window = Math.max(3, Math.min(windowSize, timeline.length));
  const points = [];

  for (let i = 0; i < timeline.length; i += 1) {
    const start = Math.max(0, i - window + 1);
    const slice = timeline.slice(start, i + 1);
    const wins = slice.filter((m) => m.win).length;
    const winrate = (wins / slice.length) * 100;

    points.push({
      index: i + 1,
      date: new Date(timeline[i].startTime * 1000),
      winrate,
      windowSize: slice.length,
      matchId: timeline[i].matchId,
    });
  }

  return points;
}

export function rollingLaneVsGame(timeline, windowSize) {
  if (!timeline.length) return [];

  const window = Math.max(3, Math.min(windowSize, timeline.length));
  const points = [];

  for (let i = 0; i < timeline.length; i += 1) {
    const start = Math.max(0, i - window + 1);
    const slice = timeline.slice(start, i + 1);
    const gameWins = slice.filter((m) => m.win).length;
    const gameWinrate = (gameWins / slice.length) * 100;

    const laneSlice = slice.filter(
      (m) => m.laneOutcome === "won" || m.laneOutcome === "lost"
    );
    const laneWins = laneSlice.filter((m) => m.laneOutcome === "won").length;
    const laneWinrate = laneSlice.length
      ? (laneWins / laneSlice.length) * 100
      : null;

    points.push({
      index: i + 1,
      date: new Date(timeline[i].startTime * 1000),
      gameWinrate,
      laneWinrate,
      laneSample: laneSlice.length,
      windowSize: slice.length,
      matchId: timeline[i].matchId,
    });
  }

  return points;
}

export function trendDirection(points) {
  if (points.length < 6) return "insufficient";

  const recent = points.slice(-Math.min(20, points.length));
  const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
  const secondHalf = recent.slice(Math.floor(recent.length / 2));

  const avg = (arr) => arr.reduce((s, p) => s + p.winrate, 0) / arr.length;
  const delta = avg(secondHalf) - avg(firstHalf);

  if (delta > 2) return "improving";
  if (delta < -2) return "declining";
  return "stable";
}
