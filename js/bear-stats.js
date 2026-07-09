import { computeItemBonuses } from "./build-stats.js";

const UNIVERSAL_DAMAGE_FACTOR = 0.7;
const ARMOR_PER_AGI = 1 / 6;

function primaryDamageFromAttrs(primaryAttr, str, agi, int) {
  if (primaryAttr === "str") return str;
  if (primaryAttr === "agi") return agi;
  if (primaryAttr === "int") return int;
  return (str + agi + int) * UNIVERSAL_DAMAGE_FACTOR;
}

/**
 * Spirit Bear combat stats at the same level as Lone Druid, using bundled unit KV + bear items.
 */
export function computeSpiritBearStats(buildingData, level, itemKeys, itemsData) {
  const bear = buildingData?.spiritBear;
  if (!bear || level < 1) return null;

  const growth = Math.max(0, level - 1);
  const str = bear.baseStr + bear.strGain * growth;
  const agi = bear.baseAgi + bear.agiGain * growth;
  const int = bear.baseInt + bear.intGain * growth;
  const itemBonuses = computeItemBonuses(itemKeys, itemsData, { primaryAttr: "all" });

  const totalStr = str + itemBonuses.str + itemBonuses.allStats;
  const totalAgi = agi + itemBonuses.agi + itemBonuses.allStats;
  const totalInt = int + itemBonuses.int + itemBonuses.allStats;

  const primaryDamage = primaryDamageFromAttrs("all", totalStr, totalAgi, totalInt);
  const damageMin = bear.baseDamageMin + primaryDamage + itemBonuses.damage;
  const damageMax = bear.baseDamageMax + primaryDamage + itemBonuses.damage;
  const armor = bear.baseArmor + totalAgi * ARMOR_PER_AGI + itemBonuses.armor;
  const iasFraction = (bear.baseAttackSpeed + totalAgi + itemBonuses.attackSpeed) / 100;
  const attacksPerSecond = (1 + iasFraction) / bear.attackRate;

  return {
    level,
    str: totalStr,
    agi: totalAgi,
    int: totalInt,
    damageMin,
    damageMax,
    armor,
    attacksPerSecond,
    demolishPct: buildingData.demolish?.bonusBuildingDamagePct ?? 0,
  };
}

/** Count skill points spent on a mirrored Lone Druid ability in the build. */
export function bearAbilityPoints(build, heroAbilityKey) {
  return (build?.levels ?? []).filter(
    (entry) => entry?.kind === "ability" && entry.key === heroAbilityKey
  ).length;
}

export function bearSkillRows(buildingData, build, abilitiesData) {
  const mirror = buildingData?.spiritBear?.skillMirror ?? {};
  const rows = [];

  for (const [heroKey, bearKey] of Object.entries(mirror)) {
    const points = bearAbilityPoints(build, heroKey);
    rows.push({
      kind: "ability",
      heroKey,
      bearKey,
      points,
      label: abilitiesData?.[bearKey]?.dname ?? bearKey,
    });
  }

  for (const innate of buildingData?.spiritBear?.innateAbilities ?? []) {
    if (innate === buildingData?.demolish?.ability) {
      const level = (build?.levels ?? []).filter((entry) => entry != null).length;
      rows.push({
        kind: "innate",
        bearKey: innate,
        points: level > 0 ? 1 : 0,
        label: abilitiesData?.[innate]?.dname ?? "Demolish",
        demolishPct: buildingData.demolish?.bonusBuildingDamagePct ?? 0,
      });
      continue;
    }
    rows.push({
      kind: "innate",
      bearKey: innate,
      points: 1,
      label: abilitiesData?.[innate]?.dname ?? innate,
    });
  }

  return rows;
}
