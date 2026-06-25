/** STRATZ API: 8 requests per second (per token). Stay under with headroom. */
export const STRATZ_LIMIT_PER_SECOND = 8;
const STRATZ_HEADROOM = 2;
const EFFECTIVE_STRATZ_PER_SECOND = STRATZ_LIMIT_PER_SECOND - STRATZ_HEADROOM;
const STRATZ_WINDOW_MS = 1000;

const requestTimes = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function prune(now = Date.now()) {
  const cutoff = now - STRATZ_WINDOW_MS;
  while (requestTimes.length && requestTimes[0] <= cutoff) {
    requestTimes.shift();
  }
}

export function recordStratzRequest(now = Date.now()) {
  prune(now);
  requestTimes.push(now);
}

export function stratzWaitMsBeforeRequest(now = Date.now()) {
  prune(now);
  if (requestTimes.length < EFFECTIVE_STRATZ_PER_SECOND) return 0;
  return Math.max(100, STRATZ_WINDOW_MS - (now - requestTimes[0]) + 50);
}

export function formatStratzRateLimitWaitMessage({ waitMs, rateLimited = false } = {}) {
  const secs = Math.max(1, Math.ceil(waitMs / 1000));
  if (rateLimited) {
    return `STRATZ rate limit (429) — waiting ${secs}s before retry…`;
  }
  return `STRATZ limit ${EFFECTIVE_STRATZ_PER_SECOND}/${STRATZ_LIMIT_PER_SECOND} req/s — waiting ${secs}s…`;
}

/**
 * Reserve STRATZ API quota before a request. Blocks until a slot is available.
 */
export async function acquireStratzQuota({ signal, onWait } = {}) {
  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const now = Date.now();
    const waitMs = stratzWaitMsBeforeRequest(now);

    if (waitMs <= 0) {
      recordStratzRequest(now);
      return;
    }

    const info = { waitMs, limit: STRATZ_LIMIT_PER_SECOND };
    onWait?.(info);

    let elapsed = 0;
    const step = Math.min(waitMs, 250);
    while (elapsed < waitMs) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      await sleep(step);
      elapsed += step;
    }
  }
}

export function createStratzRateLimitWaitHandler(loadStats, log) {
  return (info) => {
    loadStats.stratzThrottlePauses = (loadStats.stratzThrottlePauses ?? 0) + 1;
    log?.wait(formatStratzRateLimitWaitMessage(info));
  };
}

export function resetStratzQuotaLedger() {
  requestTimes.length = 0;
}
