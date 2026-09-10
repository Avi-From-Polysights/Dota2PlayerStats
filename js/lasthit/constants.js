/**
 * Static tuning for the Last Hit Trainer, plus the fallback stat table.
 *
 * Unit stats normally come from data/creeps.json (bundled from the live Dota
 * VPK at deploy time by scripts/bundle-creep-data.mjs). The FALLBACK_DATA below
 * mirrors that file so the trainer still runs on a bare local checkout with no
 * bundled data — it is a safety net, not the source of truth.
 */

/** Radiant is always the player's team. */
export const TEAM_RADIANT = "radiant";
export const TEAM_DIRE = "dire";

export const KIND_MELEE = "melee";
export const KIND_RANGED = "ranged";
export const KIND_HERO = "hero";
export const KIND_TOWER = "tower";

/** Fixed logic step. Rendering interpolates; the sim never varies with framerate. */
export const TICK_SECONDS = 1 / 60;

/** Distance between the two tier-1 towers, in Dota world units. */
export const LANE_LENGTH = 7200;
/** How far behind its own tower a wave spawns. */
export const SPAWN_OFFSET = 1300;
/** Half-width of the walkable lane corridor. */
export const LANE_HALF_WIDTH = 320;

export const WAVE_INTERVAL = 30;
export const DRILL_WAVES = 10;

/** A creep wave: three melee in front, one ranged behind. No flagbearer, no siege. */
export const WAVE_FORMATION = [
  { kind: KIND_MELEE, dx: 0, dy: -95 },
  { kind: KIND_MELEE, dx: -70, dy: 0 },
  { kind: KIND_MELEE, dx: 0, dy: 95 },
  { kind: KIND_RANGED, dx: -260, dy: 0 },
];

/** Allied units become deniable below this fraction of max health. */
export const DENY_THRESHOLD = 0.5;

/**
 * Attack backswing, in seconds. Not present in npc_units.txt (it is baked into
 * the model animations), so these are the community-measured values. Cancelling
 * the backswing with a move or stop order is the point of modelling it at all.
 */
export const BACKSWING = {
  [KIND_HERO]: 0.54,
  [KIND_MELEE]: 0.5,
  [KIND_RANGED]: 0.5,
  [KIND_TOWER]: 0.4,
};

/**
 * A unit must be facing within this many radians of its target before the
 * attack windup may begin. Dota uses a comparable tolerance.
 */
export const FACING_TOLERANCE = 0.2;

/** Above this angular error a unit turns on the spot instead of walking. */
export const TURN_IN_PLACE_THRESHOLD = 1.0;

/**
 * Dota turn rates are expressed per 30ms tick, so radians/second is
 * turnRate / 0.03. Anti-Mage's 0.6 gives 20 rad/s — a 180 degree turn in ~0.16s.
 */
export const TURN_TICK = 0.03;

/**
 * Creeps push apart at this rate when they crowd, so a wave stays a readable
 * row of clickable targets instead of one overlapping pile.
 */
export const SEPARATION_STRENGTH = 900;

/**
 * Creeps keep this multiple of their combined hull radii apart. Above 1 it
 * leaves visible daylight between units, which is what makes each one
 * separately clickable and its health bar readable.
 */
export const SEPARATION_SPACING = 1.7;

export const FALLBACK_DATA = {
  source: "fallback",
  creeps: {
    melee: {
      id: "melee",
      unitName: "npc_dota_creep_goodguys_melee",
      health: 550,
      healthRegen: 0.5,
      armor: 2,
      damageMin: 19,
      damageMax: 23,
      attackRate: 1,
      baseAttackSpeed: 100,
      attackPoint: 0.467,
      attackRange: 100,
      acquisitionRange: 500,
      projectileSpeed: 0,
      moveSpeed: 325,
      turnRate: 0.5,
      ringRadius: 45,
      bountyGoldMin: 34,
      bountyGoldMax: 39,
      bountyXp: 57,
    },
    ranged: {
      id: "ranged",
      unitName: "npc_dota_creep_goodguys_ranged",
      health: 300,
      healthRegen: 2,
      armor: 0,
      damageMin: 21,
      damageMax: 26,
      attackRate: 1,
      baseAttackSpeed: 100,
      attackPoint: 0.5,
      attackRange: 500,
      acquisitionRange: 600,
      projectileSpeed: 900,
      moveSpeed: 325,
      turnRate: 0.5,
      ringRadius: 45,
      bountyGoldMin: 43,
      bountyGoldMax: 52,
      bountyXp: 69,
    },
  },
  tower: {
    id: "tower1",
    unitName: "npc_dota_goodguys_tower1_mid",
    health: 1800,
    healthRegen: 0,
    armor: 12,
    damageMin: 88,
    damageMax: 92,
    attackRate: 0.9,
    baseAttackSpeed: 110,
    attackPoint: 0.6,
    attackRange: 700,
    acquisitionRange: 700,
    projectileSpeed: 750,
    moveSpeed: 0,
    turnRate: 1,
    ringRadius: 130,
    bountyGoldMin: 0,
    bountyGoldMax: 0,
    bountyXp: 0,
  },
  hero: {
    id: "antimage",
    unitName: "npc_dota_hero_antimage",
    name: "Anti-Mage",
    health: 120,
    healthRegen: 1.5,
    armor: 2,
    damageMin: 29,
    damageMax: 33,
    attackRate: 1.4,
    baseAttackSpeed: 100,
    attackPoint: 0.3,
    attackRange: 150,
    acquisitionRange: 600,
    projectileSpeed: 0,
    moveSpeed: 315,
    turnRate: 0.6,
    ringRadius: 70,
    bountyGoldMin: 0,
    bountyGoldMax: 0,
    bountyXp: 62,
    baseStr: 21,
    baseAgi: 25,
    baseInt: 12,
  },
};
