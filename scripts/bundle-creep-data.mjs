/**
 * Bundle lane creep / tower / Anti-Mage stats from live Dota VPK extracts.
 *
 * Feeds the browser Last Hit Trainer so its damage, armor and timing numbers
 * track the live patch instead of drifting out of date in a hand-written table.
 *
 * Usage: node scripts/bundle-creep-data.mjs --out _site/data
 */
import fs from "node:fs";
import path from "node:path";
import { parseKvBlocks } from "./kv-parse.mjs";

const VPK_BASE =
  "https://raw.githubusercontent.com/spirit-bear-productions/dota_vpk_updates/main/scripts/npc";

const HERO_BASE_UNIT = "npc_dota_hero_base";
const HERO_UNIT = "npc_dota_hero_antimage";
const TOWER_UNIT = "npc_dota_goodguys_tower1_mid";

const CREEP_UNITS = {
  melee: "npc_dota_creep_goodguys_melee",
  ranged: "npc_dota_creep_goodguys_ranged",
};

function parseArgs() {
  const outIdx = process.argv.indexOf("--out");
  const outDir = outIdx === -1 ? "data" : process.argv[outIdx + 1];
  if (!outDir) throw new Error("Missing --out directory");
  return { outDir: path.resolve(outDir) };
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

/** Read a numeric KV field, falling back through a chain of blocks. */
function num(blocks, fallback, key, defaultValue) {
  for (const block of blocks) {
    const raw = block?.[key];
    if (raw !== undefined && raw !== "") {
      const value = Number(raw);
      if (Number.isFinite(value)) return value;
    }
  }
  if (fallback !== undefined) return fallback;
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`Missing numeric KV field ${key}`);
}

function requireBlock(blocks, name) {
  const block = blocks.get(name);
  if (!block) throw new Error(`Missing unit block ${name}`);
  return block;
}

/**
 * Shared combat shape used by every unit in the sim. `attackRate` is the base
 * attack time; the real interval is attackRate / (baseAttackSpeed / 100).
 */
function combatStats(chain) {
  return {
    health: num(chain, undefined, "StatusHealth"),
    healthRegen: num(chain, 0, "StatusHealthRegen"),
    armor: num(chain, 0, "ArmorPhysical"),
    damageMin: num(chain, undefined, "AttackDamageMin"),
    damageMax: num(chain, undefined, "AttackDamageMax"),
    attackRate: num(chain, 1, "AttackRate"),
    baseAttackSpeed: num(chain, 100, "BaseAttackSpeed"),
    attackPoint: num(chain, 0.5, "AttackAnimationPoint"),
    attackRange: num(chain, 100, "AttackRange"),
    acquisitionRange: num(chain, 500, "AttackAcquisitionRange"),
    projectileSpeed: num(chain, 0, "ProjectileSpeed"),
    moveSpeed: num(chain, 0, "MovementSpeed"),
    turnRate: num(chain, 0.5, "MovementTurnRate"),
    ringRadius: num(chain, 45, "RingRadius"),
    bountyGoldMin: num(chain, 0, "BountyGoldMin"),
    bountyGoldMax: num(chain, 0, "BountyGoldMax"),
    bountyXp: num(chain, 0, "BountyXP"),
  };
}

export async function bundleCreepData({ outDir } = {}) {
  const [unitsText, heroesText] = await Promise.all([
    fetchText(`${VPK_BASE}/npc_units.txt`),
    fetchText(`${VPK_BASE}/npc_heroes.txt`),
  ]);

  const unitBlocks = parseKvBlocks(unitsText);
  const heroBlocks = parseKvBlocks(heroesText);

  const creeps = {};
  for (const [key, unitName] of Object.entries(CREEP_UNITS)) {
    creeps[key] = {
      id: key,
      unitName,
      ...combatStats([requireBlock(unitBlocks, unitName)]),
    };
  }

  const tower = {
    id: "tower1",
    unitName: TOWER_UNIT,
    ...combatStats([requireBlock(unitBlocks, TOWER_UNIT)]),
  };

  // Hero blocks inherit anything they do not override from npc_dota_hero_base
  // (Anti-Mage, for one, has no MovementTurnRate of its own).
  const heroBase = requireBlock(heroBlocks, HERO_BASE_UNIT);
  const heroBlock = requireBlock(heroBlocks, HERO_UNIT);
  const heroChain = [heroBlock, heroBase];

  const hero = {
    id: "antimage",
    unitName: HERO_UNIT,
    name: "Anti-Mage",
    ...combatStats(heroChain),
    health: num(heroChain, 0, "StatusHealth"),
    baseStr: num(heroChain, 0, "AttributeBaseStrength"),
    baseAgi: num(heroChain, 0, "AttributeBaseAgility"),
    baseInt: num(heroChain, 0, "AttributeBaseIntelligence"),
  };

  const payload = {
    source: "spirit-bear-productions/dota_vpk_updates",
    bundledAt: new Date().toISOString(),
    creeps,
    tower,
    hero,
  };

  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "creeps.json"), JSON.stringify(payload, null, 2));
  }

  return payload;
}

async function main() {
  const { outDir } = parseArgs();
  const payload = await bundleCreepData({ outDir });
  console.log(
    `Bundled creep data → ${outDir}/creeps.json ` +
      `(melee ${payload.creeps.melee.health} HP / ${payload.creeps.melee.armor} armor, ` +
      `AM ${payload.hero.damageMin}-${payload.hero.damageMax} dmg)`
  );
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("bundle-creep-data.mjs")) {
  main().catch((error) => {
    console.error("bundle-creep-data FAILED:", error.message);
    process.exit(1);
  });
}
