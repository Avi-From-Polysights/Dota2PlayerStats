/**
 * Local run history for the Last Hit Trainer.
 *
 * Runs are stored in the app's existing IndexedDB database so drill scores
 * survive reloads and can be charted over time. Nothing leaves the browser.
 */
import { LASTHIT_RUNS_STORE, openDb } from "../db.js";

/** Keep the store bounded — this is a practice log, not an archive. */
const MAX_RUNS = 500;

function runId(finishedAt) {
  return `${finishedAt}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Runs are ordered by finishedAt, and Date.now() can repeat for two saves in
 * the same millisecond — which would leave their chart order down to the random
 * part of the id. Nudging forward keeps the sequence stable.
 */
let lastFinishedAt = 0;

function nextFinishedAt() {
  const now = Math.max(Date.now(), lastFinishedAt + 1);
  lastFinishedAt = now;
  return now;
}

export async function saveRun(summary) {
  const finishedAt = nextFinishedAt();
  const record = {
    id: runId(finishedAt),
    finishedAt,
    mode: summary.mode,
    seed: summary.seed,
    durationSeconds: summary.durationSeconds,
    waves: summary.waves,
    lastHits: summary.lastHits,
    lastHitsPossible: summary.lastHitsPossible,
    lastHitPct: summary.lastHitPct,
    denies: summary.denies,
    deniesPossible: summary.deniesPossible,
    denyPct: summary.denyPct,
    lostToTower: summary.lostToTower,
    lostToCreeps: summary.lostToCreeps,
  };

  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(LASTHIT_RUNS_STORE, "readwrite");
      tx.objectStore(LASTHIT_RUNS_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await trimRuns();
  } catch {
    // Private mode or IndexedDB unavailable — the run just is not persisted.
  }

  return record;
}

export async function loadRuns() {
  try {
    const db = await openDb();
    const runs = await new Promise((resolve, reject) => {
      const tx = db.transaction(LASTHIT_RUNS_STORE, "readonly");
      const request = tx.objectStore(LASTHIT_RUNS_STORE).getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result ?? []);
    });
    return runs.sort((a, b) => a.finishedAt - b.finishedAt);
  } catch {
    return [];
  }
}

async function trimRuns() {
  const runs = await loadRuns();
  if (runs.length <= MAX_RUNS) return;
  const excess = runs.slice(0, runs.length - MAX_RUNS);
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(LASTHIT_RUNS_STORE, "readwrite");
      const store = tx.objectStore(LASTHIT_RUNS_STORE);
      for (const run of excess) store.delete(run.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

export async function clearRuns() {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(LASTHIT_RUNS_STORE, "readwrite");
      tx.objectStore(LASTHIT_RUNS_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

/**
 * Personal bests and averages, computed over drill runs only — endless runs
 * have no fixed length, so their totals are not comparable.
 */
export function summarizeRuns(runs) {
  const drills = runs.filter((r) => r.mode === "drill" && r.lastHitsPossible > 0);
  if (!drills.length) {
    return { count: 0, bestLastHitPct: 0, bestDenyPct: 0, avgLastHitPct: 0, avgDenyPct: 0, best: null };
  }

  let best = drills[0];
  let sumLastHit = 0;
  let sumDeny = 0;
  let bestLastHitPct = 0;
  let bestDenyPct = 0;

  for (const run of drills) {
    sumLastHit += run.lastHitPct;
    sumDeny += run.denyPct;
    if (run.lastHitPct > bestLastHitPct) bestLastHitPct = run.lastHitPct;
    if (run.denyPct > bestDenyPct) bestDenyPct = run.denyPct;
    // "Best run" ranks on last hits first, using denies to break ties.
    if (
      run.lastHits > best.lastHits ||
      (run.lastHits === best.lastHits && run.denies > best.denies)
    ) {
      best = run;
    }
  }

  return {
    count: drills.length,
    bestLastHitPct,
    bestDenyPct,
    avgLastHitPct: sumLastHit / drills.length,
    avgDenyPct: sumDeny / drills.length,
    best,
  };
}
