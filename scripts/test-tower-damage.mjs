import {
  armorDamageMultiplier,
  buildingDamagePerHit,
  computeTowerBreakdown,
  effectiveBuildingArmor,
  formatTowerTime,
  timeToKillBuilding,
} from "../js/tower-damage.js";

const sampleBuildingData = {
  heroBuildingDamageMultiplier: 0.5,
  itemModifiers: {
    desolator: { buildingArmorReduction: 6 },
    assault: { buildingArmorReduction: 5 },
  },
  demolish: { bonusBuildingDamagePct: 40 },
  targets: {
    tower1: { id: "tower1", label: "Tier 1 Tower", health: 1800, armor: 12, healthRegen: 0 },
    tower2: { id: "tower2", label: "Tier 2 Tower", health: 2500, armor: 16, healthRegen: 0 },
    ancient: { id: "ancient", label: "Ancient", health: 4500, armor: 23, healthRegen: 12 },
  },
};

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// T1 armor 12 → ~41.9% reduction
const mult12 = armorDamageMultiplier(12);
assert(mult12 > 0.57 && mult12 < 0.59, `armor 12 mult expected ~0.58, got ${mult12}`);

// Siege: 200 avg dmg, 1 atk/s → 100 base + 0 demolish = 100/hit → 58 DPS after armor 12
const perHit = buildingDamagePerHit(200, { heroMultiplier: 0.5, demolishPct: 0 });
assert(perHit === 100, `perHit expected 100, got ${perHit}`);
const ttk = timeToKillBuilding({ health: 1800, healthRegen: 0 }, perHit * mult12);
assert(ttk > 30 && ttk < 32, `T1 TTK expected ~31s, got ${ttk}`);

// Demolish adds 40% of avg damage on top of siege base
const perHitDemo = buildingDamagePerHit(200, { heroMultiplier: 0.5, demolishPct: 40 });
assert(perHitDemo === 180, `demolish perHit expected 180, got ${perHitDemo}`);

// Deso + AC on T3 (16 armor → 5 effective)
const eff = effectiveBuildingArmor(16, {
  hasDesolator: true,
  hasAssault: true,
  buildingData: sampleBuildingData,
});
assert(eff === 5, `effective armor expected 5, got ${eff}`);

const rows = computeTowerBreakdown(sampleBuildingData, {
  hero: { damageMin: 180, damageMax: 220, attacksPerSecond: 1.5 },
  heroItems: ["desolator"],
  bear: { damageMin: 80, damageMax: 80, attacksPerSecond: 1, demolishPct: 40 },
  bearItems: [],
});
assert(rows.length === 3, `expected 3 tower rows, got ${rows.length}`);
assert(rows[0].heroTime > 0 && rows[0].bearTime > 0, "hero and bear TTK should be positive");
assert(rows[0].combinedTime < rows[0].heroTime, "combined should be faster than hero alone");
assert(formatTowerTime(45.2) === "45.2s", "short time format");
assert(formatTowerTime(125) === "2m 5s", "long time format");

console.log("tower-damage tests passed.");
