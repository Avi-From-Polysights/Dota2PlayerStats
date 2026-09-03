/**
 * Offline coverage for the match-list scan: date-window paging, per-page
 * reporting, and how upstream failures are classified.
 */
import {
  OpenDotaUnavailableError,
  fetchJson,
  isUpstreamDownStatus,
  loadPlayerMatchesAll,
} from "../js/api.js";
import { setNetworkLogger } from "../js/net-log.js";
import { resetOpenDotaQuotaLedger } from "../js/rate-limit.js";

let ok = true;
const assert = (label, cond) => {
  if (!cond) {
    console.error("FAIL:", label);
    ok = false;
  } else {
    console.log("OK:", label);
  }
};

const DAY = 24 * 60 * 60;
const now = Math.floor(Date.now() / 1000);
const realFetch = globalThis.fetch;

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  };
}

/** Newest-first history: one match per day going back `count` days. */
function fakeHistory(count) {
  return Array.from({ length: count }, (_, i) => ({
    match_id: 900_000 + i,
    start_time: now - i * DAY,
    game_mode: 22,
    lobby_type: 7,
    duration: 2400,
  }));
}

async function withFetch(handler, fn) {
  globalThis.fetch = handler;
  resetOpenDotaQuotaLedger();
  try {
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
}

// --- date-window paging -----------------------------------------------------
{
  const history = fakeHistory(250);
  let requests = 0;

  const batches = [];
  const result = await withFetch(
    async (url) => {
      requests += 1;
      const params = new URL(url).searchParams;
      const offset = Number(params.get("offset"));
      const limit = Number(params.get("limit"));
      return jsonResponse(history.slice(offset, offset + limit));
    },
    () =>
      loadPlayerMatchesAll(1, 0, {
        sinceUnix: now - 31 * DAY,
        onBatch: (info) => batches.push(info),
      })
  );

  assert("stops at the date cutoff", result.matches.length === 32);
  assert("does not page the whole history", requests <= 2);
  assert("every match is inside the window", result.matches.every((m) => m.start_time >= now - 31 * DAY));
  assert("reports a page number", batches[0]?.page === 1);
  assert("reports the batch size", batches[0]?.batchSize === 100);
  assert("reports how far back the page reached", typeof batches[0]?.oldestIso === "string");
}

// --- history shorter than the window ---------------------------------------
{
  const history = fakeHistory(12);
  const batches = [];
  const result = await withFetch(
    async (url) => {
      const params = new URL(url).searchParams;
      const offset = Number(params.get("offset"));
      return jsonResponse(history.slice(offset, offset + Number(params.get("limit"))));
    },
    () =>
      loadPlayerMatchesAll(1, 0, {
        sinceUnix: now - 365 * DAY,
        onBatch: (info) => batches.push(info),
      })
  );

  assert("returns the whole short history", result.matches.length === 12);
  assert("flags that history was exhausted", batches.some((b) => b.exhausted) || batches[0].batchSize < 100);
}

// --- filters still apply inside the window ---------------------------------
{
  const history = fakeHistory(20).map((m, i) =>
    i % 2 === 0 ? { ...m, game_mode: 23 } : m
  );
  const result = await withFetch(
    async () => jsonResponse(history),
    () => loadPlayerMatchesAll(1, 0, { sinceUnix: now - 31 * DAY, excludeTurbo: true })
  );

  assert("turbo matches are filtered out", result.turboSkipped === 10);
  assert("non-turbo matches are kept", result.matches.length === 10);
}

// --- upstream failure classification ---------------------------------------
{
  assert("522 counts as upstream down", isUpstreamDownStatus(522));
  assert("500 does not count as upstream down", !isUpstreamDownStatus(500));

  const events = [];
  setNetworkLogger((event) => events.push(event));

  let thrown = null;
  await withFetch(
    async () => jsonResponse({ error: "down" }, 522),
    async () => {
      try {
        await fetchJson("https://api.opendota.com/api/heroes", {
          label: "heroes",
          maxRetries: 2,
        });
      } catch (error) {
        thrown = error;
      }
    }
  );
  setNetworkLogger(null);

  assert("522 raises OpenDotaUnavailableError", thrown instanceof OpenDotaUnavailableError);
  assert("the error names the status", thrown?.status === 522);
  assert("the error is marked upstreamDown", thrown?.upstreamDown === true);
  assert(
    "the message explains it is not the user's connection",
    /looks down, not your connection/.test(thrown?.message ?? "")
  );
  assert("retries are reported to the network log", events.filter((e) => e.phase === "retry").length === 2);
  assert("giving up is reported once", events.filter((e) => e.phase === "giveup").length === 1);
  assert(
    "the giveup event names the status",
    events.find((e) => e.phase === "giveup")?.error === "HTTP 522"
  );
}

if (!ok) process.exit(1);
console.log("\nAll match-scan tests passed.");
