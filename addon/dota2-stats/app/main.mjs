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
import { setNetworkLogger } from "../../../js/net-log.js";
import { getOpenDotaLimit } from "../../../js/rate-limit.js";
import { loadOptions } from "./options.mjs";
import { createRunLog } from "./log.mjs";
import { createScheduler, createStateStore } from "./scheduler.mjs";
import { createServer } from "./server.mjs";
import { runAll } from "./runner.mjs";
import { ACCOUNT_FILES, accountDir } from "./exports.mjs";
import { accountsNeedingRetry, delayForPendingRetry, nextRetryAt } from "./retry.mjs";

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

  // Per-match fetches already log themselves; only announce the big-picture
  // requests, but always surface retries and failures — silence during a 429
  // backoff is what makes a run look hung.
  const ANNOUNCE = new Set(["match-list-all", "match-list", "profile", "heroes"]);
  setNetworkLogger((event) => {
    const what = event.label ?? "request";
    if (event.phase === "request" && ANNOUNCE.has(what)) {
      const retry = event.attempt > 1 ? ` (attempt ${event.attempt}/${event.attempts})` : "";
      log.fetch(`OpenDota ${what}${retry}…`);
      return;
    }
    if (event.phase === "retry") {
      const secs = Math.ceil((event.waitMs ?? 0) / 1000);
      const cause = event.status
        ? `HTTP ${event.status}${event.status >= 520 && event.status <= 527 ? " — OpenDota origin unreachable" : ""}`
        : event.error;
      log.warn(
        `OpenDota ${what} failed (${cause}) — attempt ${event.attempt}/${event.attempts}, ` +
          `retrying in ${secs}s`
      );
      return;
    }
    if (event.phase === "giveup") {
      log.warn(`OpenDota ${what} gave up after ${event.attempts} attempts: ${event.error}`);
    }
  });

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

  // A failed run reschedules itself so an OpenDota outage does not cost a week.
  const retry = { timer: null, at: null, accounts: [], attempt: 0 };

  function cancelRetry() {
    if (retry.timer) clearTimeout(retry.timer);
    retry.timer = null;
    retry.at = null;
    retry.accounts = [];
  }

  function armRetry(slugs, { at = null, attempt = retry.attempt + 1 } = {}) {
    cancelRetry();
    if (!options.retryAfterHours || !slugs.length) return;

    const when = at ?? nextRetryAt(options.retryAfterHours);
    if (!when) return;

    const delay = Math.max(1000, when.getTime() - Date.now());
    retry.at = when;
    retry.accounts = slugs;
    retry.attempt = attempt;
    retry.timer = setTimeout(() => {
      retry.timer = null;
      if (run.active) {
        log.warn("Retry skipped — a run is already in progress.");
        return;
      }
      log.info(`Retrying ${slugs.length} account(s) — attempt ${retry.attempt}.`);
      execute(slugs).catch(() => {});
    }, delay);
    retry.timer.unref?.();

    const names = slugs
      .map((slug) => options.accounts.find((a) => a.slug === slug)?.name ?? slug)
      .join(", ");
    log.info(
      `Retry scheduled for ${when.toLocaleString()} (in ${options.retryAfterHours}h) — ${names}`
    );
  }

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
      const stopHeartbeat = log.startHeartbeat(() => {
        const p = run.progress;
        if (p?.phase === "parse") return `parsing match ${p.matchId} (${p.completed}/${p.total})`;
        if (p?.phase === "scan") return `scanning match history (${p.collected} found so far)`;
        if (p?.phase === "account") return `starting ${p.account?.name ?? "next account"}`;
        return "";
      });

      let result;
      try {
        result = await runAll(accounts, options, {
          log,
          signal: run.controller.signal,
          onProgress: (progress) => {
            run.progress = progress;
          },
        });
      } finally {
        stopHeartbeat();
      }

      const unfinished = accountsNeedingRetry(result.results);
      if (unfinished.length) {
        armRetry(unfinished);
      } else {
        if (retry.attempt) log.info("All accounts completed — retry cycle cleared.");
        cancelRetry();
        retry.attempt = 0;
      }

      await state.write({
        lastRunAt: new Date().toISOString(),
        lastResult: result.results.map((r) => ({
          slug: r.account.slug,
          name: r.account.name,
          games: r.analysis?.totalGames ?? 0,
          winrate: r.analysis?.overallWinrate ?? null,
          laneWinrate: r.analysis?.overallLaneWinrate ?? null,
          error: r.error ?? null,
          skipped: r.skipped ?? false,
        })),
        pendingRetry: retry.at
          ? { at: retry.at.toISOString(), accounts: retry.accounts, attempt: retry.attempt }
          : null,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        log.warn("Run stopped.");
        cancelRetry();
      } else {
        log.warn(`Run failed: ${error.message ?? error}`);
        armRetry(accounts.map((a) => a.slug));
      }
      await state.write({
        lastRunAt: new Date().toISOString(),
        lastError: String(error.message ?? error),
        pendingRetry: retry.at
          ? { at: retry.at.toISOString(), accounts: retry.accounts, attempt: retry.attempt }
          : null,
      });
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
    retry: () => ({
      at: retry.at?.toISOString() ?? null,
      accounts: retry.accounts,
      attempt: retry.attempt,
      intervalHours: options.retryAfterHours,
    }),
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
      cancelRetry();
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

  // Resume a retry that was pending when the app last stopped.
  const saved = await state.read();
  const pendingDelay = delayForPendingRetry(saved.pendingRetry);
  if (options.retryAfterHours && pendingDelay != null && saved.pendingRetry?.accounts?.length) {
    const slugs = saved.pendingRetry.accounts.filter((slug) =>
      options.accounts.some((a) => a.slug === slug)
    );
    if (slugs.length) {
      armRetry(slugs, {
        at: new Date(Date.now() + pendingDelay),
        attempt: (saved.pendingRetry.attempt ?? 0) + 1,
      });
    }
  }

  if (options.runOnStart && options.accounts.length) {
    log.info("run_on_start enabled — starting an initial run.");
    execute(null).catch(() => {});
  }

  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => {
      log.info(`${signal} received — shutting down.`);
      run.controller?.abort();
      scheduler.stop();
      if (retry.timer) clearTimeout(retry.timer);
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
