import {
  accountsNeedingRetry,
  delayForPendingRetry,
  isTransientFailure,
  nextRetryAt,
  retryDelayMs,
} from "../addon/dota2-stats/app/retry.mjs";
import { OpenDotaRateLimitError, OpenDotaUnavailableError } from "../js/api.js";

let ok = true;
const assert = (label, cond) => {
  if (!cond) {
    console.error("FAIL:", label);
    ok = false;
  } else {
    console.log("OK:", label);
  }
};

// --- what counts as worth retrying ------------------------------------------
assert("an outage is transient", isTransientFailure(new OpenDotaUnavailableError(522)));
assert("a 500 is transient", isTransientFailure(new OpenDotaUnavailableError(500)));
assert("a rate limit is transient", isTransientFailure(new OpenDotaRateLimitError()));
assert("a timeout is transient", isTransientFailure(new Error("no response within 30s")));
assert("a DNS failure is transient", isTransientFailure(new Error("getaddrinfo EAI_AGAIN api.opendota.com")));
assert("fetch failed is transient", isTransientFailure(new Error("fetch failed")));

assert("a 404 is not transient", !isTransientFailure(new Error("HTTP 404 for /players/1")));
assert("a parse bug is not transient", !isTransientFailure(new TypeError("x is not a function")));
assert("no error is not transient", !isTransientFailure(null));

// --- which accounts get retried ---------------------------------------------
{
  const results = [
    { account: { slug: "1-ok" }, analysis: { totalGames: 10 } },
    { account: { slug: "2-down" }, analysis: null, error: "OpenDota is not responding", retryable: true },
    { account: { slug: "3-never-ran" }, analysis: null, skipped: true },
    { account: { slug: "4-bad-id" }, analysis: null, error: "HTTP 404", retryable: false },
  ];

  const retryable = accountsNeedingRetry(results);
  assert("successful accounts are not retried", !retryable.includes("1-ok"));
  assert("transiently failed accounts are retried", retryable.includes("2-down"));
  assert("never-attempted accounts are retried", retryable.includes("3-never-ran"));
  assert("permanently failed accounts are not retried", !retryable.includes("4-bad-id"));
  assert("only the two are queued", retryable.length === 2);
}

assert("an all-clear run queues nothing", accountsNeedingRetry([
  { account: { slug: "a" }, analysis: { totalGames: 1 } },
]).length === 0);
assert("an empty run queues nothing", accountsNeedingRetry([]).length === 0);

// --- interval maths ----------------------------------------------------------
assert("4 hours is 14400000ms", retryDelayMs(4) === 14_400_000);
assert("zero disables retries", retryDelayMs(0) === 0);
assert("nonsense disables retries", retryDelayMs("soon") === 0);

const base = Date.UTC(2026, 8, 3, 12, 0, 0);
const next = nextRetryAt(4, base);
assert("the next retry is 4 hours out", next.getTime() - base === 14_400_000);
assert("disabled retries have no next time", nextRetryAt(0, base) === null);

// --- resuming a retry across a restart --------------------------------------
{
  const future = new Date(base + 90 * 60 * 1000).toISOString();
  assert(
    "a future retry keeps its time",
    delayForPendingRetry({ at: future }, { now: base }) === 90 * 60 * 1000
  );

  const past = new Date(base - 10 * 60 * 60 * 1000).toISOString();
  assert(
    "a retry missed while stopped waits out the grace period",
    delayForPendingRetry({ at: past }, { now: base }) === 60_000
  );

  assert("no pending retry means no delay", delayForPendingRetry(null) === null);
  assert("a malformed retry means no delay", delayForPendingRetry({ at: "not a date" }) === null);
}

if (!ok) process.exit(1);
console.log("\nAll retry tests passed.");
