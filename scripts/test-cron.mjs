import {
  cronMatches,
  nextCronRun,
  parseCron,
} from "../addon/dota2-stats/app/scheduler.mjs";

let ok = true;
const assert = (label, cond) => {
  if (!cond) {
    console.error("FAIL:", label);
    ok = false;
  } else {
    console.log("OK:", label);
  }
};

const weekly = parseCron("0 5 * * 1");
assert("weekly matches Monday 05:00", cronMatches(weekly, new Date(2026, 8, 7, 5, 0)));
assert("weekly ignores Monday 05:01", !cronMatches(weekly, new Date(2026, 8, 7, 5, 1)));
assert("weekly ignores Tuesday 05:00", !cronMatches(weekly, new Date(2026, 8, 8, 5, 0)));

const next = nextCronRun(weekly, new Date(2026, 8, 2, 12, 0));
assert("next weekly run is the coming Monday", next.getDay() === 1 && next.getHours() === 5);
assert("next weekly run is in the future", next.getTime() > new Date(2026, 8, 2, 12, 0).getTime());

const everySixHours = parseCron("30 */6 * * *");
assert("step hours match 00:30", cronMatches(everySixHours, new Date(2026, 8, 2, 0, 30)));
assert("step hours match 18:30", cronMatches(everySixHours, new Date(2026, 8, 2, 18, 30)));
assert("step hours skip 19:30", !cronMatches(everySixHours, new Date(2026, 8, 2, 19, 30)));

const listed = parseCron("0 9 * * 1,3,5");
assert("list matches Wednesday", cronMatches(listed, new Date(2026, 8, 2, 9, 0)));
assert("list skips Thursday", !cronMatches(listed, new Date(2026, 8, 3, 9, 0)));

const ranged = parseCron("0 8-10 * * *");
assert("range matches 09:00", cronMatches(ranged, new Date(2026, 8, 2, 9, 0)));
assert("range skips 11:00", !cronMatches(ranged, new Date(2026, 8, 2, 11, 0)));

// Standard cron: restricted day-of-month OR day-of-week both match.
const domOrDow = parseCron("0 0 1 * 0");
assert("dom/dow union matches the 1st", cronMatches(domOrDow, new Date(2026, 8, 1, 0, 0)));
assert("dom/dow union matches Sunday", cronMatches(domOrDow, new Date(2026, 8, 6, 0, 0)));
assert("dom/dow union skips other days", !cronMatches(domOrDow, new Date(2026, 8, 2, 0, 0)));

let threw = false;
try {
  parseCron("0 5 * *");
} catch {
  threw = true;
}
assert("rejects a 4-field expression", threw);

threw = false;
try {
  parseCron("99 5 * * *");
} catch {
  threw = true;
}
assert("rejects out-of-range minutes", threw);

if (!ok) process.exit(1);
console.log("\nAll cron tests passed.");
