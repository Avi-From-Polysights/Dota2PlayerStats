import {
  OPENDOTA_PARSE_COST,
  OPENDOTA_REQUEST_COST,
  acquireOpenDotaQuota,
} from "./rate-limit.js";
import { fetchBundledJson } from "./valve-fetch.js";
import { classifyMatchSummary } from "./match-filters.js";
import { withOpenDotaKey } from "./opendota-key.js";
import { netLog } from "./net-log.js";

const BASE_URL = "https://api.opendota.com/api";
const HEROES_FALLBACK_URL =
  "https://raw.githubusercontent.com/odota/dotaconstants/master/build/heroes.json";

const RETRIES = 8;
const RETRY_SLEEP_MS = 2500;
/** A stalled connection must fail fast rather than hang the whole run. */
const REQUEST_TIMEOUT_MS = 30_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Combine the caller's abort signal with a per-request timeout. */
function requestSignal(signal) {
  if (typeof AbortSignal?.timeout !== "function") return signal;
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  if (!signal) return timeout;
  if (typeof AbortSignal.any !== "function") return signal;
  return AbortSignal.any([signal, timeout]);
}

function isTimeout(error) {
  return error?.name === "TimeoutError";
}

/** Transient upstream failures: OpenDota 5xx plus Cloudflare 52x origin errors. */
function isRetryableStatus(status) {
  if (status === 429) return true;
  return status >= 500 && status <= 599;
}

/** Cloudflare returns these when OpenDota's origin is unreachable. */
export function isUpstreamDownStatus(status) {
  return status >= 520 && status <= 527;
}

export class OpenDotaUnavailableError extends Error {
  constructor(status) {
    super(
      isUpstreamDownStatus(status)
        ? `OpenDota is not responding (HTTP ${status}) — the API itself looks down, not your connection. Try again later; cached matches are kept.`
        : `OpenDota returned HTTP ${status} repeatedly — try again later.`
    );
    this.name = "OpenDotaUnavailableError";
    this.status = status;
    this.upstreamDown = true;
  }
}

function retryWaitMs(response, attempt) {
  if (response?.status === 429) {
    const retryAfter = Number(response.headers.get("Retry-After"));
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      return Math.min(retryAfter * 1000, 120_000);
    }
    return Math.min(RETRY_SLEEP_MS * attempt * 3, 60_000);
  }
  return RETRY_SLEEP_MS * attempt;
}

/** Attach the API key to OpenDota URLs only — never to CDN / dotaconstants fetches. */
function authorized(url) {
  return url.startsWith(BASE_URL) ? withOpenDotaKey(url) : url;
}

export class OpenDotaRateLimitError extends Error {
  constructor(message = "OpenDota rate limit (429)") {
    super(message);
    this.name = "OpenDotaRateLimitError";
    this.rateLimited = true;
  }
}

export async function fetchJson(
  url,
  { signal, onRateLimitWait, quotaCost, label, maxRetries = RETRIES } = {}
) {
  let lastError = null;
  let saw429 = false;
  let lastStatus = 0;
  const attempts = Math.max(1, Math.min(maxRetries, RETRIES));

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await acquireOpenDotaQuota(quotaCost ?? OPENDOTA_REQUEST_COST, {
        signal,
        onWait: onRateLimitWait,
        label,
      });

      netLog({ phase: "request", label, url, attempt, attempts });
      const response = await fetch(authorized(url), { signal: requestSignal(signal) });

      if (isRetryableStatus(response.status)) {
        if (response.status === 429) saw429 = true;
        else lastStatus = response.status;
        const waitMs = retryWaitMs(response, attempt);
        netLog({
          phase: "retry",
          label,
          url,
          status: response.status,
          attempt,
          attempts,
          waitMs,
        });
        await sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }

      const text = await response.text();
      netLog({ phase: "done", label, url, status: response.status, attempt });
      return text ? JSON.parse(text) : null;
    } catch (error) {
      // The caller cancelled — not a failure to retry.
      if (signal?.aborted) throw error;
      if (error.name === "AbortError") throw error;

      lastError = error;
      const isNetwork = error instanceof TypeError || isTimeout(error);
      const waitMs = RETRY_SLEEP_MS * attempt;
      netLog({
        phase: "retry",
        label,
        url,
        attempt,
        attempts,
        waitMs,
        error: isTimeout(error)
          ? `no response within ${REQUEST_TIMEOUT_MS / 1000}s`
          : error.message ?? String(error),
      });
      if (isNetwork && attempt >= Math.min(2, attempts)) break;
      await sleep(waitMs);
    }
  }

  netLog({
    phase: "giveup",
    label,
    url,
    attempts,
    error: saw429
      ? "OpenDota rate limit (429)"
      : lastStatus
        ? `HTTP ${lastStatus}`
        : lastError?.message ?? "request failed",
  });

  if (saw429) throw new OpenDotaRateLimitError();
  if (lastStatus) throw new OpenDotaUnavailableError(lastStatus);
  throw lastError ?? new Error(`Failed to fetch: ${url}`);
}

export async function loadPlayerProfile(accountId, signal, options = {}) {
  return fetchJson(`${BASE_URL}/players/${accountId}`, {
    signal,
    ...options,
    label: "profile",
  });
}

export function profileFromPlayerResponse(data, accountId) {
  const profile = data?.profile ?? data ?? {};
  const id = Number(accountId);

  return {
    accountId: id,
    personaname: profile.personaname ?? null,
    name: profile.name ?? null,
    avatar: profile.avatar ?? null,
    avatarFull: profile.avatarfull ?? profile.avatarmedium ?? profile.avatar ?? null,
    profileUrl:
      profile.profileurl ?? `https://www.opendota.com/players/${id}`,
  };
}

function mapHeroList(heroes) {
  return heroes
    .map((h) => ({ id: h.id, name: h.localized_name }))
    .filter((h) => h.id && h.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function mapHeroListFromValve(raw) {
  const heroes = raw?.result?.data?.heroes ?? [];
  return heroes
    .map((h) => ({ id: h.id, name: h.name_loc ?? h.name }))
    .filter((h) => h.id && h.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function loadHeroesFromDotaconstants(signal) {
  try {
    const bundled = await fetchBundledJson("constants/heroes.json", { signal });
    if (bundled) {
      const heroes = Array.isArray(bundled) ? bundled : Object.values(bundled);
      const list = mapHeroList(heroes);
      if (list.length) return list;
    }
  } catch {
    // fall through
  }

  const response = await fetch(HEROES_FALLBACK_URL, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for hero fallback`);
  }
  const data = await response.json();
  const heroes = Array.isArray(data) ? data : Object.values(data);
  return mapHeroList(heroes);
}

export async function loadHeroes(options = {}) {
  const { signal } = options;

  try {
    const bundled = await fetchBundledJson("herolist.json", { signal });
    const fromBundled = mapHeroListFromValve(bundled);
    if (fromBundled.length) return fromBundled;
  } catch {
    // fall through
  }

  try {
    const fallback = await loadHeroesFromDotaconstants(signal);
    if (fallback.length) return fallback;
  } catch (primaryError) {
    console.warn("Hero list fallback unavailable — trying OpenDota.", primaryError);
  }

  try {
    const heroes = await fetchJson(`${BASE_URL}/heroes`, {
      signal,
      label: "heroes",
      maxRetries: 1,
    });
    return mapHeroList(heroes);
  } catch (error) {
    throw error;
  }
}

export async function loadPlayerMatches(
  accountId,
  heroId,
  limit,
  significant,
  patchId = null
) {
  const params = new URLSearchParams({
    hero_id: String(heroId),
    limit: String(limit),
    significant: significant ? "1" : "0",
  });

  if (patchId != null && patchId !== "") {
    params.set("patch", String(patchId));
  }

  return fetchJson(`${BASE_URL}/players/${accountId}/matches?${params}`);
}

/**
 * Fetch up to `limit` matches, applying lobby/mode filters and scanning further back as needed.
 */
export async function loadPlayerMatchesFiltered(
  accountId,
  heroId,
  limit,
  significant,
  patchId = null,
  {
    excludeTurbo = true,
    rankedOnly = false,
    excludeBots = true,
    excludePractice = true,
    standardModesOnly = false,
    signal,
    onRateLimitWait,
  } = {}
) {
  const matches = [];
  let offset = 0;
  let turboSkipped = 0;
  let rankedSkipped = 0;
  let botsSkipped = 0;
  let practiceSkipped = 0;
  let modeSkipped = 0;
  const filterOpts = {
    excludeTurbo,
    rankedOnly,
    excludeBots,
    excludePractice,
    standardModesOnly,
  };
  const maxScan = Math.min(Math.max(limit * 6, limit), 99_999);

  while (matches.length < limit && offset < maxScan) {
    const batchLimit = Math.min(100, maxScan - offset);
    const params = new URLSearchParams({
      hero_id: String(heroId),
      limit: String(batchLimit),
      offset: String(offset),
      significant: significant ? "1" : "0",
    });

    if (patchId != null && patchId !== "") {
      params.set("patch", String(patchId));
    }

    const batch = await fetchJson(
      `${BASE_URL}/players/${accountId}/matches?${params}`,
      { signal, onRateLimitWait, label: "match-list" }
    );

    if (!batch.length) break;

    for (const match of batch) {
      const { keep, reason } = classifyMatchSummary(match, filterOpts);
      if (!keep) {
        if (reason === "turbo") turboSkipped += 1;
        else if (reason === "ranked") rankedSkipped += 1;
        else if (reason === "bots") botsSkipped += 1;
        else if (reason === "practice") practiceSkipped += 1;
        else if (reason === "mode") modeSkipped += 1;
        continue;
      }
      matches.push(match);
      if (matches.length >= limit) break;
    }

    offset += batch.length;
    if (batch.length < batchLimit) break;
  }

  return { matches, turboSkipped, rankedSkipped, botsSkipped, practiceSkipped, modeSkipped };
}

/**
 * Fetch recent matches across all heroes (newest first), paginating until limit or history ends.
 */
export async function loadPlayerMatchesAll(
  accountId,
  limit,
  {
    excludeTurbo = true,
    rankedOnly = false,
    excludeBots = true,
    excludePractice = true,
    standardModesOnly = false,
    significant = false,
    sinceUnix = null,
    signal,
    onRateLimitWait,
    onBatch,
  } = {}
) {
  const matches = [];
  const seen = new Set();
  let offset = 0;
  let reachedCutoff = false;
  let turboSkipped = 0;
  let rankedSkipped = 0;
  let botsSkipped = 0;
  let practiceSkipped = 0;
  let modeSkipped = 0;
  const filterOpts = {
    excludeTurbo,
    rankedOnly,
    excludeBots,
    excludePractice,
    standardModesOnly,
  };
  const maxScan = limit > 0 ? limit : 10_000;
  let page = 0;

  while (matches.length < maxScan) {
    page += 1;
    const batchLimit = Math.min(100, maxScan - matches.length);
    const params = new URLSearchParams({
      limit: String(batchLimit),
      offset: String(offset),
      significant: significant ? "1" : "0",
    });

    const batch = await fetchJson(
      `${BASE_URL}/players/${accountId}/matches?${params}`,
      { signal, onRateLimitWait, label: "match-list-all" }
    );

    if (!batch.length) {
      onBatch?.({
        page,
        offset,
        batchSize: 0,
        collected: matches.length,
        exhausted: true,
      });
      break;
    }

    const oldestInBatch = batch[batch.length - 1]?.start_time ?? null;
    onBatch?.({
      page,
      offset,
      batchSize: batch.length,
      collected: matches.length,
      oldestStartTime: oldestInBatch,
      oldestIso: oldestInBatch ? new Date(oldestInBatch * 1000).toISOString() : null,
    });

    for (const match of batch) {
      const id = match.match_id;
      if (seen.has(id)) continue;
      seen.add(id);

      // Match lists come back newest-first, so the first older match ends the scan.
      if (sinceUnix != null && typeof match.start_time === "number") {
        if (match.start_time < sinceUnix) {
          reachedCutoff = true;
          break;
        }
      }

      const { keep, reason } = classifyMatchSummary(match, filterOpts);
      if (!keep) {
        if (reason === "turbo") turboSkipped += 1;
        else if (reason === "ranked") rankedSkipped += 1;
        else if (reason === "bots") botsSkipped += 1;
        else if (reason === "practice") practiceSkipped += 1;
        else if (reason === "mode") modeSkipped += 1;
        continue;
      }

      matches.push(match);
      if (matches.length >= maxScan) break;
    }

    if (reachedCutoff) break;

    offset += batch.length;
    if (batch.length < batchLimit) break;
  }

  return { matches, turboSkipped, rankedSkipped, botsSkipped, practiceSkipped, modeSkipped };
}

export async function loadMatchDetails(matchId, signal, options = {}) {
  return fetchJson(`${BASE_URL}/matches/${matchId}`, {
    signal,
    ...options,
    label: "match",
  });
}

export async function requestMatchParse(matchId, signal, options = {}) {
  return postJson(`${BASE_URL}/request/${matchId}`, {
    signal,
    ...options,
    quotaCost: OPENDOTA_PARSE_COST,
    label: "parse-request",
  });
}

export async function loadParseJobStatus(jobId, signal, options = {}) {
  return fetchJson(`${BASE_URL}/request/${jobId}`, {
    signal,
    ...options,
    label: "parse-job",
  });
}

async function postJson(url, { signal, onRateLimitWait, quotaCost, label } = {}) {
  let lastError = null;
  let saw429 = false;
  let lastStatus = 0;

  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      await acquireOpenDotaQuota(quotaCost ?? OPENDOTA_REQUEST_COST, {
        signal,
        onWait: onRateLimitWait,
        label,
      });

      netLog({ phase: "request", label, url, attempt, attempts: RETRIES });
      const response = await fetch(authorized(url), {
        method: "POST",
        signal: requestSignal(signal),
      });

      if (isRetryableStatus(response.status)) {
        if (response.status === 429) saw429 = true;
        else lastStatus = response.status;
        const waitMs = retryWaitMs(response, attempt);
        netLog({
          phase: "retry",
          label,
          url,
          status: response.status,
          attempt,
          attempts: RETRIES,
          waitMs,
        });
        await sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }

      const text = await response.text();
      netLog({ phase: "done", label, url, status: response.status, attempt });
      return text ? JSON.parse(text) : null;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (error.name === "AbortError") throw error;

      lastError = error;
      const waitMs = RETRY_SLEEP_MS * attempt;
      netLog({
        phase: "retry",
        label,
        url,
        attempt,
        attempts: RETRIES,
        waitMs,
        error: isTimeout(error)
          ? `no response within ${REQUEST_TIMEOUT_MS / 1000}s`
          : error.message ?? String(error),
      });
      await sleep(waitMs);
    }
  }

  netLog({
    phase: "giveup",
    label,
    url,
    attempts: RETRIES,
    error: saw429
      ? "OpenDota rate limit (429)"
      : lastStatus
        ? `HTTP ${lastStatus}`
        : lastError?.message ?? "request failed",
  });

  if (saw429) throw new OpenDotaRateLimitError();
  if (lastStatus) throw new OpenDotaUnavailableError(lastStatus);
  throw lastError ?? new Error(`Failed to POST: ${url}`);
}

export function isRadiant(playerSlot) {
  return playerSlot < 128;
}

export function didPlayerWin(playerSlot, radiantWin) {
  return isRadiant(playerSlot) === radiantWin;
}
