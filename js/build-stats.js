/**
 * Pure stat math for the Hero Builder. No DOM/network access here so it stays unit-testable.
 * Formulas follow the community-documented Dota 2 attribute/derived-stat rules
 * (dota2.fandom.com/wiki/Attributes, dota2.fandom.com/wiki/Attack_Speed):
 *  - Strength: +22 max HP, +0.1 HP regen per point
 *  - Agility: +1/6 armor, +1 attack speed (IAS) per point
 *  - Intelligence: +12 max mana, +0.05 mana regen, +0.1% magic resistance per point
 *  - Primary attribute: +1 attack damage per point (+0.7 for Universal heroes, all 3 attrs)
 *  - Attack speed (attacks/sec) = (1 + IAS/100) / BaseAttackTime
 *  - Armor damage reduction = 0.06 * armor / (1 + 0.06 * armor)
 */

const HP_PER_STR = 22;
const HP_REGEN_PER_STR = 0.1;
const MANA_PER_INT = 12;
const MANA_REGEN_PER_INT = 0.05;
const MAGIC_RESIST_PER_INT = 0.1;
const ARMOR_PER_AGI = 1 / 6;
const IAS_PER_AGI = 1;
const DAMAGE_PER_PRIMARY = 1;
const DAMAGE_PER_PRIMARY_UNIVERSAL = 0.7;
const BASE_HEALTH = 120;
const BASE_MANA = 75;

/** Item/ability attrib keys mapped to the stat bucket they contribute to. */
const ATTRIB_STAT_MAP = {
  bonus_strength: "str",
  bonus_agility: "agi",
  bonus_intellect: "int",
  bonus_intelligence: "int",
  bonus_all_stats: "allStats",
  bonus_damage: "damage",
  bonus_attack_speed: "attackSpeed",
  bonus_armor: "armor",
  bonus_hp: "health",
  bonus_health: "health",
  bonus_mana: "mana",
  bonus_mp: "mana",
  bonus_hp_regen: "healthRegen",
  bonus_health_regen: "healthRegen",
  bonus_mp_regen: "manaRegen",
  bonus_mana_regen: "manaRegen",
  bonus_movement_speed: "moveSpeed",
  bonus_move_speed: "moveSpeed",
  bonus_magical_armor: "magicResist",
  bonus_magic_resistance: "magicResist",
  bonus_spell_amplification: "spellAmp",
};

function emptyBonusBucket() {
  return {
    str: 0,
    agi: 0,
    int: 0,
    allStats: 0,
    damage: 0,
    attackSpeed: 0,
    armor: 0,
    health: 0,
    mana: 0,
    healthRegen: 0,
    manaRegen: 0,
    moveSpeed: 0,
    magicResist: 0,
    spellAmp: 0,
  };
}

/** First numeric token in a value that may be a plain number, "45", or a "350 / 375 / 400" progression. */
function firstNumber(value) {
  if (Array.isArray(value)) return Number(value[0]) || 0;
  const match = String(value ?? "").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

/** Sum an item/ability's attrib[] entries into a stat bucket, skipping the switchable Power Treads stat. */
function addAttribBonuses(bucket, attrib) {
  for (const entry of attrib ?? []) {
    if (entry.key === "bonus_stat") continue; // switchable attribute, handled by caller
    const target = ATTRIB_STAT_MAP[entry.key];
    if (!target) continue;
    bucket[target] += firstNumber(entry.value);
  }
}

/**
 * Aggregate stat bonuses from equipped items (main 6 slots + neutral). Backpack items are
 * intentionally excluded — matching real Dota 2, items only apply stats while in the main
 * inventory or neutral slot.
 */
export function computeItemBonuses(itemKeys, itemsData, { primaryAttr = "str" } = {}) {
  const bucket = emptyBonusBucket();
  for (const key of itemKeys) {
    if (!key) continue;
    const item = itemsData?.[key];
    if (!item) continue;
    addAttribBonuses(bucket, item.attrib);

    const stat = (item.attrib ?? []).find((a) => a.key === "bonus_stat");
    if (stat) {
      const target = primaryAttr === "agi" || primaryAttr === "str" ? primaryAttr : primaryAttr === "int" ? "int" : "str";
      bucket[target] += firstNumber(stat.value);
    }
  }
  return bucket;
}

/** Best-effort parse of simple "+N Strength/Agility/Intelligence/All Stats" talent display names. */
export function parseTalentAttributeBonus(dname) {
  const match = String(dname ?? "").match(
    /^\+(\d+(?:\.\d+)?)\s+(Strength|Agility|Intelligence|All Stats)$/i
  );
  if (!match) return null;
  const amount = Number(match[1]);
  const attr = match[2].toLowerCase();
  if (attr === "all stats") return { str: amount, agi: amount, int: amount };
  if (attr === "strength") return { str: amount };
  if (attr === "agility") return { agi: amount };
  return { int: amount };
}

/** Base str/agi/int at a given hero level (1-25), before items/talents/attribute-bonus points. */
export function computeBaseAttributes(hero, level) {
  const growth = Math.max(0, level - 1);
  return {
    str: hero.base_str + hero.str_gain * growth,
    agi: hero.base_agi + hero.agi_gain * growth,
    int: hero.base_int + hero.int_gain * growth,
  };
}

/**
 * Full derived stat sheet for a hero build at a point in time.
 * @param {object} hero dotaconstants hero entry
 * @param {number} level hero level (1-25)
 * @param {{ str: number, agi: number, int: number }} extraAttrs talent/attribute-bonus flat bonuses
 * @param {ReturnType<typeof computeItemBonuses>} itemBonuses
 */
export function computeDerivedStats(hero, level, extraAttrs, itemBonuses) {
  const base = computeBaseAttributes(hero, level);
  const bonus = itemBonuses ?? emptyBonusBucket();
  const extra = extraAttrs ?? { str: 0, agi: 0, int: 0 };

  const totalStr = base.str + extra.str + bonus.str + bonus.allStats;
  const totalAgi = base.agi + extra.agi + bonus.agi + bonus.allStats;
  const totalInt = base.int + extra.int + bonus.int + bonus.allStats;

  const primaryTotal =
    hero.primary_attr === "str"
      ? totalStr
      : hero.primary_attr === "agi"
        ? totalAgi
        : hero.primary_attr === "int"
          ? totalInt
          : (totalStr + totalAgi + totalInt) * DAMAGE_PER_PRIMARY_UNIVERSAL;

  const primaryDamage =
    hero.primary_attr === "all" ? primaryTotal : primaryTotal * DAMAGE_PER_PRIMARY;

  const health = BASE_HEALTH + totalStr * HP_PER_STR + bonus.health;
  const mana = BASE_MANA + totalInt * MANA_PER_INT + bonus.mana;
  const healthRegen = hero.base_health_regen + totalStr * HP_REGEN_PER_STR + bonus.healthRegen;
  const manaRegen = hero.base_mana_regen + totalInt * MANA_REGEN_PER_INT + bonus.manaRegen;
  const armor = hero.base_armor + totalAgi * ARMOR_PER_AGI + bonus.armor;
  const magicResist = hero.base_mr + totalInt * MAGIC_RESIST_PER_INT + bonus.magicResist;
  const moveSpeed = hero.move_speed + bonus.moveSpeed;

  const iasFraction = (totalAgi * IAS_PER_AGI + bonus.attackSpeed) / 100;
  const attacksPerSecond = (1 + iasFraction) / hero.attack_rate;

  const damageMin = hero.base_attack_min + primaryDamage + bonus.damage;
  const damageMax = hero.base_attack_max + primaryDamage + bonus.damage;

  const armorReduction = armor >= 0 ? (0.06 * armor) / (1 + 0.06 * armor) : (0.06 * armor) / (1 - 0.06 * armor);
  const effectiveHpPhysical = health / (1 - armorReduction);

  return {
    level,
    str: totalStr,
    agi: totalAgi,
    int: totalInt,
    health,
    mana,
    healthRegen,
    manaRegen,
    armor,
    magicResist,
    moveSpeed,
    attacksPerSecond,
    damageMin,
    damageMax,
    effectiveHpPhysical,
    spellAmp: bonus.spellAmp,
  };
}
