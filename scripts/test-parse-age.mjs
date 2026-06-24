import {
  isMatchEligibleForParse,
  PARSE_MAX_AGE_DAYS,
  PARSE_MAX_AGE_MS,
} from "../js/parse-age.js";

const now = Date.UTC(2026, 5, 24);
const day = 24 * 60 * 60 * 1000;

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
  "recent match eligible",
  isMatchEligibleForParse({ start_time: Math.floor((now - 10 * day) / 1000) }, { now })
);
assert(
  "31d match eligible",
  isMatchEligibleForParse(
    { start_time: Math.floor((now - PARSE_MAX_AGE_MS + day) / 1000) },
    { now }
  )
);
assert(
  "old match skipped",
  !isMatchEligibleForParse({ start_time: Math.floor((now - 40 * day) / 1000) }, { now })
);
assert(
  "ignore age limit",
  isMatchEligibleForParse({ start_time: Math.floor((now - 400 * day) / 1000) }, {
    now,
    ignoreAgeLimit: true,
  })
);

if (!ok) process.exit(1);
console.log(`All parse-age tests passed (${PARSE_MAX_AGE_DAYS}d limit)`);
