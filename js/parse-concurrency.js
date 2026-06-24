/**
 * OpenDota free tier: ~60 weighted API requests/min per IP (parse POST = 10).
 * Each parse pipeline spends most of its time waiting on OpenDota's replay queue
 * (18–75s), so several pipelines can share the minute budget without 429s.
 * Empirically, six browser tabs parsing different heroes stay under the limit.
 */
export const DEFAULT_PARSE_CONCURRENCY = 6;
export const MAX_PARSE_CONCURRENCY = 6;
export const MIN_PARSE_CONCURRENCY = 1;

export const DEFAULT_FETCH_CONCURRENCY = 3;

export function clampParseConcurrency(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_PARSE_CONCURRENCY;
  return Math.min(MAX_PARSE_CONCURRENCY, Math.max(MIN_PARSE_CONCURRENCY, Math.round(n)));
}

export function effectiveConcurrency(requestParse, parseConcurrency, fetchConcurrency) {
  if (requestParse) return clampParseConcurrency(parseConcurrency);
  const n = Number(fetchConcurrency);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_FETCH_CONCURRENCY;
  return Math.min(6, Math.max(1, Math.round(n)));
}
