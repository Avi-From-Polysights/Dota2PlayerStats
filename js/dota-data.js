import { DOTA_DATA_STORE, openDb } from "./db.js";
import { fetchJson } from "./api.js";
import { applyItemPatches } from "./item-patches.js";
import { fetchLatestPatchVersion } from "./valve-datafeed.js";
import { fetchBundledJson } from "./valve-fetch.js";

const PATCH_VERSION_CACHE_KEY = "appliedItemPatchVersion";

const DOTACONSTANTS_BASE =
  "https://raw.githubusercontent.com/odota/dotaconstants/master/build";

const CONSTANTS_TTL_MS = 24 * 60 * 60 * 1000;
const POPULARITY_TTL_MS = 12 * 60 * 60 * 1000;
const OPENDOTA_BASE = "https://api.opendota.com/api";

const RESOURCES = {
  heroes: { bundled: "constants/heroes.json", url: `${DOTACONSTANTS_BASE}/heroes.json` },
  heroAbilities: {
    bundled: "constants/hero_abilities.json",
    url: `${DOTACONSTANTS_BASE}/hero_abilities.json`,
  },
  abilities: { bundled: "constants/abilities.json", url: `${DOTACONSTANTS_BASE}/abilities.json` },
  items: { bundled: "constants/items.json", url: `${DOTACONSTANTS_BASE}/items.json` },
  itemIds: { bundled: "constants/item_ids.json", url: `${DOTACONSTANTS_BASE}/item_ids.json` },
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
 * Fetch a JSON resource with layered caching: memory -> bundled (deploy) -> IndexedDB (fresh) -> network -> stale cache fallback.
 */
async function loadResource(key, { bundled, url }, ttlMs, { signal, force = false } = {}) {
  if (!force && memoryCache.has(key)) return memoryCache.get(key);

  if (!force) {
    const bundledData = await fetchBundledJson(bundled, { signal });
    if (bundledData) {
      memoryCache.set(key, bundledData);
      setCacheEntry(key, bundledData);
      return bundledData;
    }
  }

  return loadCached(key, url, ttlMs, { signal, force });
}

async function loadCached(key, url, ttlMs, { signal, force = false } = {}) {

  const cached = !force ? await getCacheEntry(key) : null;
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
export async function loadDotaData({ signal, force = false } = {}) {
  if (force) {
    memoryCache.clear();
  }

  const [heroesRaw, heroAbilities, abilities, items, itemIds] = await Promise.all([
    loadResource("heroes", RESOURCES.heroes, CONSTANTS_TTL_MS, { signal, force }),
    loadResource("heroAbilities", RESOURCES.heroAbilities, CONSTANTS_TTL_MS, { signal, force }),
    loadResource("abilities", RESOURCES.abilities, CONSTANTS_TTL_MS, { signal, force }),
    loadResource("items", RESOURCES.items, CONSTANTS_TTL_MS, { signal, force }),
    loadResource("itemIds", RESOURCES.itemIds, CONSTANTS_TTL_MS, { signal, force }),
  ]);

  const heroesById = new Map();
  for (const hero of Object.values(heroesRaw)) {
    heroesById.set(hero.id, hero);
  }

  const itemKeyById = new Map(
    Object.entries(itemIds).map(([id, key]) => [Number(id), key])
  );

  const patchMeta = await applyItemPatches(items, itemKeyById, { signal });

  return {
    heroesById,
    heroAbilities,
    abilities,
    items,
    itemKeyById,
    patchMeta,
  };
}

/** Bust in-memory game-data cache (IndexedDB entries expire by TTL on next load). */
export function clearDotaDataCache() {
  memoryCache.clear();
}

function parsePatchVersion(version) {
  const match = String(version ?? "").match(/^(\d+)\.(\d+)([a-z]?)$/i);
  if (!match) return { major: 0, minor: 0, letter: 0, raw: String(version ?? "") };
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    letter: match[3] ? match[3].toLowerCase().charCodeAt(0) - 96 : 0,
    raw: String(version),
  };
}

export function comparePatchVersions(a, b) {
  const pa = parsePatchVersion(a);
  const pb = parsePatchVersion(b);
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  return pa.letter - pb.letter;
}

async function getStoredPatchVersion() {
  const cached = await getCacheEntry(PATCH_VERSION_CACHE_KEY);
  return cached?.data ?? null;
}

async function setStoredPatchVersion(version) {
  await setCacheEntry(PATCH_VERSION_CACHE_KEY, version);
}

/**
 * Load dotaconstants base data, apply Valve patch-note deltas, and refresh when
 * Valve reports a newer patch than we last stored.
 */
export async function ensureGameDataUpToDate({ signal, force = false } = {}) {
  let latestPatch = "7.41";
  try {
    latestPatch = await fetchLatestPatchVersion({ signal, force });
  } catch {
    const bundled = await fetchBundledJson("patch-meta.json", { signal });
    latestPatch = bundled?.latestPatch ?? "7.41";
  }

  const storedPatch = force ? null : await getStoredPatchVersion();
  const stale =
    force || !storedPatch || comparePatchVersions(storedPatch, latestPatch) < 0;

  const data = await loadDotaData({ signal, force: stale });
  const applied = data.patchMeta?.latestPatch ?? latestPatch;

  if (stale || storedPatch !== applied) {
    await setStoredPatchVersion(applied);
  }

  return { ...data, latestPatch: applied, wasRefreshed: stale };
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
