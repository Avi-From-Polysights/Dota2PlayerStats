/** OpenDota free tier: 60 weighted requests per rolling minute (parse POST = 10). */
export const OPENDOTA_LIMIT = 60;
export const OPENDOTA_WINDOW_MS = 60_000;
export const OPENDOTA_PARSE_COST = 10;
export const OPENDOTA_REQUEST_COST = 1;

/** Small buffer so we stay under the documented cap. */
const LIMIT_HEADROOM = 2;
const EFFECTIVE_LIMIT = OPENDOTA_LIMIT - LIMIT_HEADROOM;

const ledger = [];
let notifier = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function prune(now = Date.now()) {
  const cutoff = now - OPENDOTA_WINDOW_MS;
  while (ledger.length && ledger[0].t <= cutoff) {
    ledger.shift();
  }
}

function usedQuota(now = Date.now()) {
  prune(now);
  return ledger.reduce((sum, entry) => sum + entry.cost, 0);
}

function waitMsUntilQuota(cost, now = Date.now()) {
  prune(now);
  let used = usedQuota(now);
  if (used + cost <= EFFECTIVE_LIMIT) return 0;

  const sorted = [...ledger].sort((a, b) => a.t - b.t);
  let remaining = used + cost;
  let waitUntil = sorted.length ? sorted[0].t + OPENDOTA_WINDOW_MS - now : 1000;

  for (const entry of sorted) {
    if (remaining <= EFFECTIVE_LIMIT) break;
    remaining -= entry.cost;
    waitUntil = entry.t + OPENDOTA_WINDOW_MS - now;
  }

  return Math.max(250, waitUntil + 150);
}

export function setOpenDotaRateLimitNotifier(fn) {
  notifier = typeof fn === "function" ? fn : null;
}

export function getOpenDotaQuotaSnapshot() {
  const used = usedQuota();
  return {
    used,
    limit: OPENDOTA_LIMIT,
    effectiveLimit: EFFECTIVE_LIMIT,
    remaining: Math.max(0, EFFECTIVE_LIMIT - used),
  };
}

export function formatRateLimitWaitMessage({ waitMs, used, cost }) {
  const secs = Math.max(1, Math.ceil(waitMs / 1000));
  const costNote = cost > OPENDOTA_REQUEST_COST ? ` (${cost} quota)` : "";
  return (
    `OpenDota limit ${used}/${OPENDOTA_LIMIT} requests this minute${costNote} — ` +
    `waiting ${secs}s to stay under 60/min…`
  );
}

/**
 * Reserve OpenDota API quota before a request. Blocks until budget is available.
 */
export async function acquireOpenDotaQuota(
  cost = OPENDOTA_REQUEST_COST,
  { signal, onWait, label } = {}
) {
  while (true) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const now = Date.now();
    const used = usedQuota(now);
    const waitMs = waitMsUntilQuota(cost, now);

    if (waitMs <= 0) {
      ledger.push({ t: now, cost });
      return;
    }

    const info = {
      waitMs,
      used,
      limit: OPENDOTA_LIMIT,
      cost,
      label,
    };

    if (onWait) onWait(info);
    else if (notifier) notifier(info);

    const step = Math.min(waitMs, 1000);
    let elapsed = 0;
    while (elapsed < waitMs) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      await sleep(step);
      elapsed += step;
    }
  }
}

export function resetOpenDotaQuotaLedger() {
  ledger.length = 0;
}
