import {
  computeBaseAttributes,
  computeDerivedStats,
  computeItemBonuses,
  parseTalentAttributeBonus,
} from "../js/build-stats.js";

let ok = true;
const assert = (label, cond) => {
  if (!cond) {
    console.error("FAIL:", label);
    ok = false;
  } else {
    console.log("OK:", label);
  }
};

const antiMage = {
  primary_attr: "agi",
  base_health_regen: 1,
  base_mana_regen: 0,
  base_armor: 2,
  base_mr: 25,
  base_attack_min: 29,
  base_attack_max: 33,
  base_str: 21,
  base_agi: 24,
  base_int: 12,
  str_gain: 1.6,
  agi_gain: 2.8,
  int_gain: 1.8,
  attack_rate: 1.4,
  move_speed: 310,
};

const base1 = computeBaseAttributes(antiMage, 1);
assert("level 1 base str matches hero data", base1.str === 21);
assert("level 1 base agi matches hero data", base1.agi === 24);

const base25 = computeBaseAttributes(antiMage, 25);
assert(
  "level 25 str grows by 24 * gain",
  Math.abs(base25.str - (21 + 1.6 * 24)) < 1e-9
);

const noItems = computeItemBonuses([], {});
assert("no items -> zero bonuses", noItems.str === 0 && noItems.damage === 0);

const items = {
  wraith_band: { attrib: [{ key: "bonus_strength", value: "2" }, { key: "bonus_agility", value: "2" }, { key: "bonus_intellect", value: "2" }, { key: "bonus_damage", value: "0" }] },
  power_treads: {
    attrib: [
      { key: "bonus_movement_speed_ranged", value: "45" },
      { key: "bonus_stat", value: "10" },
      { key: "bonus_attack_speed", value: "25" },
    ],
  },
  black_king_bar: { attrib: [{ key: "bonus_strength", value: "10" }] },
};

const bonus = computeItemBonuses(
  ["wraith_band", "power_treads", "black_king_bar", null, null, null],
  items,
  { primaryAttr: "agi" }
);
assert("wraith band + BKB strength sums", bonus.str === 2 + 10);
assert("power treads switchable stat added to primary (agi)", bonus.agi === 2 + 10);
assert("attack speed bonus captured", bonus.attackSpeed === 25);

const derivedNoItems = computeDerivedStats(antiMage, 1, { str: 0, agi: 0, int: 0 }, null);
assert("level 1 health = 120 + str*22", Math.abs(derivedNoItems.health - (120 + 21 * 22)) < 1e-6);
assert(
  "level 1 armor = base_armor + agi/6",
  Math.abs(derivedNoItems.armor - (2 + 24 / 6)) < 1e-6
);
assert(
  "attack speed formula (1+IAS/100)/BAT",
  Math.abs(derivedNoItems.attacksPerSecond - (1 + 24 / 100) / 1.4) < 1e-6
);
assert(
  "primary (agi) attribute adds to damage",
  Math.abs(derivedNoItems.damageMax - (33 + 24)) < 1e-6
);

const derivedWithItems = computeDerivedStats(antiMage, 1, { str: 0, agi: 0, int: 0 }, bonus);
assert("item strength raises health", derivedWithItems.health > derivedNoItems.health);
assert(
  "effective HP vs physical exceeds raw health when armor positive",
  derivedNoItems.effectiveHpPhysical > derivedNoItems.health
);

assert(
  "parses simple +N Strength talent",
  parseTalentAttributeBonus("+8 Strength")?.str === 8
);
assert(
  "parses All Stats talent into all three attrs",
  (() => {
    const r = parseTalentAttributeBonus("+6 All Stats");
    return r?.str === 6 && r?.agi === 6 && r?.int === 6;
  })()
);
assert(
  "ignores non-attribute talent text",
  parseTalentAttributeBonus("+15% Magic Resistance") === null
);

if (!ok) process.exit(1);
console.log("Build stats tests passed.");
