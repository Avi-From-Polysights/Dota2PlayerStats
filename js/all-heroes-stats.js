import { didPlayerWin } from "./api.js";
import { GAMEMODE_TURBO } from "./game-modes.js";
import { isRankedLobby } from "./lobby-types.js";
import { computeLaneOutcome, resolvePlayerLane } from "./lane.js";
import { wilsonInterval } from "./wilson.js";

function emptyHeroBucket() {
  return {
    games: 0,
    wins: 0,
    losses: 0,
    laneWon: 0,
    laneLost: 0,
    laneDraw: 0,
    laneUnknown: 0,
    parsedReplayCount: 0,
    totalKills: 0,
    totalDeaths: 0,
    totalDurationMin: 0,
  };
}

/**
 * Aggregate per-hero stats from cached match details for one account.
 * @param {object[]} matches OpenDota match detail payloads
 * @param {number} accountId
 * @param {Map<number, string>} heroNames
 * @param {number} confidence Wilson confidence level (0–1)
 * @param {{ excludeTurbo?: boolean, rankedOnly?: boolean }} [options]
 */
export function aggregateAllHeroStats(
  matches,
  accountId,
  heroNames,
  confidence,
  { excludeTurbo = true, rankedOnly = false } = {}
) {
  const byHero = new Map();
  let scanned = 0;
  let skippedNoPlayer = 0;
  let turboSkipped = 0;
  let rankedSkipped = 0;

  for (const details of matches) {
    if (!details) continue;
    scanned += 1;

    const players = details.players ?? [];
    const me = players.find((p) => p.account_id === accountId);
    if (!me) {
      skippedNoPlayer += 1;
      continue;
    }

    if (excludeTurbo && details.game_mode === GAMEMODE_TURBO) {
      turboSkipped += 1;
      continue;
    }

    if (rankedOnly && !isRankedLobby(details.lobby_type)) {
      rankedSkipped += 1;
      continue;
    }

    const heroId = me.hero_id;
    const bucket = byHero.get(heroId) ?? emptyHeroBucket();
    const win = didPlayerWin(me.player_slot, details.radiant_win);
    const laneOutcome = computeLaneOutcome(me, players);
    const laneInfo = resolvePlayerLane(me);

    bucket.games += 1;
    if (win) bucket.wins += 1;
    else bucket.losses += 1;
    bucket.totalKills += me.kills ?? 0;
    bucket.totalDeaths += me.deaths ?? 0;
    bucket.totalDurationMin += (details.duration ?? 0) / 60;

    if (laneOutcome === "won") bucket.laneWon += 1;
    else if (laneOutcome === "lost") bucket.laneLost += 1;
    else if (laneOutcome === "draw") bucket.laneDraw += 1;
    else bucket.laneUnknown += 1;

    if (laneInfo.hasParsedReplay) bucket.parsedReplayCount += 1;

    byHero.set(heroId, bucket);
  }

  const rows = [...byHero.entries()]
    .map(([heroId, s]) => {
      const gameCi = wilsonInterval(s.wins, s.games, confidence);
      const laneDecided = s.laneWon + s.laneLost;
      const laneCi = wilsonInterval(s.laneWon, laneDecided, confidence);
      const winrate = s.games ? (s.wins / s.games) * 100 : 0;
      const laneWinrate = laneDecided ? (s.laneWon / laneDecided) * 100 : null;

      return {
        heroId,
        hero: heroNames.get(heroId) ?? `Hero ${heroId}`,
        games: s.games,
        wins: s.wins,
        losses: s.losses,
        winrate,
        laneWon: s.laneWon,
        laneLost: s.laneLost,
        laneDraw: s.laneDraw,
        laneDecided,
        laneWinrate,
        laneRecord: `${s.laneWon}-${s.laneLost}-${s.laneDraw}`,
        parsedReplayCount: s.parsedReplayCount,
        wilsonLower: gameCi.lower,
        wilsonUpper: gameCi.upper,
        laneWilsonLower: laneDecided ? laneCi.lower : null,
        laneWilsonUpper: laneDecided ? laneCi.upper : null,
        avgKills: s.games ? s.totalKills / s.games : 0,
        avgDeaths: s.games ? s.totalDeaths / s.games : 0,
        avgDuration: s.games ? s.totalDurationMin / s.games : 0,
      };
    })
    .sort((a, b) => b.games - a.games || b.winrate - a.winrate);

  const totalGames = rows.reduce((sum, r) => sum + r.games, 0);
  const totalWins = rows.reduce((sum, r) => sum + r.wins, 0);

  return {
    rows,
    totalGames,
    totalWins,
    totalLosses: totalGames - totalWins,
    heroCount: rows.length,
    scanned,
    skippedNoPlayer,
    turboSkipped,
    rankedSkipped,
  };
}

/** @param {ReturnType<typeof aggregateAllHeroStats>['rows']} rows */
export function filterHeroRows(rows, { minGames = 1 } = {}) {
  const min = Math.max(1, Number(minGames) || 1);
  return rows.filter((r) => r.games >= min);
}
