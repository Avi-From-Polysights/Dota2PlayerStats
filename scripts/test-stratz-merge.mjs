import { mergeStratzLaneIntoOpenDota, parseStratzLane, parseStratzPosition } from "../js/stratz.js";
import { isMatchParsedForPlayer } from "../js/parse.js";

const accountId = 12345;
const details = {
  players: [{ account_id: accountId, hero_id: 2, player_slot: 0 }],
};

const stratzMatch = {
  players: [
    {
      steamAccountId: accountId,
      heroId: 2,
      lane: "MID_LANE",
      position: "POSITION_2",
      stats: {
        networthPerMinute: Array.from({ length: 11 }, (_, i) => 4000 + i * 100),
        lastHitsPerMinute: Array.from({ length: 11 }, (_, i) => i * 3),
      },
    },
  ],
};

let ok = true;
const assert = (label, cond) => {
  if (!cond) {
    console.error("FAIL:", label);
    ok = false;
  } else {
    console.log("OK:", label);
  }
};

assert("lane map", parseStratzLane("MID_LANE") === 2);
assert("position map", parseStratzPosition("POSITION_4") === 4);
assert("merge", mergeStratzLaneIntoOpenDota(details, stratzMatch, accountId));
assert("parsed after merge", isMatchParsedForPlayer(details, accountId));
assert("lane set", details.players[0].lane === 2);

if (!ok) process.exit(1);
console.log("STRATZ merge tests passed");
