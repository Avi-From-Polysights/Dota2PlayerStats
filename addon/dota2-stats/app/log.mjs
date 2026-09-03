/**
 * Console/SSE logger shaped like the browser's multi-activity log, so
 * js/match-loader.js can be used unchanged (it calls configureWorkers, lane(id),
 * overview(), and the info/warn/wait/parse/cache/fetch level helpers).
 */

const MAX_BUFFER = 500;

export function createRunLog({ onLine } = {}) {
  const buffer = [];
  const listeners = new Set();
  let workers = 1;
  let lastEmitAt = Date.now();
  let seq = 0;

  function emit(level, scope, message) {
    seq += 1;
    const line = {
      seq,
      at: new Date().toISOString(),
      level,
      scope,
      message: String(message ?? ""),
    };

    buffer.push(line);
    if (buffer.length > MAX_BUFFER) buffer.shift();
    lastEmitAt = Date.now();

    const prefix = scope ? `[${scope}]` : "";
    console.log(`${line.at} ${level.padEnd(5)} ${prefix} ${line.message}`.trim());

    onLine?.(line);
    for (const listener of listeners) {
      try {
        listener(line);
      } catch {
        // a dead SSE client must not break a run
      }
    }
  }

  function scoped(scope) {
    return {
      info: (m) => emit("info", scope, m),
      warn: (m) => emit("warn", scope, m),
      wait: (m) => emit("wait", scope, m),
      parse: (m) => emit("parse", scope, m),
      cache: (m) => emit("cache", scope, m),
      fetch: (m) => emit("fetch", scope, m),
    };
  }

  const root = scoped(null);

  return {
    ...root,
    configureWorkers(count) {
      workers = Math.max(1, Number(count) || 1);
    },
    workerCount() {
      return workers;
    },
    lane(workerId) {
      return scoped(`lane ${Number(workerId) + 1}`);
    },
    overview() {
      return root;
    },
    clear() {
      buffer.length = 0;
    },
    /**
     * Emit a "still working" line whenever nothing else has been logged for a
     * while, so a long wait is never indistinguishable from a hang.
     */
    startHeartbeat(describe, intervalMs = 15_000) {
      const startedAt = Date.now();
      const timer = setInterval(() => {
        if (Date.now() - lastEmitAt < intervalMs) return;
        const elapsed = Math.round((Date.now() - startedAt) / 1000);
        const detail = describe?.() ?? "";
        emit(
          "wait",
          null,
          `Still working — ${detail || "waiting on OpenDota"} (${elapsed}s into this run)`
        );
      }, Math.max(2000, Math.floor(intervalMs / 2)));
      timer.unref?.();
      return () => clearInterval(timer);
    },
    history() {
      return [...buffer];
    },
    /** Lines after `afterSeq`, for an SSE client resuming with Last-Event-ID. */
    historySince(afterSeq) {
      const after = Number(afterSeq);
      if (!Number.isFinite(after)) return [...buffer];
      return buffer.filter((line) => line.seq > after);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
