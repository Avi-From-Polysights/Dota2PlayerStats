import { wilsonInterval } from "./wilson.js";
import { didPlayerWin, isRadiant } from "./api.js";

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
  return { games: 0, wins: 0, losses: 0 };
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

export function analyzeMatches(matches, accountId, heroNames, confidence) {
  const matchups = new Map();
  const laneStats = new Map();
  const timeline = [];

  let processed = 0;
  let skipped = 0;
  let totalWins = 0;
  let totalLosses = 0;

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

    if (win) totalWins += 1;
    else totalLosses += 1;

    const laneBucket = laneStats.get(lane) ?? emptyBucket();
    laneBucket.games += 1;
    if (win) laneBucket.wins += 1;
    else laneBucket.losses += 1;
    laneStats.set(lane, laneBucket);

    timeline.push({
      matchId: details.match_id,
      startTime: details.start_time,
      win,
      lane,
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
      const ci = wilsonInterval(s.wins, s.games, confidence);
      return {
        lane,
        label: laneLabel(lane),
        games: s.games,
        wins: s.wins,
        losses: s.losses,
        winrate: s.games ? (s.wins / s.games) * 100 : 0,
        wilsonLower: ci.lower,
        wilsonUpper: ci.upper,
      };
    })
    .sort((a, b) => b.games - a.games);

  timeline.sort((a, b) => a.startTime - b.startTime);

  const totalGames = totalWins + totalLosses;
  const overallCi = wilsonInterval(totalWins, totalGames, confidence);

  return {
    processed,
    skipped,
    totalWins,
    totalLosses,
    totalGames,
    overallWinrate: totalGames ? (totalWins / totalGames) * 100 : 0,
    overallCi,
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
