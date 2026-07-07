import { getSkillableAbilities, getTalentTiers } from "./build-model.js";
import {
  getItemGrantsFromValve,
  getSkillableAbilitiesFromValve,
  getTalentTiersFromValve,
} from "./valve-datafeed.js";

export const KEZ_HERO_KEY = "npc_dota_hero_kez";
export const LONE_DRUID_HERO_KEY = "npc_dota_hero_lone_druid";

export const KEZ_KATANA_REGULAR = ["kez_echo_slash", "kez_grappling_claw", "kez_kazurai_katana"];
export const KEZ_SAI_REGULAR = ["kez_falcon_rush", "kez_talon_toss", "kez_shodo_sai"];
export const KEZ_LINKED_ULTIMATES = ["kez_raptor_dance", "kez_ravens_veil"];

/** Dedicated consumable slots — not counted toward the 6 main inventory slots. */
export const CONSUMABLE_SLOT_KINDS = ["scepter", "shard", "moonshard"];

export const CONSUMABLE_ITEM_KEYS = {
  scepter: new Set(["ultimate_scepter"]),
  shard: new Set(["aghanims_shard"]),
  moonshard: new Set(["moon_shard"]),
};

export function isConsumableSlotItem(slotKind, itemKey) {
  if (!itemKey) return true;
  const allowed = CONSUMABLE_ITEM_KEYS[slotKind];
  return allowed ? allowed.has(itemKey) : false;
}

export function isMainInventoryItem(itemKey, itemsData) {
  if (!itemKey) return true;
  if (CONSUMABLE_ITEM_KEYS.scepter.has(itemKey)) return false;
  if (CONSUMABLE_ITEM_KEYS.shard.has(itemKey)) return false;
  if (CONSUMABLE_ITEM_KEYS.moonshard.has(itemKey)) return false;
  const item = itemsData?.[itemKey];
  if (!item) return true;
  if (itemKey === "aghanims_shard" || itemKey === "ultimate_scepter" || itemKey === "moon_shard") {
    return false;
  }
  return true;
}

export function heroUsesBearInventory(heroKey) {
  return heroKey === LONE_DRUID_HERO_KEY;
}

export function heroUsesKezStances(heroKey) {
  return heroKey === KEZ_HERO_KEY;
}

export function isLinkedUltimate(heroKey, abilityKey) {
  return heroKey === KEZ_HERO_KEY && KEZ_LINKED_ULTIMATES.includes(abilityKey);
}

export function abilityKeysMatchForCap(heroKey, a, b) {
  if (a === b) return true;
  if (isLinkedUltimate(heroKey, a) && isLinkedUltimate(heroKey, b)) return true;
  return false;
}

function getKezSkillLayout(valveHero) {
  const innate = (valveHero.abilities ?? [])
    .filter((a) => a.ability_is_innate)
    .map((a) => a.name);
  return {
    layout: "kez",
    regular: [...KEZ_KATANA_REGULAR, ...KEZ_SAI_REGULAR],
    ultimate: KEZ_LINKED_ULTIMATES[0],
    linkedUltimates: KEZ_LINKED_ULTIMATES,
    stances: [
      { id: "katana", label: "Katana", regular: KEZ_KATANA_REGULAR, ultimate: "kez_raptor_dance" },
      { id: "sai", label: "Sai", regular: KEZ_SAI_REGULAR, ultimate: "kez_ravens_veil" },
    ],
    innate,
    grants: getItemGrantsFromValve(valveHero),
  };
}

/** Unified skill layout for any hero (Valve preferred, dotaconstants fallback). */
export function resolveHeroSkillLayout(heroKey, { valveHero, heroAbilities, abilities } = {}) {
  if (heroKey === KEZ_HERO_KEY && valveHero) {
    return getKezSkillLayout(valveHero);
  }

  if (valveHero) {
    return {
      layout: heroKey === LONE_DRUID_HERO_KEY ? "lone_druid" : "standard",
      ...getSkillableAbilitiesFromValve(valveHero),
      linkedUltimates: [],
      stances: null,
      grants: getItemGrantsFromValve(valveHero),
    };
  }

  const ctx = getSkillableAbilities(heroKey, heroAbilities, abilities);
  return {
    layout: heroKey === LONE_DRUID_HERO_KEY ? "lone_druid" : "standard",
    ...ctx,
    linkedUltimates: [],
    stances: null,
    grants: { shard: [], scepter: [] },
  };
}

export function resolveTalentTiers(heroKey, { valveHero, heroAbilities } = {}) {
  if (valveHero) return getTalentTiersFromValve(valveHero);
  return getTalentTiers(heroKey, heroAbilities);
}
