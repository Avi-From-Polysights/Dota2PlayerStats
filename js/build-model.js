/**
 * Build/skill-order data model for the Hero Builder.
 *
 * A build's skill order is a fixed 25-entry timeline (one per hero level), matching how
 * real Dota 2 "Hero Guides" define a skill build: one choice per level, filled in order.
 * See dota2.fandom.com/wiki/Guides — guides "suggest items and highlight abilities to level".
 */

export const MAX_LEVEL = 25;
export const TALENT_TIER_LEVELS = [10, 15, 20, 25];
export const ULTIMATE_UNLOCK_LEVELS = [6, 12, 18];
export const ULTIMATE_MAX_POINTS = 3;
export const REGULAR_MAX_POINTS = 4;
export const ATTRIBUTE_BONUS_MAX_POINTS = 7;
export const ATTRIBUTE_BONUS_MIN_LEVEL = 2;
export const ATTRIBUTE_BONUS_LEVEL_STEP = 2;
export const ATTRIBUTE_BONUS_PER_POINT = 2;

/** Heroes with a non-standard talent/leveling system not modeled by the generic grid. */
export const NO_ATTRIBUTE_BONUS_HEROES = new Set(["npc_dota_hero_invoker"]);

export const ITEM_SLOT_COUNT = 6;
export const BACKPACK_SLOT_COUNT = 3;

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `build-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Ability keys the hero can spend skill points on, split into regular abilities and the ultimate. */
export function getSkillableAbilities(heroKey, heroAbilities, abilities) {
  const entry = heroAbilities?.[heroKey];
  const list = entry?.abilities ?? [];
  const innate = [];
  const skillable = [];

  for (const key of list) {
    if (!key || key === "generic_hidden") continue;
    if (abilities?.[key]?.is_innate) {
      innate.push(key);
      continue;
    }
    skillable.push(key);
  }

  const ultimate = skillable.length ? skillable[skillable.length - 1] : null;
  const regular = skillable.length ? skillable.slice(0, -1) : [];
  return { regular, ultimate, innate };
}

/** Talent tiers (level 10/15/20/25), each with two options, from dotaconstants hero_abilities. */
export function getTalentTiers(heroKey, heroAbilities) {
  const entry = heroAbilities?.[heroKey];
  const talents = entry?.talents ?? [];
  const byTier = new Map();

  for (const talent of talents) {
    const tier = Number(talent.level);
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier).push(talent.name);
  }

  return [1, 2, 3, 4]
    .filter((tier) => byTier.has(tier))
    .map((tier) => {
      const names = byTier.get(tier);
      return {
        tier,
        level: TALENT_TIER_LEVELS[tier - 1],
        left: names[0] ?? null,
        right: names[1] ?? null,
      };
    });
}

export function heroHasAttributeBonus(heroKey) {
  return !NO_ATTRIBUTE_BONUS_HEROES.has(heroKey);
}

export function createEmptyBuild({ heroId, name = "" } = {}) {
  const now = Date.now();
  return {
    id: uid(),
    heroId: Number(heroId),
    name: name || "Untitled build",
    createdAt: now,
    updatedAt: now,
    skillOrder: new Array(MAX_LEVEL).fill(null),
    items: new Array(ITEM_SLOT_COUNT).fill(null),
    backpack: new Array(BACKPACK_SLOT_COUNT).fill(null),
    neutralItem: null,
    notes: "",
  };
}

export function cloneBuild(build) {
  return {
    ...build,
    skillOrder: build.skillOrder.map((entry) => (entry ? { ...entry } : null)),
    items: [...build.items],
    backpack: [...build.backpack],
  };
}

/** Index (0-based) of the next unfilled level, or -1 if the timeline (level 25) is complete. */
export function nextOpenLevelIndex(build) {
  const idx = build.skillOrder.findIndex((entry) => entry == null);
  return idx;
}

export function currentHeroLevel(build) {
  const idx = nextOpenLevelIndex(build);
  return idx === -1 ? MAX_LEVEL : idx;
}

function countPicks(build, predicate) {
  return build.skillOrder.filter((entry) => entry != null && predicate(entry)).length;
}

export function countAbilityPoints(build, abilityKey) {
  return countPicks(build, (entry) => entry.kind === "ability" && entry.key === abilityKey);
}

export function countAttributeBonusPoints(build) {
  return countPicks(build, (entry) => entry.kind === "attribute");
}

/** Whether `level` (1-based) is reserved for a forced talent-tier pick. */
export function isTalentLevel(level) {
  return TALENT_TIER_LEVELS.includes(level);
}

export function canAssignAbility(build, ctx, abilityKey) {
  const idx = nextOpenLevelIndex(build);
  if (idx === -1) return { ok: false, reason: "Build is already at level 25." };
  const level = idx + 1;
  if (isTalentLevel(level)) {
    return { ok: false, reason: `Level ${level} is reserved for a talent choice.` };
  }

  if (abilityKey === ctx.ultimate) {
    const have = countAbilityPoints(build, abilityKey);
    if (have >= ULTIMATE_MAX_POINTS) return { ok: false, reason: "Ultimate is already maxed." };
    const requiredLevel = ULTIMATE_UNLOCK_LEVELS[have];
    if (level < requiredLevel) {
      return { ok: false, reason: `Ultimate's next point needs level ${requiredLevel}.` };
    }
    return { ok: true, level };
  }

  if (!ctx.regular.includes(abilityKey)) {
    return { ok: false, reason: "Unknown ability for this hero." };
  }
  const have = countAbilityPoints(build, abilityKey);
  if (have >= REGULAR_MAX_POINTS) return { ok: false, reason: "Ability is already maxed." };
  return { ok: true, level };
}

export function canAssignTalent(build, tier) {
  const idx = nextOpenLevelIndex(build);
  if (idx === -1) return { ok: false, reason: "Build is already at level 25." };
  const level = idx + 1;
  const expectedLevel = TALENT_TIER_LEVELS[tier - 1];
  if (level !== expectedLevel) {
    return { ok: false, reason: `Talent tier ${tier} unlocks at level ${expectedLevel}.` };
  }
  return { ok: true, level };
}

export function canAssignAttribute(build, heroKey) {
  const idx = nextOpenLevelIndex(build);
  if (idx === -1) return { ok: false, reason: "Build is already at level 25." };
  const level = idx + 1;
  if (isTalentLevel(level)) {
    return { ok: false, reason: `Level ${level} is reserved for a talent choice.` };
  }
  if (!heroHasAttributeBonus(heroKey)) {
    return { ok: false, reason: "This hero has no Attribute Bonus (e.g. Invoker)." };
  }
  const have = countAttributeBonusPoints(build);
  if (have >= ATTRIBUTE_BONUS_MAX_POINTS) {
    return { ok: false, reason: "Attribute Bonus is already maxed." };
  }
  const requiredLevel = ATTRIBUTE_BONUS_MIN_LEVEL + have * ATTRIBUTE_BONUS_LEVEL_STEP;
  if (level < requiredLevel) {
    return { ok: false, reason: `Attribute Bonus's next point needs level ${requiredLevel}.` };
  }
  return { ok: true, level };
}

export function assignAbility(build, ctx, abilityKey) {
  const check = canAssignAbility(build, ctx, abilityKey);
  if (!check.ok) throw new Error(check.reason);
  build.skillOrder[check.level - 1] = { kind: "ability", key: abilityKey };
  build.updatedAt = Date.now();
  return build;
}

export function assignTalent(build, tier, side, talentName) {
  const check = canAssignTalent(build, tier);
  if (!check.ok) throw new Error(check.reason);
  build.skillOrder[check.level - 1] = { kind: "talent", tier, side, key: talentName };
  build.updatedAt = Date.now();
  return build;
}

export function assignAttribute(build, heroKey) {
  const check = canAssignAttribute(build, heroKey);
  if (!check.ok) throw new Error(check.reason);
  build.skillOrder[check.level - 1] = { kind: "attribute" };
  build.updatedAt = Date.now();
  return build;
}

export function undoLastPick(build) {
  const idx = nextOpenLevelIndex(build);
  const lastFilled = idx === -1 ? MAX_LEVEL - 1 : idx - 1;
  if (lastFilled < 0) return build;
  build.skillOrder[lastFilled] = null;
  build.updatedAt = Date.now();
  return build;
}

export function resetSkillOrder(build) {
  build.skillOrder = new Array(MAX_LEVEL).fill(null);
  build.updatedAt = Date.now();
  return build;
}

/** Chosen talent side ('left'|'right') per tier 1-4, or null if not yet picked. */
export function getChosenTalentSides(build) {
  const chosen = { 1: null, 2: null, 3: null, 4: null };
  for (const entry of build.skillOrder) {
    if (entry?.kind === "talent") chosen[entry.tier] = entry.side;
  }
  return chosen;
}

/** Flat str/agi/int bonus from attribute-bonus points + any parsed "+N Stat" talents chosen so far. */
export function computeSkillAttributeBonus(build, { parseTalentAttributeBonus, talentDnameByKey } = {}) {
  const bonus = { str: 0, agi: 0, int: 0 };
  const attributePoints = countAttributeBonusPoints(build);
  bonus.str += attributePoints * ATTRIBUTE_BONUS_PER_POINT;
  bonus.agi += attributePoints * ATTRIBUTE_BONUS_PER_POINT;
  bonus.int += attributePoints * ATTRIBUTE_BONUS_PER_POINT;

  if (parseTalentAttributeBonus && talentDnameByKey) {
    for (const entry of build.skillOrder) {
      if (entry?.kind !== "talent") continue;
      const dname = talentDnameByKey.get(entry.key);
      const parsed = parseTalentAttributeBonus(dname);
      if (!parsed) continue;
      bonus.str += parsed.str ?? 0;
      bonus.agi += parsed.agi ?? 0;
      bonus.int += parsed.int ?? 0;
    }
  }

  return bonus;
}

export function setItemSlot(build, index, itemKey) {
  if (index < 0 || index >= ITEM_SLOT_COUNT) throw new Error("Invalid item slot index.");
  build.items[index] = itemKey || null;
  build.updatedAt = Date.now();
  return build;
}

export function setBackpackSlot(build, index, itemKey) {
  if (index < 0 || index >= BACKPACK_SLOT_COUNT) throw new Error("Invalid backpack slot index.");
  build.backpack[index] = itemKey || null;
  build.updatedAt = Date.now();
  return build;
}

export function setNeutralItem(build, itemKey) {
  build.neutralItem = itemKey || null;
  build.updatedAt = Date.now();
  return build;
}

export function totalItemCost(itemKeys, itemsData) {
  return itemKeys.reduce((sum, key) => sum + (key ? itemsData?.[key]?.cost ?? 0 : 0), 0);
}
