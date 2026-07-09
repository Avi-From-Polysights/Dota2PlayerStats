import { countAbilityPoints, currentHeroLevel } from "./build-model.js";
import { computeItemBonuses } from "./build-stats.js";

const UNIVERSAL_DAMAGE_FACTOR = 0.7;
const ARMOR_PER_AGI = 1 / 6;

function primaryDamageFromAttrs(str, agi, int) {
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

  const primaryDamage = primaryDamageFromAttrs(totalStr, totalAgi, totalInt);
  const damageMin = bear.baseDamageMin + primaryDamage + itemBonuses.damage;
  const damageMax = bear.baseDamageMax + primaryDamage + itemBonuses.damage;
  const armor = bear.baseArmor + totalAgi * ARMOR_PER_AGI + itemBonuses.armor;
  const iasFraction = (bear.baseAttackSpeed + totalAgi + itemBonuses.attackSpeed) / 100;
  const attacksPerSecond = (1 + iasFraction) / bear.attackRate;

  const demolishPct =
    level >= 1 ? (buildingData.demolish?.bonusBuildingDamagePct ?? 0) : 0;

  return {
    level,
    str: totalStr,
    agi: totalAgi,
    int: totalInt,
    damageMin,
    damageMax,
    armor,
    attacksPerSecond,
    demolishPct,
  };
}

/** Count skill points spent on a mirrored Lone Druid ability in the build. */
export function bearAbilityPoints(build, heroAbilityKey, assignOpts = {}) {
  return countAbilityPoints(build, heroAbilityKey, assignOpts);
}

export function bearSkillRows(buildingData, build, abilitiesData, assignOpts = {}) {
  const mirror = buildingData?.spiritBear?.skillMirror ?? {};
  const rows = [];
  const heroLevel = Math.max(1, currentHeroLevel(build));

  for (const [heroKey, bearKey] of Object.entries(mirror)) {
    const points = bearAbilityPoints(build, heroKey, assignOpts);
    rows.push({
      kind: "ability",
      heroKey,
      bearKey,
      points,
      maxPoints: 4,
      label: abilitiesData?.[bearKey]?.dname ?? bearKey,
    });
  }

  for (const innate of buildingData?.spiritBear?.innateAbilities ?? []) {
    if (innate === buildingData?.demolish?.ability) {
      rows.push({
        kind: "innate",
        bearKey: innate,
        points: heroLevel >= 1 ? 1 : 0,
        maxPoints: 1,
        label: abilitiesData?.[innate]?.dname ?? "Demolish",
        demolishPct: buildingData.demolish?.bonusBuildingDamagePct ?? 0,
      });
      continue;
    }
    rows.push({
      kind: "innate",
      bearKey: innate,
      points: heroLevel >= 1 ? 1 : 0,
      maxPoints: 1,
      label: abilitiesData?.[innate]?.dname ?? innate,
    });
  }

  return rows;
}

export function formatBearCombatSummary(stats) {
  if (!stats) return "";
  return `${Math.round(stats.damageMin)}–${Math.round(stats.damageMax)} dmg · ${stats.attacksPerSecond.toFixed(2)}/s`;
}
