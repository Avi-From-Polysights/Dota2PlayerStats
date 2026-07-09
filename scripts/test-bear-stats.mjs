import { createEmptyBuild, currentHeroLevel } from "../js/build-model.js";
import {
  bearAbilityPoints,
  bearSkillRows,
  computeSpiritBearStats,
} from "../js/bear-stats.js";
import { computeItemBonuses } from "../js/build-stats.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const buildingData = {
  heroBuildingDamageMultiplier: 0.5,
  demolish: { ability: "lone_druid_spirit_bear_demolish", bonusBuildingDamagePct: 40 },
  spiritBear: {
    baseStr: 26,
    strGain: 3.2,
    baseAgi: 26,
    agiGain: 3.2,
    baseInt: 26,
    intGain: 3.2,
    baseDamageMin: 26,
    baseDamageMax: 26,
    baseArmor: 0,
    baseAttackSpeed: 100,
    attackRate: 1.5,
    skillMirror: {
      lone_druid_entangle: "lone_druid_entangle_bear",
      lone_druid_spirit_link: "lone_druid_spirit_link_bear",
      lone_druid_savage_roar: "lone_druid_savage_roar_bear",
    },
    innateAbilities: ["lone_druid_spirit_bear_return", "lone_druid_spirit_bear_demolish"],
  },
};

const items = {
  blades: { attrib: [{ key: "bonus_damage", value: "10" }] },
  power_treads: {
    attrib: [
      { key: "bonus_stat", value: "10" },
      { key: "bonus_attack_speed", value: "25" },
    ],
  },
};

const build = createEmptyBuild({ heroId: 80 });
build.skillOrder[0] = { kind: "ability", key: "lone_druid_entangle" };
build.skillOrder[1] = { kind: "ability", key: "lone_druid_entangle" };
build.skillOrder[2] = { kind: "ability", key: "lone_druid_spirit_link" };

assert(currentHeroLevel(build) === 3, "expected 3 skill picks");
assert(
  bearAbilityPoints(build, "lone_druid_entangle") === 2,
  `entangle points expected 2, got ${bearAbilityPoints(build, "lone_druid_entangle")}`
);
assert(
  bearAbilityPoints(build, "lone_druid_spirit_link") === 1,
  `spirit link points expected 1`
);

const rows = bearSkillRows(buildingData, build, {
  lone_druid_entangle_bear: { dname: "Entangle" },
  lone_druid_spirit_bear_demolish: { dname: "Demolish" },
});
const entangleRow = rows.find((r) => r.heroKey === "lone_druid_entangle");
const demolishRow = rows.find((r) => r.bearKey === "lone_druid_spirit_bear_demolish");
assert(entangleRow?.points === 2, "entangle row should show 2 pips");
assert(demolishRow?.points === 1, "demolish innate active at hero level 1+");

const bare = computeSpiritBearStats(buildingData, 10, [], items);
const withBlades = computeSpiritBearStats(buildingData, 10, ["blades"], items);
assert(
  withBlades.damageMin > bare.damageMin,
  "bear item bonus_damage should increase attack damage"
);

const treadsBonus = computeItemBonuses(["power_treads"], items, { primaryAttr: "all" });
assert(treadsBonus.str === 10 && treadsBonus.agi === 10 && treadsBonus.int === 10, "treads on universal bear adds all stats");

console.log("bear-stats tests passed.");
