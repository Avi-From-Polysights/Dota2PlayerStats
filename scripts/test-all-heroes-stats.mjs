import { aggregateAllHeroStats, filterHeroRows } from "../js/all-heroes-stats.js";

let ok = true;
const assert = (label, cond) => {
  if (!cond) {
    console.error("FAIL:", label);
    ok = false;
  } else {
    console.log("OK:", label);
  }
};

const heroNames = new Map([
  [1, "Anti-Mage"],
  [2, "Axe"],
  [74, "Invoker"],
]);

function makeMatch({ matchId, heroId, win, gameMode = 1, lobbyType = 7, laneGold = null }) {
  const radiantWin = win;
  return {
    match_id: matchId,
    game_mode: gameMode,
    lobby_type: lobbyType,
    duration: 2400,
    radiant_win: radiantWin,
    players: [
      {
        account_id: 100,
        hero_id: heroId,
        player_slot: 0,
        kills: 5,
        deaths: 2,
        lane_role: 2,
        gold_t: laneGold,
      },
      {
        account_id: 200,
        hero_id: 99,
        player_slot: 128,
        lane_role: 2,
        gold_t: laneGold ? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, laneGold[10] - 500] : null,
      },
    ],
  };
}

const matches = [
  makeMatch({ matchId: 1, heroId: 1, win: true, laneGold: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4000] }),
  makeMatch({ matchId: 2, heroId: 1, win: false, laneGold: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2000] }),
  makeMatch({ matchId: 3, heroId: 2, win: true }),
  makeMatch({ matchId: 4, heroId: 74, win: true }),
  makeMatch({ matchId: 5, heroId: 74, win: true }),
  makeMatch({ matchId: 6, heroId: 1, win: true, gameMode: 23 }),
];

const agg = aggregateAllHeroStats(matches, 100, heroNames, 0.95, { excludeTurbo: true });
assert("three heroes", agg.heroCount === 3);
assert("anti-mage two ranked games", agg.rows.find((r) => r.heroId === 1)?.games === 2);
assert("turbo excluded", agg.turboSkipped === 1);

const am = agg.rows.find((r) => r.heroId === 1);
assert("anti-mage 50% win", am && am.winrate === 50);
assert("anti-mage lane data", am && am.laneDecided === 2);

const filtered = filterHeroRows(agg.rows, { minGames: 2 });
assert("min games filter", filtered.length === 2);

if (!ok) process.exit(1);
console.log("All heroes stats tests passed.");
