/**
 * Home Assistant app entry point: wire the Node storage backend into the shared
 * core, schedule runs, and serve the ingress UI.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { setStorageBackend } from "../../../js/storage/backend.js";
import { createNodeFsBackend } from "../../../js/storage/node-fs-backend.js";
import { setBundledDataLoader } from "../../../js/valve-fetch.js";
import { setOpenDotaApiKey } from "../../../js/opendota-key.js";
import { getOpenDotaLimit } from "../../../js/rate-limit.js";
import { loadOptions } from "./options.mjs";
import { createRunLog } from "./log.mjs";
import { createScheduler, createStateStore } from "./scheduler.mjs";
import { createServer } from "./server.mjs";
import { runAll } from "./runner.mjs";
import { ACCOUNT_FILES, accountDir } from "./exports.mjs";

const BUNDLED_DATA_DIR = process.env.D2PS_BUNDLED_DATA ?? path.resolve("data");

async function main() {
  const options = await loadOptions();
  const log = createRunLog();

  const backend = createNodeFsBackend(path.join(options.dataDir, "cache"));
  setStorageBackend(backend);

  // Hero constants ship inside the image; fall back to the network if absent.
  setBundledDataLoader(async (relativePath) => {
    const file = path.join(BUNDLED_DATA_DIR, relativePath);
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      return null;
    }
  });

  setOpenDotaApiKey(options.openDotaApiKey);

  log.info(`Dota 2 Player Stats app starting — ${options.accounts.length} account(s) configured`);
  log.info(
    options.openDotaApiKey
      ? `OpenDota API key set — pacing to ${getOpenDotaLimit()} requests/min`
      : `No OpenDota API key — free tier, ${getOpenDotaLimit()} requests/min (a parse costs 10)`
  );
  log.info(`Exports: ${options.exportDir} · cache: ${path.join(options.dataDir, "cache")}`);

  if (!options.accounts.length) {
    log.warn("No accounts configured — add profile IDs in the app configuration tab.");
  }

  const state = createStateStore(options.dataDir);

  const run = {
    active: false,
    controller: null,
    startedAt: null,
    accounts: [],
    progress: null,
  };

  async function execute(selected) {
    const accounts = selected?.length
      ? options.accounts.filter((a) => selected.includes(a.slug) || selected.includes(a.accountId))
      : options.accounts;

    if (!accounts.length) {
      log.warn("Nothing to run — no matching accounts.");
      return;
    }

    run.active = true;
    run.controller = new AbortController();
    run.startedAt = Date.now();
    run.accounts = accounts.map((a) => a.slug);
    run.progress = null;

    if (options.cacheRetentionDays > 0) {
      const pruned = await backend.pruneOlderThan(options.cacheRetentionDays);
      if (pruned) log.info(`Pruned ${pruned} cached match(es) older than ${options.cacheRetentionDays} days`);
    }

    try {
      const result = await runAll(accounts, options, {
        log,
        signal: run.controller.signal,
        onProgress: (progress) => {
          run.progress = progress;
        },
      });

      await state.write({
        lastRunAt: new Date().toISOString(),
        lastResult: result.results.map((r) => ({
          slug: r.account.slug,
          name: r.account.name,
          games: r.analysis?.totalGames ?? 0,
          winrate: r.analysis?.overallWinrate ?? null,
          laneWinrate: r.analysis?.overallLaneWinrate ?? null,
          error: r.error ?? null,
        })),
      });
    } catch (error) {
      if (error?.name === "AbortError") log.warn("Run stopped.");
      else log.warn(`Run failed: ${error.message ?? error}`);
      await state.write({ lastRunAt: new Date().toISOString(), lastError: String(error.message ?? error) });
    } finally {
      run.active = false;
      run.controller = null;
      run.progress = null;
      await backend.flush();
    }
  }

  const scheduler = createScheduler({
    expression: options.cron,
    log,
    onFire: async () => {
      if (run.active) {
        log.warn("Scheduled run skipped — a run is already in progress.");
        return;
      }
      log.info("Scheduled run starting.");
      await execute(null);
    },
  });

  const controller = {
    status: () => ({
      active: run.active,
      startedAt: run.startedAt ? new Date(run.startedAt).toISOString() : null,
      accounts: run.accounts,
      progress: run.progress,
    }),
    cronValid: () => scheduler.valid(),
    nextRunAt: () => scheduler.nextRunAt(),
    lastRun: async () => state.read(),
    start(selected) {
      if (run.active) return { ok: false, error: "A run is already in progress." };
      if (!options.accounts.length) return { ok: false, error: "No accounts configured." };
      execute(selected).catch(() => {});
      return { ok: true };
    },
    stop() {
      if (!run.active) return { ok: false, error: "Nothing running." };
      run.controller?.abort();
      return { ok: true };
    },
    async exportStatus() {
      const status = {};
      for (const account of options.accounts) {
        const dir = accountDir(options, account);
        const files = {};
        for (const name of ACCOUNT_FILES) {
          try {
            const stat = await fs.stat(path.join(dir, name));
            files[name] = { size: stat.size, modified: stat.mtime.toISOString() };
          } catch {
            files[name] = null;
          }
        }
        status[account.slug] = files;
      }
      return status;
    },
  };

  const server = createServer({ options, controller, log });
  server.listen(options.port, "0.0.0.0", () => {
    log.info(`UI listening on port ${options.port}`);
  });

  scheduler.start();

  if (options.runOnStart && options.accounts.length) {
    log.info("run_on_start enabled — starting an initial run.");
    execute(null).catch(() => {});
  }

  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => {
      log.info(`${signal} received — shutting down.`);
      run.controller?.abort();
      scheduler.stop();
      server.close(() => {
        backend.flush().finally(() => process.exit(0));
      });
    });
  }
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
