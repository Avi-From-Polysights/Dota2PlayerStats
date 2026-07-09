/**
 * Tower / Ancient time-to-kill from hero (and Spirit Bear) auto-attack damage.
 * Uses bundled VPK building stats + standard Dota armor / siege damage rules.
 */

const ARMOR_FACTOR = 0.06;

/** @typedef {{ targets: Record<string, {label:string, health:number, armor:number, healthRegen:number}>, heroBuildingDamageMultiplier:number, itemModifiers:{desolator:{buildingArmorReduction:number}, assault:{buildingArmorReduction:number}}, demolish:{bonusBuildingDamagePct:number} }} BuildingDataset */

export function armorDamageMultiplier(armor) {
  return 1 - (ARMOR_FACTOR * armor) / (1 + ARMOR_FACTOR * Math.abs(armor));
}

export function averageDamage(damageMin, damageMax) {
  return (damageMin + damageMax) / 2;
}

/**
 * Physical damage per hit vs fortified buildings (siege).
 * Base hero/bear attack is reduced; demolish bonus is added at full value.
 */
export function buildingDamagePerHit(avgDamage, { heroMultiplier, demolishPct = 0 }) {
  const siegeBase = avgDamage * heroMultiplier;
  const demolishBonus = avgDamage * (demolishPct / 100);
  return siegeBase + demolishBonus;
}

export function effectiveBuildingArmor(baseArmor, { hasDesolator, hasAssault, buildingData }) {
  let armor = baseArmor;
  if (hasDesolator) armor -= buildingData.itemModifiers?.desolator?.buildingArmorReduction ?? 0;
  if (hasAssault) armor -= buildingData.itemModifiers?.assault?.buildingArmorReduction ?? 0;
  return armor;
}

export function hasBuildingArmorItem(itemKeys) {
  const keys = new Set((itemKeys ?? []).filter(Boolean));
  return {
    hasDesolator: keys.has("desolator") || keys.has("desolator_2"),
    hasAssault: keys.has("assault"),
  };
}

export function physicalDpsVsBuilding(
  { damageMin, damageMax, attacksPerSecond, demolishPct = 0 },
  buildingData,
  armorOptions
) {
  const avg = averageDamage(damageMin, damageMax);
  const perHit = buildingDamagePerHit(avg, {
    heroMultiplier: buildingData.heroBuildingDamageMultiplier ?? 0.5,
    demolishPct,
  });
  const dps = perHit * attacksPerSecond;
  const armor = effectiveBuildingArmor(armorOptions.baseArmor, armorOptions);
  return dps * armorDamageMultiplier(armor);
}

export function timeToKillBuilding(target, netPhysicalDps) {
  const regen = target.healthRegen ?? 0;
  const net = netPhysicalDps - regen;
  if (net <= 0) return Infinity;
  return target.health / net;
}

export function formatTowerTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

/**
 * @param {BuildingDataset} buildingData
 * @param {{ hero: {damageMin,damageMax,attacksPerSecond}, heroItems: string[], bear?: {damageMin,damageMax,attacksPerSecond,demolishPct}, bearItems?: string[] }} attackers
 */
export function computeTowerBreakdown(buildingData, attackers) {
  const heroArmorItems = hasBuildingArmorItem(attackers.heroItems);
  const bearArmorItems = hasBuildingArmorItem(attackers.bearItems ?? []);
  const combinedArmorItems = hasBuildingArmorItem([
    ...(attackers.heroItems ?? []),
    ...(attackers.bearItems ?? []),
  ]);

  const rows = [];
  for (const target of Object.values(buildingData.targets ?? {})) {
    const heroDps = physicalDpsVsBuilding(attackers.hero, buildingData, {
      baseArmor: target.armor,
      hasDesolator: heroArmorItems.hasDesolator,
      hasAssault: heroArmorItems.hasAssault,
      buildingData,
    });
    const heroTime = timeToKillBuilding(target, heroDps);

    let bearDps = null;
    let bearTime = null;
    let combinedTime = heroTime;
    if (attackers.bear) {
      bearDps = physicalDpsVsBuilding(
        {
          ...attackers.bear,
          demolishPct: attackers.bear.demolishPct ?? 0,
        },
        buildingData,
        {
          baseArmor: target.armor,
          hasDesolator: bearArmorItems.hasDesolator,
          hasAssault: bearArmorItems.hasAssault,
          buildingData,
        }
      );
      bearTime = timeToKillBuilding(target, bearDps);

      const heroDpsCombined = physicalDpsVsBuilding(attackers.hero, buildingData, {
        baseArmor: target.armor,
        hasDesolator: combinedArmorItems.hasDesolator,
        hasAssault: combinedArmorItems.hasAssault,
        buildingData,
      });
      const bearDpsCombined = physicalDpsVsBuilding(
        {
          ...attackers.bear,
          demolishPct: attackers.bear.demolishPct ?? 0,
        },
        buildingData,
        {
          baseArmor: target.armor,
          hasDesolator: combinedArmorItems.hasDesolator,
          hasAssault: combinedArmorItems.hasAssault,
          buildingData,
        }
      );
      const combinedNet = heroDpsCombined + bearDpsCombined - (target.healthRegen ?? 0);
      combinedTime = combinedNet > 0 ? target.health / combinedNet : Infinity;
    }

    rows.push({
      id: target.id,
      label: target.label,
      health: target.health,
      armor: target.armor,
      effectiveArmorHero: effectiveBuildingArmor(target.armor, {
        hasDesolator: heroArmorItems.hasDesolator,
        hasAssault: heroArmorItems.hasAssault,
        buildingData,
      }),
      effectiveArmorBear: attackers.bear
        ? effectiveBuildingArmor(target.armor, {
            hasDesolator: bearArmorItems.hasDesolator,
            hasAssault: bearArmorItems.hasAssault,
            buildingData,
          })
        : null,
      heroDps,
      heroTime,
      bearDps,
      bearTime,
      combinedTime,
    });
  }

  return rows;
}
