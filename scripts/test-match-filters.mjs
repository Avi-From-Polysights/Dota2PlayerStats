import {
  classifyMatchDetails,
  classifyMatchSummary,
} from "../js/match-filters.js";
import { looksLikeBotMatch } from "../js/lobby-types.js";
import { exportMatchupCsv, exportRawMatchesCsv } from "../js/export-csv.js";

let ok = true;
const assert = (label, cond) => {
  if (!cond) {
    console.error("FAIL:", label);
    ok = false;
  } else {
    console.log("OK:", label);
  }
};

assert(
  "co-op bots lobby skipped when excludeBots",
  !classifyMatchSummary({ lobby_type: 4, game_mode: 22 }, { excludeBots: true }).keep
);
assert(
  "practice lobby skipped when excludePractice",
  !classifyMatchSummary({ lobby_type: 1, game_mode: 22 }, { excludePractice: true }).keep
);
assert(
  "ranked lobby kept for ranked only",
  classifyMatchSummary({ lobby_type: 7, game_mode: 22 }, { rankedOnly: true }).keep
);
assert(
  "ability draft dropped by standardModesOnly",
  !classifyMatchSummary({ lobby_type: 0, game_mode: 18 }, { standardModesOnly: true }).keep
);
assert(
  "all draft kept by standardModesOnly",
  classifyMatchSummary({ lobby_type: 0, game_mode: 22 }, { standardModesOnly: true }).keep
);

const botMatch = {
  lobby_type: 0,
  game_mode: 22,
  players: [
    { account_id: 1, player_slot: 0, hero_id: 1 },
    { account_id: null, player_slot: 128, hero_id: 2 },
    { account_id: 0, player_slot: 129, hero_id: 3 },
    { account_id: null, player_slot: 130, hero_id: 4 },
    { account_id: null, player_slot: 131, hero_id: 5 },
    { account_id: null, player_slot: 132, hero_id: 6 },
  ],
};
assert("heuristic bot match detected", looksLikeBotMatch(botMatch, 1));
assert(
  "heuristic bot match filtered in details",
  !classifyMatchDetails(botMatch, 1, { excludeBots: true }).keep
);

assert("exportMatchupCsv is a function", typeof exportMatchupCsv === "function");
assert("exportRawMatchesCsv is a function", typeof exportRawMatchesCsv === "function");

if (!ok) process.exit(1);
console.log("match-filters / export tests passed.");
