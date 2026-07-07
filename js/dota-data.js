import { DOTA_DATA_STORE, openDb } from "./db.js";
import { fetchJson } from "./api.js";

const DOTACONSTANTS_BASE =
  "https://raw.githubusercontent.com/odota/dotaconstants/master/build";
const OPENDOTA_BASE = "https://api.opendota.com/api";

const CONSTANTS_TTL_MS = 24 * 60 * 60 * 1000;
const POPULARITY_TTL_MS = 12 * 60 * 60 * 1000;

const RESOURCES = {
  heroes: `${DOTACONSTANTS_BASE}/heroes.json`,
  heroAbilities: `${DOTACONSTANTS_BASE}/hero_abilities.json`,
  abilities: `${DOTACONSTANTS_BASE}/abilities.json`,
  items: `${DOTACONSTANTS_BASE}/items.json`,
  itemIds: `${DOTACONSTANTS_BASE}/item_ids.json`,
};

const memoryCache = new Map();

async function getCacheEntry(key) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DOTA_DATA_STORE, "readonly");
      const request = tx.objectStore(DOTA_DATA_STORE).get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result ?? null);
    });
  } catch {
    return null;
  }
}

async function setCacheEntry(key, data) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DOTA_DATA_STORE, "readwrite");
      tx.objectStore(DOTA_DATA_STORE).put({ key, data, savedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // private mode / IndexedDB unavailable — memory cache still works this session
  }
}

/**
 * Fetch a JSON resource with layered caching: memory -> IndexedDB (fresh) -> network -> stale cache fallback.
 */
async function loadCached(key, url, ttlMs, { signal } = {}) {
  if (memoryCache.has(key)) return memoryCache.get(key);

  const cached = await getCacheEntry(key);
  const isFresh = cached && Date.now() - cached.savedAt < ttlMs;
  if (isFresh) {
    memoryCache.set(key, cached.data);
    return cached.data;
  }

  try {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    const data = await response.json();
    memoryCache.set(key, data);
    setCacheEntry(key, data);
    return data;
  } catch (error) {
    if (cached?.data) {
      memoryCache.set(key, cached.data);
      return cached.data;
    }
    throw error;
  }
}

/**
 * Load and normalize the full hero/ability/item dataset needed by the Hero Builder.
 * Cached in IndexedDB for 24h; falls back to stale cache if the network is unavailable.
 */
export async function loadDotaData({ signal } = {}) {
  const [heroesRaw, heroAbilities, abilities, items, itemIds] = await Promise.all([
    loadCached("heroes", RESOURCES.heroes, CONSTANTS_TTL_MS, { signal }),
    loadCached("heroAbilities", RESOURCES.heroAbilities, CONSTANTS_TTL_MS, { signal }),
    loadCached("abilities", RESOURCES.abilities, CONSTANTS_TTL_MS, { signal }),
    loadCached("items", RESOURCES.items, CONSTANTS_TTL_MS, { signal }),
    loadCached("itemIds", RESOURCES.itemIds, CONSTANTS_TTL_MS, { signal }),
  ]);

  const heroesById = new Map();
  for (const hero of Object.values(heroesRaw)) {
    heroesById.set(hero.id, hero);
  }

  const itemKeyById = new Map(
    Object.entries(itemIds).map(([id, key]) => [Number(id), key])
  );

  return {
    heroesById,
    heroAbilities,
    abilities,
    items,
    itemKeyById,
  };
}

/**
 * Item purchase popularity for a hero (start/early/mid/late game), from OpenDota.
 * Returns { start, early, mid, late } maps of item key -> pick count, or null on failure.
 */
export async function loadItemPopularity(heroId, { signal } = {}) {
  const key = `itemPopularity:${heroId}`;
  if (memoryCache.has(key)) return memoryCache.get(key);

  const cached = await getCacheEntry(key);
  if (cached && Date.now() - cached.savedAt < POPULARITY_TTL_MS) {
    memoryCache.set(key, cached.data);
    return cached.data;
  }

  try {
    const raw = await fetchJson(`${OPENDOTA_BASE}/heroes/${heroId}/itemPopularity`, {
      signal,
      label: "item-popularity",
      maxRetries: 2,
    });
    const data = {
      start: raw?.start_game_items ?? {},
      early: raw?.early_game_items ?? {},
      mid: raw?.mid_game_items ?? {},
      late: raw?.late_game_items ?? {},
    };
    memoryCache.set(key, data);
    setCacheEntry(key, data);
    return data;
  } catch {
    if (cached?.data) {
      memoryCache.set(key, cached.data);
      return cached.data;
    }
    return null;
  }
}

/** Convert OpenDota's numeric-keyed item popularity into item-key -> count using itemKeyById. */
export function resolveItemPopularityKeys(popularity, itemKeyById) {
  if (!popularity) return null;
  const resolve = (bucket) => {
    const out = new Map();
    for (const [id, count] of Object.entries(bucket ?? {})) {
      const key = itemKeyById.get(Number(id));
      if (key) out.set(key, count);
    }
    return out;
  };
  return {
    start: resolve(popularity.start),
    early: resolve(popularity.early),
    mid: resolve(popularity.mid),
    late: resolve(popularity.late),
  };
}
