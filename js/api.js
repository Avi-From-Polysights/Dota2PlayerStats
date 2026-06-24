const BASE_URL = "https://api.opendota.com/api";

const RETRIES = 5;
const RETRY_SLEEP_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson(url, { signal } = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, { signal });

      if ([429, 500, 502, 503, 504].includes(response.status)) {
        const wait = RETRY_SLEEP_MS * attempt;
        await sleep(wait);
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

  throw lastError ?? new Error(`Failed to fetch: ${url}`);
}

export async function loadHeroes() {
  const heroes = await fetchJson(`${BASE_URL}/heroes`);
  return heroes
    .map((h) => ({ id: h.id, name: h.localized_name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadPlayerMatches(accountId, heroId, limit, significant) {
  const params = new URLSearchParams({
    hero_id: String(heroId),
    limit: String(limit),
    significant: significant ? "1" : "0",
  });
  return fetchJson(`${BASE_URL}/players/${accountId}/matches?${params}`);
}

export async function loadMatchDetails(matchId, signal) {
  return fetchJson(`${BASE_URL}/matches/${matchId}`, { signal });
}

export function isRadiant(playerSlot) {
  return playerSlot < 128;
}

export function didPlayerWin(playerSlot, radiantWin) {
  return isRadiant(playerSlot) === radiantWin;
}
