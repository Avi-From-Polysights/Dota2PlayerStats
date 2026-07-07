import { getCachedMatchesForAccount } from "./match-cache.js";
import {
  CONSUMABLE_ITEM_KEYS,
  CONSUMABLE_SLOT_KINDS,
  heroUsesBearInventory,
} from "./hero-special.js";
import {
  ITEM_SLOT_COUNT,
  MAX_LEVEL,
  TALENT_TIER_LEVELS,
  createEmptyBuild,
  normalizeBuild,
} from "./build-model.js";

const TALENT_ABILITY_ID = 999;

function minuteFromPurchaseTime(seconds) {
  return Math.max(0, Math.floor(Number(seconds) / 60));
}

function resolveItemKeyFromPurchase(key, itemsData) {
  if (!key) return null;
  const normalized = String(key).replace(/^item_/, "");
  if (itemsData?.[normalized]) return normalized;
  if (itemsData?.[key]) return key;
  return normalized;
}

function resolveItemKeyFromId(itemId, itemKeyById) {
  if (!itemId) return null;
  return itemKeyById.get(Number(itemId)) ?? null;
}

function classifyItemSlot(itemKey) {
  if (!itemKey) return null;
  if (CONSUMABLE_ITEM_KEYS.scepter.has(itemKey)) return "scepter";
  if (CONSUMABLE_ITEM_KEYS.shard.has(itemKey)) return "shard";
  if (CONSUMABLE_ITEM_KEYS.moonshard.has(itemKey)) return "moonshard";
  return "main";
}

function buildAbilityIdMap(valveHero) {
  const map = new Map();
  for (const ability of [...(valveHero?.abilities ?? []), ...(valveHero?.talents ?? [])]) {
    if (ability?.id != null && ability?.name) map.set(Number(ability.id), ability.name);
  }
  return map;
}

function skillOrderFromAbilityUpgrades(upgradeIds, abilityIdMap, skillCtx) {
  const order = new Array(MAX_LEVEL).fill(null);
  let levelIdx = 0;
  let talentTier = 0;

  for (const rawId of upgradeIds ?? []) {
    const id = Number(rawId);
    if (levelIdx >= MAX_LEVEL) break;

    if (id === TALENT_ABILITY_ID) {
      const tier = talentTier + 1;
      talentTier += 1;
      if (tier > 4) continue;
      const tierMeta = TALENT_TIER_LEVELS[tier - 1];
      while (levelIdx < MAX_LEVEL && levelIdx + 1 < tierMeta) {
        levelIdx += 1;
      }
      if (levelIdx >= MAX_LEVEL) break;
      order[levelIdx] = { kind: "talent", tier, side: "left", key: null, imported: true };
      levelIdx += 1;
      continue;
    }

    const abilityName = abilityIdMap.get(id);
    if (!abilityName) continue;

    if (skillCtx.regular.includes(abilityName) || abilityName === skillCtx.ultimate) {
      order[levelIdx] = { kind: "ability", key: abilityName };
      levelIdx += 1;
    }
  }

  return order;
}

function timelineFromPurchaseLog(purchaseLog, itemsData) {
  const events = [];
  for (const entry of purchaseLog ?? []) {
    const itemKey = resolveItemKeyFromPurchase(entry.key, itemsData);
    if (!itemKey || !itemsData[itemKey]) continue;
    events.push({
      id: `import-${entry.time}-${itemKey}-${events.length}`,
      minute: minuteFromPurchaseTime(entry.time),
      action: "buy",
      itemKey,
      slotKind: classifyItemSlot(itemKey) ?? "main",
    });
  }
  events.sort((a, b) => a.minute - b.minute || a.itemKey.localeCompare(b.itemKey));
  return events;
}

function assignFinalItems(build, player, itemKeyById, itemsData, heroKey) {
  const mainKeys = [];
  for (let i = 0; i < ITEM_SLOT_COUNT; i += 1) {
    const key = resolveItemKeyFromId(player[`item_${i}`], itemKeyById);
    if (key && classifyItemSlot(key) === "main" && itemsData[key]) mainKeys.push(key);
  }

  let mainIdx = 0;
  for (let i = 0; i < ITEM_SLOT_COUNT; i += 1) {
    build.items[i] = mainKeys[mainIdx] ?? null;
    if (mainKeys[mainIdx]) mainIdx += 1;
  }

  build.neutralItem = resolveItemKeyFromId(player.item_neutral, itemKeyById);

  for (const kind of CONSUMABLE_SLOT_KINDS) {
    const match = mainKeys.find((k) => classifyItemSlot(k) === kind);
    if (match) build.consumables[kind] = match;
  }

  if (heroUsesBearInventory(heroKey)) {
    for (let i = 0; i < ITEM_SLOT_COUNT; i += 1) {
      build.bearItems[i] =
        resolveItemKeyFromId(player[`item_${i}_lone_druid_bear`], itemKeyById) ?? null;
    }
  }
}

/**
 * Summarize cached matches where the account played `heroId`.
 */
export async function listCachedMatchImports({ accountId, heroId, heroNameById }) {
  const matches = await getCachedMatchesForAccount(accountId);
  const hid = Number(heroId);
  const rows = [];

  for (const match of matches) {
    const me = (match.players ?? []).find(
      (p) => p.account_id === Number(accountId) && p.hero_id === hid
    );
    if (!me) continue;
    const durationMin = Math.floor((match.duration ?? 0) / 60);
    rows.push({
      matchId: match.match_id,
      durationMin,
      kills: me.kills ?? 0,
      deaths: me.deaths ?? 0,
      assists: me.assists ?? 0,
      win: me.win,
      gpm: me.gold_per_min ?? null,
      label: `Match ${match.match_id} · ${durationMin}m · ${me.kills}/${me.deaths}/${me.assists}${me.win ? " · Win" : ""}`,
      player: me,
      heroName: heroNameById?.get(hid)?.localized_name ?? heroNameById?.get(hid) ?? `Hero ${hid}`,
    });
  }

  rows.sort((a, b) => Number(b.matchId) - Number(a.matchId));
  return rows;
}

/** Build a planner state from one cached match row + live hero context. */
export function importBuildFromMatchPlayer({
  player,
  heroId,
  heroKey,
  valveHero,
  skillCtx,
  itemsData,
  itemKeyById,
  matchLabel,
}) {
  const abilityIdMap = buildAbilityIdMap(valveHero);
  const build = normalizeBuild(
    createEmptyBuild({
      heroId,
      name: matchLabel ?? `Imported build ${player.match_id ?? ""}`.trim(),
    })
  );

  build.gpm = player.gold_per_min ?? build.gpm;
  build.skillOrder = skillOrderFromAbilityUpgrades(player.ability_upgrades_arr, abilityIdMap, skillCtx);
  build.itemTimeline = timelineFromPurchaseLog(player.purchase_log, itemsData);
  assignFinalItems(build, player, itemKeyById, itemsData, heroKey);
  build.notes = `Imported from cached match ${player.match_id ?? ""}. Skill/talent mapping uses ability IDs when available.`;
  build.updatedAt = Date.now();
  return build;
}
