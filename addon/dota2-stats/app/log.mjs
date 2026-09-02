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

  function emit(level, scope, message) {
    const line = {
      at: new Date().toISOString(),
      level,
      scope,
      message: String(message ?? ""),
    };

    buffer.push(line);
    if (buffer.length > MAX_BUFFER) buffer.shift();

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
    history() {
      return [...buffer];
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
