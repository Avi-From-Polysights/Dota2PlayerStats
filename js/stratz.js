import { LANE_GOLD_MINUTE } from "./lane.js";

const STRATZ_GRAPHQL_URL = "https://api.stratz.com/graphql";

const MATCH_LANE_QUERY = `
query MatchLane($matchId: Long!) {
  match(id: $matchId) {
    players {
      steamAccountId
      heroId
      position
      lane
      stats {
        lastHitsPerMinute
        networthPerMinute
        observerWardsPlaced
        sentryWardsPlaced
      }
    }
  }
}`;

const STRATZ_LANE_MAP = {
  LANE_UNKNOWN: 0,
  UNKNOWN_LANE: 0,
  SAFE_LANE: 1,
  LANE_SAFE: 1,
  MID_LANE: 2,
  LANE_MID: 2,
  OFF_LANE: 3,
  LANE_OFF: 3,
  JUNGLE: 4,
  LANE_JUNGLE: 4,
  ROAMING: 5,
  LANE_ROAM: 5,
};

export class StratzApiError extends Error {
  constructor(message, { status = 0, rateLimited = false } = {}) {
    super(message);
    this.name = "StratzApiError";
    this.status = status;
    this.rateLimited = rateLimited;
  }
}

export function parseStratzLane(value) {
  if (value == null) return null;
  if (typeof value === "number" && value >= 0 && value <= 5) return value;
  const key = String(value).toUpperCase().replace(/\s+/g, "_");
  return STRATZ_LANE_MAP[key] ?? null;
}

export function parseStratzPosition(value) {
  if (value == null) return null;
  if (typeof value === "number" && value >= 1 && value <= 5) return value;
  const text = String(value).toUpperCase();
  const digit = text.match(/POSITION[_\s]?(\d)/);
  if (digit) return Number(digit[1]);
  return null;
}

function minuteSeries(values, minute = LANE_GOLD_MINUTE) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const idx = Math.min(minute, values.length - 1);
  return { series: values, idx, atMinute: values[idx] };
}

function findOpenDotaPlayer(players, stratzPlayer) {
  const steamId = stratzPlayer?.steamAccountId;
  const heroId = stratzPlayer?.heroId;

  if (steamId != null) {
    const byAccount = players.find((p) => p.account_id === steamId);
    if (byAccount) return byAccount;
  }

  if (heroId != null) {
    return players.find((p) => p.hero_id === heroId) ?? null;
  }

  return null;
}

/**
 * Copy STRATZ lane fields onto OpenDota player objects (mutates details).
 * @returns {boolean} whether the target account gained usable lane data
 */
export function mergeStratzLaneIntoOpenDota(details, stratzMatch, accountId) {
  const stratzPlayers = stratzMatch?.players;
  if (!details?.players || !Array.isArray(stratzPlayers)) return false;

  let enrichedAccount = false;

  for (const sp of stratzPlayers) {
    const player = findOpenDotaPlayer(details.players, sp);
    if (!player) continue;

    const lane = parseStratzLane(sp.lane);
    if (lane != null && lane > 0) player.lane = lane;

    const position = parseStratzPosition(sp.position);
    if (position != null) player.lane_role = position;

    const stats = sp.stats ?? {};
    const goldSeries = minuteSeries(stats.networthPerMinute);
    const lhSeries = minuteSeries(stats.lastHitsPerMinute);

    if (goldSeries) {
      player.gold_t = goldSeries.series;
      if (typeof goldSeries.atMinute === "number") {
        player.lane_total_gold = goldSeries.atMinute;
      }
    }

    if (lhSeries) {
      player.lh_t = lhSeries.series;
      if (typeof lhSeries.atMinute === "number") {
        player.lane_last_hits = lhSeries.atMinute;
      }
    }

    player.obs_placed = stats.observerWardsPlaced ?? player.obs_placed ?? 0;
    player.sen_placed = stats.sentryWardsPlaced ?? player.sen_placed ?? 0;

    if (player.account_id === accountId) {
      enrichedAccount = Boolean(
        (Array.isArray(player.gold_t) && player.gold_t.length > LANE_GOLD_MINUTE) ||
          typeof player.lane_total_gold === "number"
      );
    }
  }

  if (enrichedAccount) {
    details.stratzEnriched = true;
  }

  return enrichedAccount;
}

export async function fetchStratzMatchLane(matchId, apiToken, { signal } = {}) {
  if (!apiToken?.trim()) {
    throw new StratzApiError("STRATZ API token required — get one at stratz.com/api");
  }

  const response = await fetch(STRATZ_GRAPHQL_URL, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken.trim()}`,
      "User-Agent": "Dota2PlayerStats/1.0",
    },
    body: JSON.stringify({
      query: MATCH_LANE_QUERY,
      variables: { matchId: Number(matchId) },
    }),
  });

  if (response.status === 429) {
    throw new StratzApiError("STRATZ rate limit (429)", { status: 429, rateLimited: true });
  }

  if (!response.ok) {
    throw new StratzApiError(`STRATZ HTTP ${response.status}`, { status: response.status });
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    const msg = payload.errors.map((e) => e.message).join("; ");
    throw new StratzApiError(msg || "STRATZ GraphQL error");
  }

  return payload.data?.match ?? null;
}

export async function enrichMatchFromStratz(details, matchId, accountId, apiToken, options = {}) {
  const { signal, log } = options;
  if (!details || !apiToken?.trim()) return { details, enriched: false };

  try {
    const stratzMatch = await fetchStratzMatchLane(matchId, apiToken, { signal });
    if (!stratzMatch) {
      log?.warn(`STRATZ has no data for match ${matchId}`);
      return { details, enriched: false };
    }

    const enriched = mergeStratzLaneIntoOpenDota(details, stratzMatch, accountId);
    if (enriched) {
      log?.info(`Match ${matchId} lane data from STRATZ fallback`);
    } else {
      log?.warn(`STRATZ returned match ${matchId} but lane series still missing for your account`);
    }
    return { details, enriched };
  } catch (error) {
    if (error.name === "AbortError") throw error;
    log?.warn(`STRATZ fallback failed for match ${matchId}: ${error.message}`);
    return { details, enriched: false, error };
  }
}
