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
assert("stratz position stored", details.players[0].stratz_position === 2);
assert("lane_role not overwritten", details.players[0].lane_role === undefined);

const offlaneDetails = {
  players: [{ account_id: 999, hero_id: 42, player_slot: 128, lane: 3, lane_role: 3 }],
};
const offlaneStratz = {
  players: [
    {
      steamAccountId: 999,
      heroId: 42,
      lane: "SAFE_LANE",
      position: "POSITION_1",
      stats: { networthPerMinute: [0], lastHitsPerMinute: [0] },
    },
  ],
};
mergeStratzLaneIntoOpenDota(offlaneDetails, offlaneStratz, 999);
assert("opendota lane preserved", offlaneDetails.players[0].lane === 3);
assert("opendota lane_role preserved", offlaneDetails.players[0].lane_role === 3);
assert("stratz pos on offlaner", offlaneDetails.players[0].stratz_position === 1);
assert("snapshot lane_role kept", offlaneDetails.players[0].opendota_lane_role === 3);

if (!ok) process.exit(1);
console.log("STRATZ merge tests passed");
