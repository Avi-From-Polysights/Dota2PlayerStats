import { resolveOpenDotaLaneRole, isSupportPlayer } from "../js/lane.js";
import { matchMyLaneFilter, matchEnemyLaneFilter } from "../js/lane-filters.js";

const jungle = { lane: 4, lane_role: 1 };
const support = {
  lane: 1,
  lane_role: 1,
  lh_t: Array(11).fill(5),
  obs_placed: 3,
  sen_placed: 1,
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

assert("jungle role via lane", resolveOpenDotaLaneRole(jungle) === 4);
assert("support heuristic", isSupportPlayer(support));
assert("role jungle filter", matchMyLaneFilter(jungle, { myRole: "4" }));
assert("role support filter", matchMyLaneFilter(support, { myRole: "support" }));
assert(
  "role support rejects core",
  !matchMyLaneFilter(
    { lane: 1, lane_role: 1, lh_t: Array(11).fill(50), obs_placed: 0 },
    { myRole: "support" }
  )
);
assert("enemy support", matchEnemyLaneFilter(support, { enemyRole: "support" }));

if (!ok) process.exit(1);
console.log("All tests passed");
