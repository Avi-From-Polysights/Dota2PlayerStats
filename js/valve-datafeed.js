import { DOTA_DATA_STORE, openDb } from "./db.js";
import { formatAbilityText } from "./valve-text.js";

const VALVE_BASE = "https://www.dota2.com/datafeed";
const HERO_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PATCH_CACHE_TTL_MS = 60 * 60 * 1000;

const ROLE_NAMES = [
  "Carry",
  "Support",
  "Nuker",
  "Disabler",
  "Jungler",
  "Durable",
  "Escape",
  "Pusher",
  "Initiator",
];

const PRIMARY_ATTR = { 0: "str", 1: "agi", 2: "int", 3: "all" };
const ATTACK_TYPE = { 1: "Melee", 2: "Ranged" };

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
    // ignore
  }
}

async function fetchValve(path, params = {}) {
  const url = new URL(`${VALVE_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

/** Latest patch id from Valve (e.g. "7.41d"). */
export async function fetchLatestPatchVersion({ signal, force = false } = {}) {
  const key = "valveLatestPatch";
  if (!force && memoryCache.has(key)) return memoryCache.get(key);

  const cached = await getCacheEntry(key);
  if (!force && cached && Date.now() - cached.savedAt < PATCH_CACHE_TTL_MS) {
    memoryCache.set(key, cached.data);
    return cached.data;
  }

  const data = await fetchValve("patchnoteslist", { language: "english" });
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const patches = data.patches ?? data.result?.data?.patches ?? [];
  const latest = patches[patches.length - 1]?.patch_name ?? patches[patches.length - 1]?.patch_number ?? "7.41";
  memoryCache.set(key, latest);
  setCacheEntry(key, latest);
  return latest;
}

/** Hero picker list from Valve (id + localized name). */
export async function fetchHeroList({ signal } = {}) {
  const data = await fetchValve("herolist", { language: "english" });
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const heroes = data.result?.data?.heroes ?? [];
  return heroes
    .map((h) => ({
      id: h.id,
      key: h.name,
      name: h.name_loc ?? h.name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Live hero sheet: abilities, talents, base stats — current patch from Valve.
 * Cached per hero for 6h in IndexedDB.
 */
export async function fetchHeroData(heroId, { signal, force = false } = {}) {
  const key = `valveHero:${heroId}`;
  if (!force && memoryCache.has(key)) return memoryCache.get(key);

  const cached = await getCacheEntry(key);
  if (!force && cached && Date.now() - cached.savedAt < HERO_CACHE_TTL_MS) {
    memoryCache.set(key, cached.data);
    return cached.data;
  }

  const data = await fetchValve("herodata", { language: "english", hero_id: String(heroId) });
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const hero = data.result?.data?.heroes?.[0] ?? null;
  if (!hero) throw new Error(`No Valve hero data for id ${heroId}`);

  memoryCache.set(key, hero);
  setCacheEntry(key, hero);
  return hero;
}

/** Convert Valve herodata into the shape used by build-stats.js (dotaconstants-like bases). */
export function normalizeValveHeroForStats(valveHero) {
  const primaryKey = PRIMARY_ATTR[valveHero.primary_attr] ?? "str";
  const primaryTotal =
    primaryKey === "all"
      ? (valveHero.str_base + valveHero.agi_base + valveHero.int_base) * 0.7
      : valveHero[`${primaryKey === "int" ? "int" : primaryKey}_base`];

  const roles = (valveHero.role_levels ?? [])
    .map((level, i) => (level > 0 ? ROLE_NAMES[i] : null))
    .filter(Boolean);

  return {
    id: valveHero.id,
    name: valveHero.name,
    localized_name: valveHero.name_loc,
    primary_attr: primaryKey,
    base_str: valveHero.str_base,
    base_agi: valveHero.agi_base,
    base_int: valveHero.int_base,
    str_gain: valveHero.str_gain,
    agi_gain: valveHero.agi_gain,
    int_gain: valveHero.int_gain,
    base_health_regen: Math.max(0, valveHero.health_regen - valveHero.str_base * 0.1),
    base_mana_regen: Math.max(0, valveHero.mana_regen - valveHero.int_base * 0.05),
    base_armor: valveHero.armor - valveHero.agi_base / 6,
    base_mr: valveHero.magic_resistance,
    base_attack_min: valveHero.damage_min - primaryTotal,
    base_attack_max: valveHero.damage_max - primaryTotal,
    attack_rate: valveHero.attack_rate,
    move_speed: valveHero.move_speed,
    attack_type: ATTACK_TYPE[valveHero.attack_capability] ?? "Melee",
    roles,
  };
}

export function allHeroAbilities(valveHero) {
  return [...(valveHero.abilities ?? []), ...(valveHero.talents ?? [])];
}

export function formatValveAbilityLabel(ability, valveHero) {
  if (!ability) return "";
  const pool = allHeroAbilities(valveHero);
  return formatAbilityText(ability.name_loc ?? "", ability.special_values ?? [], pool, ability);
}

export function getItemGrantsFromValve(valveHero) {
  const abilities = valveHero?.abilities ?? [];
  return {
    shard: abilities.filter((a) => a.ability_is_granted_by_shard),
    scepter: abilities.filter((a) => a.ability_is_granted_by_scepter),
  };
}

/** Skill-point abilities from live Valve data (excludes innate, shard/scepter grants, items). */
export function getSkillableAbilitiesFromValve(valveHero) {
  const abilities = (valveHero.abilities ?? []).filter(
    (a) =>
      !a.is_item &&
      !a.ability_is_innate &&
      !a.ability_is_granted_by_scepter &&
      !a.ability_is_granted_by_shard &&
      (a.max_level ?? 0) > 0
  );

  const ultimate = abilities.find((a) => a.type === 1) ?? null;
  const regular = abilities.filter((a) => a !== ultimate);
  const innate = (valveHero.abilities ?? []).filter((a) => a.ability_is_innate).map((a) => a.name);

  return { regular: regular.map((a) => a.name), ultimate: ultimate?.name ?? null, innate };
}

/** Eight talents in game order → four tiers at levels 10/15/20/25. */
export function getTalentTiersFromValve(valveHero) {
  const talents = valveHero.talents ?? [];
  return [1, 2, 3, 4].map((tier) => ({
    tier,
    level: [10, 15, 20, 25][tier - 1],
    left: talents[(tier - 1) * 2]?.name ?? null,
    right: talents[(tier - 1) * 2 + 1]?.name ?? null,
  }));
}

export function getAbilityFromValve(valveHero, abilityName) {
  return allHeroAbilities(valveHero).find((a) => a.name === abilityName) ?? null;
}

export function clearValveHeroCache(heroId) {
  memoryCache.delete(`valveHero:${heroId}`);
}

export function clearValvePatchCache() {
  memoryCache.delete("valveLatestPatch");
}
