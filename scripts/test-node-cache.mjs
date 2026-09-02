/**
 * Exercises the Node filesystem storage backend through the same public cache
 * API the browser uses (js/match-cache.js, js/parse-failures.js).
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setStorageBackend } from "../js/storage/backend.js";
import { createNodeFsBackend } from "../js/storage/node-fs-backend.js";
import {
  clearMatchCache,
  getCachedMatch,
  getCachedMatchList,
  getCachedMatches,
  getCachedMatchesForAccount,
  getMatchCacheCount,
  setCachedMatch,
  setCachedMatchList,
} from "../js/match-cache.js";
import {
  clearParseFailure,
  listParseFailures,
  recordParseFailure,
} from "../js/parse-failures.js";
import { listSavedAccounts, saveAccount } from "../js/account-cache.js";
import { isMatchParsedForPlayer } from "../js/parse.js";

let ok = true;
const assert = (label, cond) => {
  if (!cond) {
    console.error("FAIL:", label);
    ok = false;
  } else {
    console.log("OK:", label);
  }
};

const ACCOUNT = 86745912;
const DAY = 24 * 60 * 60;
const nowSec = Math.floor(Date.now() / 1000);

function match(matchId, startTime, { parsed = true, accountId = ACCOUNT } = {}) {
  return {
    match_id: matchId,
    start_time: startTime,
    radiant_win: true,
    duration: 2400,
    players: [
      {
        account_id: accountId,
        player_slot: 0,
        hero_id: 14,
        kills: 5,
        deaths: 2,
        assists: 7,
        ...(parsed ? { gold_t: Array.from({ length: 30 }, (_, i) => i * 300) } : {}),
      },
      { account_id: 999, player_slot: 129, hero_id: 22 },
    ],
  };
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "d2ps-cache-"));
const backend = createNodeFsBackend(tmp);
setStorageBackend(backend);

await setCachedMatch(1001, match(1001, nowSec - 2 * DAY), {
  parseStatus: "complete",
  parseAccountId: ACCOUNT,
});
await setCachedMatch(1002, match(1002, nowSec - 200 * DAY, { parsed: false }), {
  parseStatus: "fetched",
});

const one = await getCachedMatch(1001);
assert("round-trips a match payload", one?.match_id === 1001);
assert("preserves the parsed gold timeline", isMatchParsedForPlayer(one, ACCOUNT));

const many = await getCachedMatches([1001, 1002, 9999]);
assert("returns only cached ids", many.size === 2 && !many.has(9999));
assert("counts cached matches", (await getMatchCacheCount()) === 2);

// Concurrent writes must all land in the manifest (parse lanes run in parallel).
await Promise.all(
  Array.from({ length: 12 }, (_, i) => setCachedMatch(2000 + i, match(2000 + i, nowSec - DAY)))
);
assert("survives concurrent writes", (await getMatchCacheCount()) === 14);

const mine = await getCachedMatchesForAccount(ACCOUNT);
assert("finds matches by participant", mine.length === 14);
const theirs = await getCachedMatchesForAccount(4242);
assert("ignores accounts that did not play", theirs.length === 0);

await setCachedMatchList("key|1", { matches: [{ match_id: 1001 }], turboSkipped: 3 });
const list = await getCachedMatchList("key|1");
assert("round-trips a match list", list?.matches?.length === 1 && list.turboSkipped === 3);
assert("missing match list returns null", (await getCachedMatchList("nope")) === null);

const pruned = await backend.pruneOlderThan(30);
assert("prunes replays older than the retention window", pruned === 1);
assert("keeps recent replays", (await getMatchCacheCount()) === 13);
assert("pruned file is gone", (await getCachedMatch(1002)) === null);
assert("prune is a no-op for 0 days", (await backend.pruneOlderThan(0)) === 0);

await recordParseFailure({
  accountId: ACCOUNT,
  matchId: 1001,
  reason: "timeout",
  attempts: 3,
  message: "Parse timed out",
});
let failures = await listParseFailures(ACCOUNT);
assert("records a parse failure", failures.length === 1 && failures[0].attempts === 3);
assert("scopes failures to the account", (await listParseFailures(1)).length === 0);

await clearParseFailure(ACCOUNT, 1001);
failures = await listParseFailures(ACCOUNT);
assert("clears a parse failure", failures.length === 0);

await saveAccount({ accountId: ACCOUNT, personaname: "Rare" });
const accounts = await listSavedAccounts();
assert("saves an account profile", accounts.length === 1 && accounts[0].personaname === "Rare");

// A fresh backend over the same directory must see the persisted state.
setStorageBackend(createNodeFsBackend(tmp));
assert("state survives a restart", (await getMatchCacheCount()) === 13);
assert("accounts survive a restart", (await listSavedAccounts()).length === 1);

await clearMatchCache();
assert("clears the match cache", (await getMatchCacheCount()) === 0);

await fs.rm(tmp, { recursive: true, force: true });

if (!ok) process.exit(1);
console.log("\nAll Node cache tests passed.");
