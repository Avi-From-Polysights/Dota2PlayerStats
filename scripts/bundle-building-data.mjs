/**
 * Bundle building / tower stats from live Dota VPK extracts (auto-updated upstream).
 * Usage: node scripts/bundle-building-data.mjs --out _site/data
 */
import fs from "node:fs";
import path from "node:path";
import { parseAbilityValues, parseKvBlocks, pickUnit } from "./kv-parse.mjs";

const VPK_BASE =
  "https://raw.githubusercontent.com/spirit-bear-productions/dota_vpk_updates/main/scripts/npc";

const TOWER_UNITS = {
  tower1: "npc_dota_goodguys_tower1_mid",
  tower2: "npc_dota_goodguys_tower2_mid",
  tower3: "npc_dota_goodguys_tower3_mid",
  tower4: "npc_dota_goodguys_tower4",
  ancient: "npc_dota_goodguys_fort",
};

const TOWER_LABELS = {
  tower1: "Tier 1 Tower",
  tower2: "Tier 2 Tower",
  tower3: "Tier 3 Tower",
  tower4: "Tier 4 Tower",
  ancient: "Ancient",
};

function parseArgs() {
  const outIdx = process.argv.indexOf("--out");
  const outDir = outIdx === -1 ? "data" : process.argv[outIdx + 1];
  if (!outDir) throw new Error("Missing --out directory");
  return { outDir: path.resolve(outDir) };
}

function pctFromPenalty(penalty) {
  const n = Number(penalty);
  if (Number.isNaN(n)) return 0.5;
  return 1 + n / 100;
}

function abilityBlock(text, name) {
  const marker = `"${name}"`;
  const idx = text.indexOf(marker);
  if (idx < 0) return null;
  return text.slice(idx, idx + 4000);
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

export async function bundleBuildingData({ outDir } = {}) {
  const [unitsText, abilitiesText, itemsText] = await Promise.all([
    fetchText(`${VPK_BASE}/npc_units.txt`),
    fetchText(`${VPK_BASE}/npc_abilities.txt`),
    fetchText(`${VPK_BASE}/items.txt`),
  ]);

  const unitBlocks = parseKvBlocks(unitsText);
  const targets = {};
  for (const [key, unitName] of Object.entries(TOWER_UNITS)) {
    const unit = pickUnit(unitBlocks, unitName);
    if (!unit) throw new Error(`Missing unit block ${unitName}`);
    targets[key] = {
      id: key,
      label: TOWER_LABELS[key],
      unitName,
      health: unit.health,
      healthRegen: unit.healthRegen,
      armor: unit.armor,
    };
  }

  const siegeBlock = abilityBlock(abilitiesText, "creep_siege");
  const siegeValues = siegeBlock ? parseAbilityValues(siegeBlock) : {};
  const heroBuildingMultiplier = pctFromPenalty(siegeValues.incoming_hero_damage_penalty ?? "-50");

  const demolishBlock = abilityBlock(abilitiesText, "lone_druid_spirit_bear_demolish");
  const demolishValues = demolishBlock ? parseAbilityValues(demolishBlock) : {};

  const desoBlock = abilityBlock(itemsText, "desolator");
  const desoValues = desoBlock ? parseAbilityValues(desoBlock) : {};
  const assaultBlock = abilityBlock(itemsText, "assault");
  const assaultValues = assaultBlock ? parseAbilityValues(assaultBlock) : {};

  const bear = pickUnit(unitBlocks, "npc_dota_lone_druid_bear1");
  if (!bear) throw new Error("Missing npc_dota_lone_druid_bear1");

  const payload = {
    source: "spirit-bear-productions/dota_vpk_updates",
    bundledAt: new Date().toISOString(),
    heroBuildingDamageMultiplier: heroBuildingMultiplier,
    targets,
    itemModifiers: {
      desolator: {
        buildingArmorReduction: Math.abs(Number(desoValues.corruption_armor ?? 6)),
      },
      assault: {
        buildingArmorReduction: Math.abs(Number(assaultValues.aura_negative_armor ?? 5)),
      },
    },
    demolish: {
      ability: "lone_druid_spirit_bear_demolish",
      bonusBuildingDamagePct: Number(demolishValues.bonus_building_damage ?? 40),
    },
    spiritBear: {
      unitName: "npc_dota_lone_druid_bear1",
      baseHealth: bear.health,
      baseHealthRegen: bear.healthRegen,
      baseArmor: bear.armor,
      baseDamageMin: bear.attackMin,
      baseDamageMax: bear.attackMax,
      attackRate: bear.attackRate,
      baseAttackSpeed: bear.baseAttackSpeed,
      baseStr: bear.baseStr,
      baseAgi: bear.baseAgi,
      baseInt: bear.baseInt,
      strGain: bear.strGain,
      agiGain: bear.agiGain,
      intGain: bear.intGain,
      primaryAttr: "all",
      abilities: bear.abilities,
      skillMirror: {
        lone_druid_entangle: "lone_druid_spirit_bear_entangle",
        lone_druid_spirit_link: "lone_druid_spirit_bear_spirit_link",
        lone_druid_savage_roar: "lone_druid_savage_roar_bear",
      },
      innateAbilities: ["lone_druid_spirit_bear_demolish", "lone_druid_spirit_bear_return"],
    },
  };

  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "buildings.json"), JSON.stringify(payload, null, 2));
  }

  return payload;
}

async function main() {
  const { outDir } = parseArgs();
  const payload = await bundleBuildingData({ outDir });
  console.log(
    `Bundled building data → ${outDir}/buildings.json (T1 ${payload.targets.tower1.health} HP, demolish ${payload.demolish.bonusBuildingDamagePct}%)`
  );
}

main().catch((error) => {
  console.error("bundle-building-data FAILED:", error.message);
  process.exit(1);
});