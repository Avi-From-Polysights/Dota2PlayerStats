import { GAMEMODE_TURBO } from "./game-modes.js";
import {
  OPENDOTA_PARSE_COST,
  OPENDOTA_REQUEST_COST,
  acquireOpenDotaQuota,
} from "./rate-limit.js";

const BASE_URL = "https://api.opendota.com/api";

const RETRIES = 8;
const RETRY_SLEEP_MS = 2500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

export class OpenDotaRateLimitError extends Error {
  constructor(message = "OpenDota rate limit (429)") {
    super(message);
    this.name = "OpenDotaRateLimitError";
    this.rateLimited = true;
  }
}

export async function fetchJson(url, { signal, onRateLimitWait, quotaCost, label } = {}) {
  let lastError = null;
  let saw429 = false;

  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      await acquireOpenDotaQuota(quotaCost ?? OPENDOTA_REQUEST_COST, {
        signal,
        onWait: onRateLimitWait,
        label,
      });

      const response = await fetch(url, { signal });

      if ([429, 500, 502, 503, 504].includes(response.status)) {
        if (response.status === 429) saw429 = true;
        await sleep(retryWaitMs(response, attempt));
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }

      return response.json();
    } catch (error) {
      if (error.name === "AbortError") throw error;
      lastError = error;
      await sleep(RETRY_SLEEP_MS * attempt);
    }
  }

  if (saw429) throw new OpenDotaRateLimitError();
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

export async function loadHeroes(options = {}) {
  const heroes = await fetchJson(`${BASE_URL}/heroes`, {
    ...options,
    label: "heroes",
  });
  return heroes
    .map((h) => ({ id: h.id, name: h.localized_name }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
 * Fetch up to `limit` matches, optionally skipping Turbo and scanning further back.
 */
export async function loadPlayerMatchesFiltered(
  accountId,
  heroId,
  limit,
  significant,
  patchId = null,
  { excludeTurbo = true, signal, onRateLimitWait } = {}
) {
  const matches = [];
  let offset = 0;
  let turboSkipped = 0;
  const maxScan = Math.min(Math.max(limit * 6, limit), 500);

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
      if (excludeTurbo && match.game_mode === GAMEMODE_TURBO) {
        turboSkipped += 1;
        continue;
      }
      matches.push(match);
      if (matches.length >= limit) break;
    }

    offset += batch.length;
    if (batch.length < batchLimit) break;
  }

  return { matches, turboSkipped };
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

async function postJson(url, { signal, onRateLimitWait, quotaCost, label } = {}) {
  let lastError = null;
  let saw429 = false;

  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      await acquireOpenDotaQuota(quotaCost ?? OPENDOTA_REQUEST_COST, {
        signal,
        onWait: onRateLimitWait,
        label,
      });

      const response = await fetch(url, { method: "POST", signal });

      if ([429, 500, 502, 503, 504].includes(response.status)) {
        if (response.status === 429) saw429 = true;
        await sleep(retryWaitMs(response, attempt));
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }

      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } catch (error) {
      if (error.name === "AbortError") throw error;
      lastError = error;
      await sleep(RETRY_SLEEP_MS * attempt);
    }
  }

  if (saw429) throw new OpenDotaRateLimitError();
  throw lastError ?? new Error(`Failed to POST: ${url}`);
}

export function isRadiant(playerSlot) {
  return playerSlot < 128;
}

export function didPlayerWin(playerSlot, radiantWin) {
  return isRadiant(playerSlot) === radiantWin;
}
