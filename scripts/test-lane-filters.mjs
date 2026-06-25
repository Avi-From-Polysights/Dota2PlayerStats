import {
  resolveDotaPosition,
  computeLaneOutcome,
  computeLaneOutcomeVsOpponent,
  isLaneOpponent,
} from "../js/lane.js";
import { matchMyLaneFilter, matchEnemyLaneFilter } from "../js/lane-filters.js";

function player(slot, lane, lh10, wards = 0, extra = {}) {
  return {
    player_slot: slot,
    lane,
    lh_t: lh10 != null ? Array(11).fill(lh10) : undefined,
    lane_last_hits: lh10,
    obs_placed: wards,
    sen_placed: 0,
    lane_total_gold: extra.gold,
    ...extra,
  };
}

let ok = true;
const assert = (label, cond) => {
  if (!cond) {
    console.error("FAIL:", label);
    ok = false;
  } else {
    console.log("OK:", label);
  }
};

// Positions
const teamRadiant = [
  player(0, 1, 80), // pos 1 safe carry
  player(1, 2, 70), // pos 2 mid
  player(2, 3, 65), // pos 3 off
  player(3, 3, 8, 4), // pos 4 soft sup off
  player(4, 1, 4, 5), // pos 5 hard sup safe
];
const teamDire = [
  player(128, 1, 75),
  player(129, 2, 68),
  player(130, 3, 60),
  player(131, 3, 10, 3),
  player(132, 1, 3, 6),
];
const all = [...teamRadiant, ...teamDire];

assert("pos 1", resolveDotaPosition(teamRadiant[0], all) === 1);
assert("pos 2", resolveDotaPosition(teamRadiant[1], all) === 2);
assert("pos 3", resolveDotaPosition(teamRadiant[2], all) === 3);
assert("pos 4", resolveDotaPosition(teamRadiant[3], all) === 4);
assert("pos 5", resolveDotaPosition(teamRadiant[4], all) === 5);

assert("pos 4 filter", matchMyLaneFilter(teamRadiant[3], { myRole: "4" }, all));
assert("pos 5 filter", matchMyLaneFilter(teamRadiant[4], { myRole: "5" }, all));
assert("pos 4 rejects pos 5", !matchMyLaneFilter(teamRadiant[4], { myRole: "4" }, all));

// Enemy lane filter uses OpenDota map lane, not STRATZ Dota position
const offlaner = { player_slot: 130, lane: 3, lane_role: 3, stratz_position: 1 };
assert(
  "enemy offlane filter (lane=3)",
  matchEnemyLaneFilter(offlaner, { enemyLane: "3" }, all)
);
assert(
  "enemy offlane rejects safelane filter",
  !matchEnemyLaneFilter(offlaner, { enemyLane: "1" }, all)
);
assert(
  "lane_role fallback when lane missing",
  matchEnemyLaneFilter({ player_slot: 130, lane_role: 3 }, { enemyLane: "3" }, all)
);
assert(
  "stratz pos 1 must not map to safelane without lane",
  !matchEnemyLaneFilter({ player_slot: 130, stratz_position: 1 }, { enemyLane: "1" }, all)
);
assert(
  "stratz pos 1 matches role filter",
  matchEnemyLaneFilter(offlaner, { enemyRole: "1" }, all)
);

// Per-hero lane outcome
const me = player(1, 2, 70, 0, { gold: 5200 });
const enemyMid = player(129, 2, 50, 0, { gold: 4100 });
const enemyOff = player(130, 3, 60, 0, { gold: 4500 });
const players = [me, enemyMid, enemyOff];

assert("mid is lane opponent", isLaneOpponent(me, enemyMid, players));
assert("off is not lane opponent", !isLaneOpponent(me, enemyOff, players));
assert("won lane vs mid", computeLaneOutcomeVsOpponent(me, enemyMid, players) === "won");
assert("null vs off", computeLaneOutcomeVsOpponent(me, enemyOff, players) === null);

// Dual-lane team gold (OpenDota-style): support shares carry lane outcome
const carry = player(0, 1, 80, 0, { gold: 5000 });
const support = player(4, 1, 4, 5, { gold: 1500 });
const enemyCarry = player(128, 1, 75, 0, { gold: 3000 });
const enemySupport = player(132, 1, 3, 6, { gold: 2500 });
const dualLane = [carry, support, enemyCarry, enemySupport];

assert("carry won dual lane", computeLaneOutcome(carry, dualLane) === "won");
assert("support won dual lane", computeLaneOutcome(support, dualLane) === "won");
assert(
  "support same as carry",
  computeLaneOutcome(support, dualLane) === computeLaneOutcome(carry, dualLane)
);
assert(
  "vs opponent uses team outcome",
  computeLaneOutcomeVsOpponent(support, enemyCarry, dualLane) === "won"
);

const losingSupport = player(4, 1, 4, 5, { gold: 1200 });
const losingDual = [carry, losingSupport, enemyCarry, enemySupport];
assert(
  "support not solo-lost when team won",
  computeLaneOutcome(losingSupport, losingDual) === "won"
);

if (!ok) process.exit(1);
console.log("All tests passed");
