/**
 * Deterministic lane simulation for the Last Hit Trainer.
 *
 * Pure logic — no DOM, no timers, no randomness beyond a seeded PRNG — so the
 * whole thing can be stepped and asserted on in Node (scripts/test-lasthit-sim.mjs).
 *
 * Scope is deliberately narrow: two creep waves fighting, two invulnerable
 * towers, and one level-1 Anti-Mage with no items. No hero levelling, no gold,
 * no creep upgrades, no flagbearer or siege creeps, and creeps never target the
 * hero. The only things being trained are last hit timing and denies.
 */
import {
  BACKSWING,
  DENY_THRESHOLD,
  DRILL_WAVES,
  FACING_TOLERANCE,
  KIND_HERO,
  KIND_MELEE,
  KIND_RANGED,
  KIND_TOWER,
  LANE_HALF_WIDTH,
  LANE_LENGTH,
  SEPARATION_SPACING,
  SEPARATION_STRENGTH,
  SPAWN_OFFSET,
  TEAM_DIRE,
  TEAM_RADIANT,
  TICK_SECONDS,
  TURN_IN_PLACE_THRESHOLD,
  TURN_TICK,
  WAVE_FORMATION,
  WAVE_INTERVAL,
} from "./constants.js";

/** Seeded PRNG so a given seed always replays identically. */
export function createRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Dota physical damage reduction. Positive armor reduces damage with
 * diminishing returns; negative armor amplifies it.
 */
export function armorMultiplier(armor) {
  return 1 - (0.06 * armor) / (1 + 0.06 * Math.abs(armor));
}

/** Seconds between attacks landing: base attack time scaled by attack speed. */
export function attackInterval(stats) {
  return stats.attackRate / (stats.baseAttackSpeed / 100);
}

/** Attack range is measured hull-to-hull, so both ring radii count. */
export function attackReach(attacker, target) {
  return attacker.stats.attackRange + attacker.stats.ringRadius + target.stats.ringRadius;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizeAngle(angle) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function enemyOf(team) {
  return team === TEAM_RADIANT ? TEAM_DIRE : TEAM_RADIANT;
}

/** Direction of travel for a team's creeps: Radiant walks toward +x. */
function marchDirection(team) {
  return team === TEAM_RADIANT ? 1 : -1;
}

function spawnX(team) {
  return team === TEAM_RADIANT ? -SPAWN_OFFSET : LANE_LENGTH + SPAWN_OFFSET;
}

function towerX(team) {
  return team === TEAM_RADIANT ? 0 : LANE_LENGTH;
}

function createUnit({ id, team, kind, stats, x, y, waveIndex = null, isPlayer = false }) {
  return {
    id,
    team,
    kind,
    stats,
    isPlayer,
    waveIndex,
    x,
    y,
    facing: marchDirection(team) > 0 ? 0 : Math.PI,
    hp: stats.health,
    maxHp: stats.health,
    alive: true,
    invulnerable: false,
    // Attack state machine: idle -> windup -> backswing -> idle.
    attackState: "idle",
    attackTimer: 0,
    attackCooldown: 0,
    targetId: null,
    order: null,
  };
}

/**
 * Build a fresh run.
 *
 * @param {object} data Bundled unit stats, in data/creeps.json shape.
 * @param {{mode?: "drill"|"endless", seed?: number}} options
 */
export function createSim(data, { mode = "drill", seed = 1 } = {}) {
  let nextId = 1;

  const state = {
    data,
    mode,
    seed,
    rng: createRng(seed),
    units: new Map(),
    projectiles: [],
    events: [],
    time: 0,
    phase: "running",
    wavesSpawned: 0,
    nextWaveAt: 0,
    totalWaves: mode === "drill" ? DRILL_WAVES : Infinity,
    score: {
      lastHits: 0,
      enemyDeaths: 0,
      denies: 0,
      allyDeaths: 0,
      lostToTower: 0,
      lostToCreeps: 0,
    },
    waveStats: [],
    allocId: () => nextId++,
  };

  for (const team of [TEAM_RADIANT, TEAM_DIRE]) {
    const tower = createUnit({
      id: state.allocId(),
      team,
      kind: KIND_TOWER,
      stats: data.tower,
      x: towerX(team),
      y: 0,
    });
    tower.invulnerable = true;
    state.units.set(tower.id, tower);
    state[team === TEAM_RADIANT ? "radiantTowerId" : "direTowerId"] = tower.id;
  }

  const hero = createUnit({
    id: state.allocId(),
    team: TEAM_RADIANT,
    kind: KIND_HERO,
    stats: data.hero,
    x: LANE_LENGTH / 2 - 700,
    y: 0,
    isPlayer: true,
  });
  hero.invulnerable = true; // creeps never aggro the hero in this drill
  state.units.set(hero.id, hero);
  state.heroId = hero.id;

  return state;
}

export function getHero(state) {
  return state.units.get(state.heroId);
}

export function livingUnits(state) {
  return [...state.units.values()].filter((u) => u.alive);
}

/** Creeps only — towers and the hero are excluded. */
export function livingCreeps(state) {
  return livingUnits(state).filter((u) => u.kind === KIND_MELEE || u.kind === KIND_RANGED);
}

/** An allied creep may only be denied once it drops below half health. */
export function isDeniable(unit) {
  if (!unit.alive || unit.team !== TEAM_RADIANT) return false;
  if (unit.kind !== KIND_MELEE && unit.kind !== KIND_RANGED) return false;
  return unit.hp / unit.maxHp < DENY_THRESHOLD;
}

/** Can the player legally issue an attack order on this unit right now? */
export function isPlayerAttackable(unit) {
  if (!unit.alive || unit.invulnerable) return false;
  if (unit.team === TEAM_DIRE) return unit.kind === KIND_MELEE || unit.kind === KIND_RANGED;
  return isDeniable(unit);
}

function spawnWave(state, team, waveIndex) {
  const dir = marchDirection(team);
  const originX = spawnX(team);
  for (const slot of WAVE_FORMATION) {
    const stats = state.data.creeps[slot.kind];
    const unit = createUnit({
      id: state.allocId(),
      team,
      kind: slot.kind,
      stats,
      x: originX + slot.dx * dir,
      y: slot.dy,
      waveIndex,
    });
    state.units.set(unit.id, unit);
  }
}

function pushWave(state) {
  const waveIndex = state.wavesSpawned + 1;
  spawnWave(state, TEAM_RADIANT, waveIndex);
  spawnWave(state, TEAM_DIRE, waveIndex);
  state.wavesSpawned = waveIndex;
  // Schedule off an absolute grid rather than "now + 30", so the 30s cadence
  // cannot drift as tick rounding accumulates over a long run.
  state.nextWaveAt = waveIndex * WAVE_INTERVAL;
  state.waveStats.push({ wave: waveIndex, lastHits: 0, enemyDeaths: 0, denies: 0, allyDeaths: 0 });
  state.events.push({ type: "wave", wave: waveIndex, time: state.time });
}

/**
 * Creep and tower target selection. Creeps hold their current target until it
 * dies or walks out of range, matching how lane creeps behave in game.
 */
function acquireTarget(state, unit) {
  const current = unit.targetId ? state.units.get(unit.targetId) : null;
  if (current?.alive && !current.invulnerable) {
    if (distance(unit, current) <= unit.stats.acquisitionRange + current.stats.ringRadius) {
      return current;
    }
  }

  const foe = enemyOf(unit.team);
  let best = null;
  let bestDist = Infinity;
  for (const other of state.units.values()) {
    if (!other.alive || other.team !== foe) continue;
    if (other.invulnerable) continue; // hero and towers are not creep targets here
    const dist = distance(unit, other);
    if (dist > unit.stats.acquisitionRange + other.stats.ringRadius) continue;
    if (dist < bestDist) {
      best = other;
      bestDist = dist;
    }
  }
  unit.targetId = best ? best.id : null;
  return best;
}

/** Turn toward an angle, returning the angular error still remaining. */
function turnToward(unit, targetAngle, dt) {
  const turnSpeed = unit.stats.turnRate / TURN_TICK;
  const delta = normalizeAngle(targetAngle - unit.facing);
  const step = turnSpeed * dt;
  if (Math.abs(delta) <= step) {
    unit.facing = normalizeAngle(targetAngle);
    return 0;
  }
  unit.facing = normalizeAngle(unit.facing + Math.sign(delta) * step);
  return Math.abs(delta) - step;
}

/** Returns true once the destination is reached. */
function moveToward(unit, x, y, dt) {
  const dx = x - unit.x;
  const dy = y - unit.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return true;

  const angle = Math.atan2(dy, dx);
  const remaining = turnToward(unit, angle, dt);
  // Sharp turns are taken on the spot, as they are in game.
  if (remaining > TURN_IN_PLACE_THRESHOLD) return false;

  const step = Math.min(unit.stats.moveSpeed * dt, dist);
  unit.x += Math.cos(unit.facing) * step;
  unit.y += Math.sin(unit.facing) * step;
  return false;
}

function cancelAttack(unit) {
  // A cancelled windup costs nothing: the attack cooldown only starts once the
  // attack point is reached, so switching targets mid-windup is free.
  unit.attackState = "idle";
  unit.attackTimer = 0;
}

function launchAttack(state, unit, target) {
  const spread = unit.stats.damageMax - unit.stats.damageMin + 1;
  const roll = unit.stats.damageMin + Math.floor(state.rng() * spread);

  if (unit.stats.projectileSpeed > 0) {
    state.projectiles.push({
      x: unit.x,
      y: unit.y,
      targetId: target.id,
      speed: unit.stats.projectileSpeed,
      damage: roll,
      sourceId: unit.id,
    });
    return;
  }
  applyDamage(state, target, roll, unit);
}

function applyDamage(state, target, raw, source) {
  if (!target.alive || target.invulnerable) return;
  target.hp -= raw * armorMultiplier(target.stats.armor);
  if (target.hp > 0) return;

  target.hp = 0;
  target.alive = false;
  recordKill(state, target, source);
}

function recordKill(state, victim, killer) {
  if (victim.kind !== KIND_MELEE && victim.kind !== KIND_RANGED) return;

  const byPlayer = Boolean(killer?.isPlayer);
  const wave = state.waveStats[victim.waveIndex - 1];
  const score = state.score;

  if (victim.team === TEAM_DIRE) {
    score.enemyDeaths += 1;
    if (wave) wave.enemyDeaths += 1;
    if (byPlayer) {
      score.lastHits += 1;
      if (wave) wave.lastHits += 1;
    } else if (killer?.kind === KIND_TOWER) {
      score.lostToTower += 1;
    } else {
      score.lostToCreeps += 1;
    }
  } else {
    score.allyDeaths += 1;
    if (wave) wave.allyDeaths += 1;
    if (byPlayer) {
      score.denies += 1;
      if (wave) wave.denies += 1;
    }
  }

  state.events.push({
    type: byPlayer ? (victim.team === TEAM_DIRE ? "lasthit" : "deny") : "miss",
    time: state.time,
    x: victim.x,
    y: victim.y,
    team: victim.team,
  });
}

/**
 * One attack cycle step. Damage lands at the attack point, and the cooldown
 * starts there too — so the backswing is dead time the player can cancel, and a
 * windup cancelled before the attack point costs nothing at all.
 */
function stepAttack(state, unit, target, dt) {
  if (unit.attackState === "windup") {
    if (!target?.alive) {
      cancelAttack(unit);
      return;
    }
    unit.attackTimer += dt;
    if (unit.attackTimer >= unit.stats.attackPoint) {
      launchAttack(state, unit, target);
      unit.attackCooldown = attackInterval(unit.stats);
      unit.attackState = "backswing";
      unit.attackTimer = 0;
    }
    return;
  }

  if (unit.attackState === "backswing") {
    unit.attackTimer += dt;
    if (unit.attackTimer >= (BACKSWING[unit.kind] ?? 0.5)) {
      unit.attackState = "idle";
      unit.attackTimer = 0;
    }
    return;
  }

  if (!target?.alive || unit.attackCooldown > 0) return;
  if (distance(unit, target) > attackReach(unit, target)) return;

  const angle = Math.atan2(target.y - unit.y, target.x - unit.x);
  if (turnToward(unit, angle, dt) > FACING_TOLERANCE) return;

  unit.attackState = "windup";
  unit.attackTimer = 0;
}

/** Creeps march at the enemy tower, stopping to fight whatever they meet. */
function stepCreep(state, unit, dt) {
  const target = acquireTarget(state, unit);
  const inRange = target && distance(unit, target) <= attackReach(unit, target);

  if (target && inRange) {
    stepAttack(state, unit, target, dt);
    return;
  }

  if (unit.attackState === "backswing") {
    stepAttack(state, unit, target, dt);
    return;
  }
  if (unit.attackState === "windup") cancelAttack(unit);

  if (target) {
    moveToward(unit, target.x, target.y, dt);
    return;
  }

  // Walk down the lane, but never past the enemy tower — that boundary is what
  // stops a winning wave from marching into the enemy spawn.
  const dir = marchDirection(unit.team);
  const limit = towerX(enemyOf(unit.team));
  const goalX = dir > 0 ? Math.min(unit.x + 400, limit) : Math.max(unit.x - 400, limit);
  moveToward(unit, goalX, unit.y * 0.9, dt);
}

function stepTower(state, unit, dt) {
  const target = acquireTarget(state, unit);
  if (!target && unit.attackState === "idle") return;
  stepAttack(state, unit, target, dt);
}

/**
 * The player hero. Orders come from input.js and are executed here, so every
 * gameplay rule stays in one testable place.
 */
function stepHero(state, unit, dt) {
  const order = unit.order;

  if (!order || order.type === "stop") {
    if (unit.attackState === "windup") cancelAttack(unit);
    // Let a backswing already in progress play out even with no order queued,
    // otherwise the hero stays stuck in the animation after its target dies.
    else if (unit.attackState === "backswing") stepAttack(state, unit, null, dt);
    return;
  }

  if (order.type === "move") {
    if (moveToward(unit, order.x, order.y, dt)) unit.order = null;
    return;
  }

  if (order.type === "attack") {
    const target = state.units.get(order.targetId);
    if (!target?.alive || !isPlayerAttackable(target)) {
      // Target died, or an ally regenerated back above the deny threshold.
      unit.order = null;
      unit.targetId = null;
      if (unit.attackState === "windup") cancelAttack(unit);
      return;
    }
    unit.targetId = target.id;
    if (distance(unit, target) > attackReach(unit, target)) {
      if (unit.attackState === "windup") cancelAttack(unit);
      moveToward(unit, target.x, target.y, dt);
      return;
    }
    stepAttack(state, unit, target, dt);
    return;
  }

  if (order.type === "attackMove") {
    // Attack-move only picks up enemies; it never auto-denies, same as in game.
    let best = null;
    let bestDist = Infinity;
    for (const other of state.units.values()) {
      if (!other.alive || other.team !== TEAM_DIRE || other.invulnerable) continue;
      const dist = distance(unit, other);
      if (dist > unit.stats.acquisitionRange) continue;
      if (dist < bestDist) {
        best = other;
        bestDist = dist;
      }
    }
    if (best) {
      unit.targetId = best.id;
      if (bestDist <= attackReach(unit, best)) {
        stepAttack(state, unit, best, dt);
        return;
      }
      moveToward(unit, best.x, best.y, dt);
      return;
    }
    if (moveToward(unit, order.x, order.y, dt)) unit.order = null;
  }
}

function stepProjectiles(state, dt) {
  const remaining = [];
  for (const shot of state.projectiles) {
    const target = state.units.get(shot.targetId);
    if (!target || !target.alive) continue; // fizzles if the target already died
    const dx = target.x - shot.x;
    const dy = target.y - shot.y;
    const dist = Math.hypot(dx, dy);
    const step = shot.speed * dt;
    if (dist <= step) {
      applyDamage(state, target, shot.damage, state.units.get(shot.sourceId));
      continue;
    }
    shot.x += (dx / dist) * step;
    shot.y += (dy / dist) * step;
    remaining.push(shot);
  }
  state.projectiles = remaining;
}

/** Keep creeps from occupying the same point without a real physics pass. */
function separate(state, dt) {
  const creeps = livingCreeps(state);
  for (let i = 0; i < creeps.length; i += 1) {
    for (let j = i + 1; j < creeps.length; j += 1) {
      const a = creeps[i];
      const b = creeps[j];
      const minDist = (a.stats.ringRadius + b.stats.ringRadius) * SEPARATION_SPACING;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= minDist || dist === 0) continue;
      const push = ((minDist - dist) / minDist) * SEPARATION_STRENGTH * dt;
      const nx = dx / dist;
      const ny = dy / dist;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
    }
  }
  for (const creep of creeps) {
    creep.y = Math.max(-LANE_HALF_WIDTH, Math.min(LANE_HALF_WIDTH, creep.y));
  }
}

function regen(state, dt) {
  for (const unit of state.units.values()) {
    if (!unit.alive || unit.hp >= unit.maxHp) continue;
    unit.hp = Math.min(unit.maxHp, unit.hp + unit.stats.healthRegen * dt);
  }
}

function pruneDead(state) {
  for (const [id, unit] of state.units) {
    if (!unit.alive && unit.kind !== KIND_TOWER && unit.kind !== KIND_HERO) {
      state.units.delete(id);
    }
  }
}

/**
 * A drill is only scored once the final wave's enemy creeps are all dead, so a
 * run never ends mid-fight with last hits still on the table.
 */
function checkCompletion(state) {
  if (state.mode !== "drill") return;
  if (state.wavesSpawned < state.totalWaves) return;
  if (livingCreeps(state).some((c) => c.team === TEAM_DIRE)) return;
  state.phase = "finished";
  state.events.push({ type: "finished", time: state.time });
}

/** Advance the simulation by exactly one fixed tick. */
export function step(state, dt = TICK_SECONDS) {
  if (state.phase !== "running") return state;

  state.time += dt;

  if (state.wavesSpawned < state.totalWaves && state.time >= state.nextWaveAt) {
    pushWave(state);
  }

  for (const unit of state.units.values()) {
    if (!unit.alive) continue;
    if (unit.attackCooldown > 0) unit.attackCooldown = Math.max(0, unit.attackCooldown - dt);
  }

  for (const unit of state.units.values()) {
    if (!unit.alive) continue;
    if (unit.kind === KIND_TOWER) stepTower(state, unit, dt);
    else if (unit.isPlayer) stepHero(state, unit, dt);
    else stepCreep(state, unit, dt);
  }

  stepProjectiles(state, dt);
  separate(state, dt);
  regen(state, dt);
  pruneDead(state);
  checkCompletion(state);

  return state;
}

/**
 * Issue a player order. Mirrors Dota: ordering an attack on an ally that is not
 * yet deniable is refused and becomes a move toward it instead.
 */
export function issueOrder(state, order) {
  const hero = getHero(state);
  if (!hero || state.phase !== "running") return;

  if (order.type === "stop") {
    // Cancels the windup and the backswing alike.
    hero.order = null;
    hero.targetId = null;
    hero.attackState = "idle";
    hero.attackTimer = 0;
    return;
  }

  if (order.type === "attack") {
    const target = state.units.get(order.targetId);
    if (!target?.alive) return;
    if (!isPlayerAttackable(target)) {
      if (hero.attackState !== "idle") cancelAttack(hero);
      hero.order = { type: "move", x: target.x, y: target.y };
      return;
    }
  }

  // Any new order cancels an in-progress swing, windup or backswing alike.
  if (hero.attackState !== "idle") cancelAttack(hero);
  hero.order = order;
}

/** Final scorecard for a finished or stopped run. */
export function summarize(state) {
  const { score } = state;
  return {
    mode: state.mode,
    seed: state.seed,
    durationSeconds: Math.round(state.time),
    waves: state.wavesSpawned,
    lastHits: score.lastHits,
    lastHitsPossible: score.enemyDeaths,
    lastHitPct: score.enemyDeaths ? (score.lastHits / score.enemyDeaths) * 100 : 0,
    denies: score.denies,
    deniesPossible: score.allyDeaths,
    denyPct: score.allyDeaths ? (score.denies / score.allyDeaths) * 100 : 0,
    lostToTower: score.lostToTower,
    lostToCreeps: score.lostToCreeps,
    waveStats: state.waveStats.map((w) => ({ ...w })),
  };
}
