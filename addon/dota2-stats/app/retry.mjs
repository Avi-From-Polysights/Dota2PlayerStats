/**
 * Retry policy for failed runs.
 *
 * An OpenDota outage should not cost a whole week of history, so a run that
 * fails for a transient reason is retried on a fixed interval until it works.
 * Permanent failures (a bad account ID, say) are reported once and left alone —
 * retrying those forever would just churn.
 */

/** Errors worth retrying: the API was unreachable or throttling us. */
export function isTransientFailure(error) {
  if (!error) return false;
  if (error.upstreamDown || error.rateLimited) return true;
  if (error.name === "TimeoutError") return true;

  const message = String(error.message ?? error);
  return (
    /HTTP 5\d\d/.test(message) ||
    /not responding/i.test(message) ||
    /rate limit/i.test(message) ||
    /no response within/i.test(message) ||
    /timed out|timeout|network|fetch failed|ECONN|ENOTFOUND|EAI_AGAIN/i.test(message)
  );
}

/**
 * Accounts that still need work after a run: ones that failed transiently and
 * ones that were never attempted because the run stopped early.
 * @returns {string[]} account slugs
 */
export function accountsNeedingRetry(results = []) {
  return results
    .filter((r) => !r.analysis && (r.skipped || r.retryable))
    .map((r) => r.account?.slug)
    .filter(Boolean);
}

export function retryDelayMs(hours) {
  const n = Number(hours);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 60 * 60 * 1000);
}

/**
 * When to try again, or null if retries are disabled.
 * @param {number} hours interval in hours (0 disables)
 * @param {number} now epoch ms
 */
export function nextRetryAt(hours, now = Date.now()) {
  const delay = retryDelayMs(hours);
  return delay ? new Date(now + delay) : null;
}

/**
 * Resolve a persisted retry into a delay from now. A retry whose time passed
 * while the app was stopped runs shortly after boot rather than immediately,
 * so a restart loop cannot hammer the API.
 */
export function delayForPendingRetry(pending, { now = Date.now(), minDelayMs = 60_000 } = {}) {
  if (!pending?.at) return null;
  const at = new Date(pending.at).getTime();
  if (!Number.isFinite(at)) return null;
  return Math.max(minDelayMs, at - now);
}
