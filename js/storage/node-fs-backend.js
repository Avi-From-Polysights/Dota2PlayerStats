/**
 * Node storage backend — gzipped match JSON on disk, keyed by match id.
 *
 * Match details are shared across accounts on purpose: a five-stack's games are
 * fetched and parsed once, no matter how many profile IDs are configured.
 *
 * Layout under dataDir:
 *   matches/<matchId>.json.gz   full OpenDota match payload
 *   manifest.json               index: parse status + start time + participants
 *   match-lists.json            cached match-list scans
 *   parse-failures.json         per account/match parse failures
 *   accounts.json               saved account profiles
 */
import fs from "node:fs/promises";
import path from "node:path";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

function parseFailureKey(accountId, matchId) {
  return `${accountId}|${matchId}`;
}

async function readJsonFile(file, fallback) {
  try {
    const text = await fs.readFile(file, "utf8");
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

/** Write via temp file + rename so a crash never leaves a truncated index. */
async function writeJsonAtomic(file, value) {
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value), "utf8");
  await fs.rename(tmp, file);
}

/** Serialize writes to a single JSON file (parse lanes run concurrently). */
function createJsonStore(file, fallbackFactory) {
  let cache = null;
  let queue = Promise.resolve();

  async function load() {
    if (!cache) cache = await readJsonFile(file, fallbackFactory());
    return cache;
  }

  return {
    load,
    async update(mutator) {
      queue = queue.then(async () => {
        const data = await load();
        const result = mutator(data);
        await writeJsonAtomic(file, data);
        return result;
      });
      return queue;
    },
    async flush() {
      await queue;
    },
  };
}

export function createNodeFsBackend(dataDir) {
  const root = path.resolve(dataDir);
  const matchDir = path.join(root, "matches");

  const manifest = createJsonStore(path.join(root, "manifest.json"), () => ({}));
  const matchLists = createJsonStore(path.join(root, "match-lists.json"), () => ({}));
  const failures = createJsonStore(path.join(root, "parse-failures.json"), () => ({}));
  const accounts = createJsonStore(path.join(root, "accounts.json"), () => ({}));

  let ready = null;
  async function ensureDirs() {
    if (!ready) ready = fs.mkdir(matchDir, { recursive: true });
    return ready;
  }

  function matchFile(matchId) {
    return path.join(matchDir, `${Number(matchId)}.json.gz`);
  }

  async function readMatch(matchId) {
    try {
      const buf = await fs.readFile(matchFile(matchId));
      const json = await gunzipAsync(buf);
      return JSON.parse(json.toString("utf8"));
    } catch {
      return null;
    }
  }

  return {
    async getMatches(matchIds) {
      await ensureDirs();
      const ids = [...new Set(matchIds.map(Number))];
      const map = new Map();
      if (!ids.length) return map;

      const index = await manifest.load();
      const found = await Promise.all(
        ids.map(async (id) => {
          if (!index[id]) return null;
          const data = await readMatch(id);
          return data ? [id, data] : null;
        })
      );

      for (const entry of found) {
        if (entry) map.set(entry[0], entry[1]);
      }
      return map;
    },

    async setMatch(matchId, data, meta = {}) {
      await ensureDirs();
      const id = Number(matchId);
      const compressed = await gzipAsync(Buffer.from(JSON.stringify(data), "utf8"));
      await fs.writeFile(matchFile(id), compressed);

      await manifest.update((index) => {
        const existing = index[id] ?? {};
        index[id] = {
          savedAt: Date.now(),
          startTime: data?.start_time ?? existing.startTime ?? null,
          parseStatus: meta.parseStatus ?? existing.parseStatus ?? null,
          parseAccountId: meta.parseAccountId ?? existing.parseAccountId ?? null,
          parseAttempts: meta.parseAttempts ?? existing.parseAttempts ?? 0,
          accounts: (data?.players ?? [])
            .map((p) => p.account_id)
            .filter((accountId) => typeof accountId === "number" && accountId > 0),
        };
      });
    },

    async getMatchList(cacheKey) {
      const lists = await matchLists.load();
      const row = lists[cacheKey];
      if (!row?.matches?.length) return null;
      return {
        matches: row.matches,
        turboSkipped: row.turboSkipped ?? 0,
        rankedSkipped: row.rankedSkipped ?? 0,
        botsSkipped: row.botsSkipped ?? 0,
        practiceSkipped: row.practiceSkipped ?? 0,
        modeSkipped: row.modeSkipped ?? 0,
      };
    },

    async setMatchList(cacheKey, payload) {
      await ensureDirs();
      await matchLists.update((lists) => {
        lists[cacheKey] = {
          matches: payload.matches,
          turboSkipped: payload.turboSkipped ?? 0,
          rankedSkipped: payload.rankedSkipped ?? 0,
          botsSkipped: payload.botsSkipped ?? 0,
          practiceSkipped: payload.practiceSkipped ?? 0,
          modeSkipped: payload.modeSkipped ?? 0,
          savedAt: Date.now(),
        };
      });
    },

    async clearMatches() {
      await ensureDirs();
      await fs.rm(matchDir, { recursive: true, force: true });
      await fs.mkdir(matchDir, { recursive: true });
      await manifest.update((index) => {
        for (const key of Object.keys(index)) delete index[key];
      });
      await matchLists.update((lists) => {
        for (const key of Object.keys(lists)) delete lists[key];
      });
    },

    async countMatches() {
      const index = await manifest.load();
      return Object.keys(index).length;
    },

    async getMatchesForAccount(accountId) {
      await ensureDirs();
      const id = Number(accountId);
      if (!id) return [];

      const index = await manifest.load();
      const ids = Object.entries(index)
        .filter(([, row]) => !Array.isArray(row?.accounts) || row.accounts.includes(id))
        .map(([matchId]) => Number(matchId));

      const details = [];
      for (const matchId of ids) {
        const data = await readMatch(matchId);
        if (!data?.match_id) continue;
        if (!(data.players ?? []).some((p) => p.account_id === id)) continue;
        details.push(data);
      }
      return details;
    },

    /** Drop cached matches whose replay is older than `days`. Returns removed count. */
    async pruneOlderThan(days) {
      if (!Number.isFinite(days) || days <= 0) return 0;
      await ensureDirs();

      const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
      const index = await manifest.load();
      const stale = Object.entries(index).filter(([, row]) => {
        const startMs = row?.startTime != null ? row.startTime * 1000 : null;
        const at = startMs ?? row?.savedAt ?? null;
        return at != null && at < cutoffMs;
      });

      for (const [matchId] of stale) {
        await fs.rm(matchFile(matchId), { force: true });
      }

      if (stale.length) {
        await manifest.update((current) => {
          for (const [matchId] of stale) delete current[matchId];
        });
      }

      return stale.length;
    },

    async recordParseFailure({ accountId, matchId, reason, attempts, message = null }) {
      await ensureDirs();
      await failures.update((rows) => {
        rows[parseFailureKey(accountId, matchId)] = {
          key: parseFailureKey(accountId, matchId),
          accountId: Number(accountId),
          matchId: Number(matchId),
          reason,
          attempts,
          message,
          lastAttemptAt: Date.now(),
        };
      });
    },

    async clearParseFailure(accountId, matchId) {
      await ensureDirs();
      await failures.update((rows) => {
        delete rows[parseFailureKey(accountId, matchId)];
      });
    },

    async listParseFailures(accountId) {
      const rows = await failures.load();
      const id = Number(accountId);
      return Object.values(rows)
        .filter((row) => row.accountId === id)
        .sort((a, b) => b.lastAttemptAt - a.lastAttemptAt);
    },

    async clearAllParseFailures() {
      await ensureDirs();
      await failures.update((rows) => {
        for (const key of Object.keys(rows)) delete rows[key];
      });
    },

    async listAccounts() {
      const rows = await accounts.load();
      return Object.values(rows).sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0));
    },

    async getAccount(accountId) {
      const rows = await accounts.load();
      return rows[Number(accountId)] ?? null;
    },

    async putAccount(entry) {
      await ensureDirs();
      await accounts.update((rows) => {
        rows[Number(entry.accountId)] = entry;
      });
    },

    async removeAccount(accountId) {
      await ensureDirs();
      await accounts.update((rows) => {
        delete rows[Number(accountId)];
      });
    },

    /** Wait for pending index writes (call before process exit). */
    async flush() {
      await Promise.all([
        manifest.flush(),
        matchLists.flush(),
        failures.flush(),
        accounts.flush(),
      ]);
    },
  };
}
