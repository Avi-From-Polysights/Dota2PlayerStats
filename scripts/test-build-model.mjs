import {
  ATTRIBUTE_BONUS_MAX_POINTS,
  MAX_LEVEL,
  assignAbility,
  assignAttribute,
  assignTalent,
  canAssignAbility,
  canAssignAttribute,
  canAssignTalent,
  countAbilityPoints,
  countAttributeBonusPoints,
  createEmptyBuild,
  currentHeroLevel,
  getChosenTalentSides,
  getSkillableAbilities,
  getTalentTiers,
  nextOpenLevelIndex,
  setItemSlot,
  setNeutralItem,
  totalItemCost,
  undoLastPick,
} from "../js/build-model.js";

let ok = true;
const assert = (label, cond) => {
  if (!cond) {
    console.error("FAIL:", label);
    ok = false;
  } else {
    console.log("OK:", label);
  }
};

const heroAbilities = {
  npc_dota_hero_antimage: {
    abilities: [
      "antimage_mana_break",
      "antimage_blink",
      "antimage_counterspell",
      "generic_hidden",
      "antimage_persectur",
      "antimage_mana_void",
    ],
    talents: [
      { name: "special_bonus_hp_regen_3", level: 1 },
      { name: "special_bonus_unique_antimage_manavoid_aoe", level: 1 },
      { name: "special_bonus_unique_antimage_5", level: 2 },
      { name: "special_bonus_unique_antimage_6", level: 2 },
      { name: "special_bonus_unique_antimage_3", level: 3 },
      { name: "special_bonus_unique_antimage_8", level: 3 },
      { name: "special_bonus_unique_antimage", level: 4 },
      { name: "special_bonus_unique_antimage_2", level: 4 },
    ],
  },
};

const abilities = {
  antimage_persectur: { is_innate: true, dname: "Persecutor" },
  antimage_mana_break: { dname: "Mana Break" },
  antimage_blink: { dname: "Blink" },
  antimage_counterspell: { dname: "Counterspell" },
  antimage_mana_void: { dname: "Mana Void" },
};

const heroKey = "npc_dota_hero_antimage";
const skillable = getSkillableAbilities(heroKey, heroAbilities, abilities);
assert(
  "filters generic_hidden and is_innate abilities",
  skillable.regular.length === 3 && skillable.innate.includes("antimage_persectur")
);
assert("ultimate is last remaining ability", skillable.ultimate === "antimage_mana_void");

const tiers = getTalentTiers(heroKey, heroAbilities);
assert("four talent tiers resolved", tiers.length === 4);
assert("tier levels map to 10/15/20/25", tiers.map((t) => t.level).join(",") === "10,15,20,25");

let build = createEmptyBuild({ heroId: 1, name: "Test build" });
assert("starts at level 0 (no picks yet)", currentHeroLevel(build) === 0);
assert("next open level index is 0", nextOpenLevelIndex(build) === 0);

assignAbility(build, skillable, "antimage_mana_break");
assert("level 1 filled with ability", build.skillOrder[0]?.key === "antimage_mana_break");
assert("current level now 1", currentHeroLevel(build) === 1);

let threwOnUltimateTooEarly = false;
try {
  assignAbility(build, skillable, skillable.ultimate);
} catch {
  threwOnUltimateTooEarly = true;
}
assert("cannot take ultimate before level 6", threwOnUltimateTooEarly);

for (let i = 0; i < 4; i += 1) {
  assignAbility(build, skillable, "antimage_blink");
}
assert("blink capped check throws on 5th point", (() => {
  try {
    assignAbility(build, skillable, "antimage_blink");
    return false;
  } catch {
    return true;
  }
})());

assert("regular ability max 4 points enforced", countAbilityPoints(build, "antimage_blink") === 4);
assert("current level is 5 after 1 mana_break + 4 blink", currentHeroLevel(build) === 5);

assignAbility(build, skillable, "antimage_counterspell");
assert("level 6 reached", currentHeroLevel(build) === 6);

const ultCheckBeforeSixth = canAssignAbility(build, skillable, skillable.ultimate);
assert("ultimate assignable exactly at level 6", ultCheckBeforeSixth.ok === true);
assignAbility(build, skillable, skillable.ultimate);
assert("ultimate has 1 point", countAbilityPoints(build, skillable.ultimate) === 1);

for (let i = build.skillOrder.filter(Boolean).length; i < 8; i += 1) {
  assignAbility(build, skillable, "antimage_counterspell");
}
assert("current level 8 before talent tier", currentHeroLevel(build) === 8);

const talentCheckEarly = canAssignTalent(build, 1);
assert("talent tier 1 not assignable before level 10", talentCheckEarly.ok === false);

assignAttribute(build, heroKey);
assert("attribute bonus point recorded", countAttributeBonusPoints(build) === 1);
assert("current level 9 now, next level (10) reserved for talent", currentHeroLevel(build) === 9);

const talentCheck = canAssignTalent(build, 1);
assert("talent tier 1 assignable at level 10", talentCheck.ok === true);
assignTalent(build, 1, "left", tiers[0].left);
assert("talent tier 1 recorded", getChosenTalentSides(build)[1] === "left");
assert("current level 10 now", currentHeroLevel(build) === 10);

let threwWrongTier = false;
try {
  assignTalent(build, 2, "left", tiers[1].left);
} catch {
  threwWrongTier = true;
}
assert("cannot take tier 2 talent at level 11", threwWrongTier);

const undoBuild = createEmptyBuild({ heroId: 1 });
assignAbility(undoBuild, skillable, "antimage_mana_break");
assignAbility(undoBuild, skillable, "antimage_blink");
undoLastPick(undoBuild);
assert("undo clears last pick only", currentHeroLevel(undoBuild) === 1 && undoBuild.skillOrder[0]?.key === "antimage_mana_break");

const attrBuild = createEmptyBuild({ heroId: 1 });
const fillerPool = ["antimage_mana_break", "antimage_blink", "antimage_counterspell"];
const abilityCtx = { regular: fillerPool, ultimate: "__none__" };
let points = 0;
let guard = 0;
while (points < ATTRIBUTE_BONUS_MAX_POINTS && guard < MAX_LEVEL) {
  const check = canAssignAttribute(attrBuild, heroKey);
  if (check.ok) {
    assignAttribute(attrBuild, heroKey);
    points += 1;
  } else {
    const idx = nextOpenLevelIndex(attrBuild);
    if (idx === -1) break;
    const level = idx + 1;
    if ([10, 15, 20, 25].includes(level)) {
      attrBuild.skillOrder[idx] = { kind: "talent", tier: [10, 15, 20, 25].indexOf(level) + 1, side: "left", key: "x" };
    } else {
      const filler = fillerPool.find((key) => canAssignAbility(attrBuild, abilityCtx, key).ok);
      assignAbility(attrBuild, abilityCtx, filler);
    }
  }
  guard += 1;
}
assert("can eventually reach 7 attribute bonus points", points === ATTRIBUTE_BONUS_MAX_POINTS);

const itemBuild = createEmptyBuild({ heroId: 1 });
setItemSlot(itemBuild, 0, "black_king_bar");
setItemSlot(itemBuild, 1, "power_treads");
setNeutralItem(itemBuild, "philosophers_stone");
assert("item slots recorded", itemBuild.items[0] === "black_king_bar" && itemBuild.neutralItem === "philosophers_stone");

const cost = totalItemCost(itemBuild.items, {
  black_king_bar: { cost: 4050 },
  power_treads: { cost: 1400 },
});
assert("total item cost sums correctly", cost === 4050 + 1400);

let threwOnInvalidSlot = false;
try {
  setItemSlot(itemBuild, 9, "x");
} catch {
  threwOnInvalidSlot = true;
}
assert("rejects out-of-range item slot", threwOnInvalidSlot);

if (!ok) process.exit(1);
console.log("Build model tests passed.");
