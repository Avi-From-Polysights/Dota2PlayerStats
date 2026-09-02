/** OpenDota free tier: 60 weighted requests per rolling minute (parse POST = 10). */
export const OPENDOTA_LIMIT = 60;
/** With an API key OpenDota allows 1200 requests per minute. */
export const OPENDOTA_KEYED_LIMIT = 1200;
export const OPENDOTA_WINDOW_MS = 60_000;
export const OPENDOTA_PARSE_COST = 10;
export const OPENDOTA_REQUEST_COST = 1;

/** Small buffer so we stay under the documented cap. */
const LIMIT_HEADROOM = 2;

let activeLimit = OPENDOTA_LIMIT;

function effectiveLimit() {
  return Math.max(1, activeLimit - LIMIT_HEADROOM);
}

/** Raise the per-minute budget once an API key is configured. */
export function setOpenDotaLimit(limit) {
  const n = Number(limit);
  activeLimit = Number.isFinite(n) && n > 0 ? Math.round(n) : OPENDOTA_LIMIT;
}

export function getOpenDotaLimit() {
  return activeLimit;
}

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
  const limit = effectiveLimit();
  let used = usedQuota(now);
  if (used + cost <= limit) return 0;

  const sorted = [...ledger].sort((a, b) => a.t - b.t);
  let remaining = used + cost;
  let waitUntil = sorted.length ? sorted[0].t + OPENDOTA_WINDOW_MS - now : 1000;

  for (const entry of sorted) {
    if (remaining <= limit) break;
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
    limit: activeLimit,
    effectiveLimit: effectiveLimit(),
    remaining: Math.max(0, effectiveLimit() - used),
  };
}

export function formatRateLimitWaitMessage({ waitMs, used, cost, limit = activeLimit }) {
  const secs = Math.max(1, Math.ceil(waitMs / 1000));
  const costNote = cost > OPENDOTA_REQUEST_COST ? ` (${cost} quota)` : "";
  return (
    `OpenDota limit ${used}/${limit} requests this minute${costNote} — ` +
    `waiting ${secs}s to stay under ${limit}/min…`
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
      limit: activeLimit,
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
