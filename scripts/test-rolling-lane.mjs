import { rollingLaneVsGame } from "../js/stats.js";

let ok = true;
const assert = (label, cond) => {
  if (!cond) {
    console.error("FAIL:", label);
    ok = false;
  } else {
    console.log("OK:", label);
  }
};

function timeline(entries) {
  return entries.map((entry, i) => ({
    matchId: i + 1,
    startTime: 1_700_000_000 + i * 86400,
    win: entry.win ?? false,
    laneOutcome: entry.laneOutcome ?? null,
  }));
}

const sparse = timeline([
  { win: true, laneOutcome: "won" },
  { win: false },
  { win: true },
  { win: false, laneOutcome: "lost" },
]);

const sparsePoints = rollingLaneVsGame(sparse, 4);
assert(
  "hides lane winrate when half or fewer have lane data",
  sparsePoints.at(-1).laneWinrate === null
);
assert("still shows game winrate", sparsePoints.at(-1).gameWinrate != null);

const dense = timeline(
  Array.from({ length: 6 }, (_, i) => ({
    win: i % 2 === 0,
    laneOutcome: i % 2 === 0 ? "won" : "lost",
  }))
);

const densePoints = rollingLaneVsGame(dense, 6);
assert(
  "shows lane winrate when majority have lane data",
  densePoints.at(-1).laneWinrate === 50
);

if (!ok) process.exit(1);
console.log("Rolling lane chart tests passed");
