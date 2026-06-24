import { wilsonInterval } from "./wilson.js";
import { didPlayerWin, isRadiant } from "./api.js";
import { computeLaneOutcome } from "./lane.js";

const LANE_LABELS = {
  0: "Unknown",
  1: "Safe Lane",
  2: "Mid Lane",
  3: "Off Lane",
  4: "Jungle",
};

export function laneLabel(lane) {
  return LANE_LABELS[lane] ?? `Lane ${lane}`;
}

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

export function analyzeMatches(matches, accountId, heroNames, confidence) {
  const matchups = new Map();
  const laneStats = new Map();
  const timeline = [];

  let processed = 0;
  let skipped = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let laneWon = 0;
  let laneLost = 0;
  let laneDraw = 0;
  let laneUnknown = 0;
  let gameWinsWhenLaneWon = 0;
  let gameWinsWhenLaneLost = 0;
  let gameWinsWhenLaneDraw = 0;

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
    const lane = me.lane ?? 0;
    const laneOutcome = computeLaneOutcome(me, players);
    const goldAt10 = me.gold_t?.[10] ?? null;

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

    timeline.push({
      matchId: details.match_id,
      startTime: details.start_time,
      win,
      lane,
      laneOutcome,
      goldAt10,
      durationMin,
      kills,
      deaths,
    });

    for (const p of players) {
      if (isRadiant(p.player_slot) === mySideRadiant) continue;

      const enemyId = p.hero_id;
      const enemyName = heroNames.get(enemyId) ?? `hero_${enemyId}`;
      const bucket = matchups.get(enemyName) ?? emptyMatchup();

      bucket.games += 1;
      bucket.totalDurationMin += durationMin;
      bucket.totalKills += kills;
      bucket.totalDeaths += deaths;
      if (win) bucket.wins += 1;
      else bucket.losses += 1;

      matchups.set(enemyName, bucket);
    }

    processed += 1;
  }

  const matchupRows = [...matchups.entries()]
    .map(([hero, s]) => {
      const ci = wilsonInterval(s.wins, s.games, confidence);
      const winrate = s.games ? (s.wins / s.games) * 100 : 0;
      return {
        hero,
        games: s.games,
        wins: s.wins,
        losses: s.losses,
        winrate,
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
    overallLaneWinrate,
    overallLaneCi,
    gameWinWhenLaneWon: laneWon ? (gameWinsWhenLaneWon / laneWon) * 100 : null,
    gameWinWhenLaneLost: laneLost ? (gameWinsWhenLaneLost / laneLost) * 100 : null,
    gameWinWhenLaneDraw: laneDraw ? (gameWinsWhenLaneDraw / laneDraw) * 100 : null,
    matchupRows,
    laneRows,
    timeline,
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
