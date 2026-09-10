/**
 * Tests for the Last Hit Trainer simulation.
 *
 * The sim is deliberately DOM-free and seeded, so the damage curve, attack
 * cycle, deny gate and scoring rules can all be asserted headlessly here.
 */
import {
  armorMultiplier,
  attackInterval,
  attackReach,
  createRng,
  createSim,
  getHero,
  isDeniable,
  isPlayerAttackable,
  issueOrder,
  livingCreeps,
  step,
  summarize,
} from "../js/lasthit/sim.js";
import {
  DRILL_WAVES,
  FALLBACK_DATA,
  TEAM_DIRE,
  TEAM_RADIANT,
  TICK_SECONDS,
  WAVE_FORMATION,
  WAVE_INTERVAL,
} from "../js/lasthit/constants.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function near(actual, expected, tolerance, label) {
  assert(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ~${expected} (±${tolerance}), got ${actual}`
  );
}

function runTicks(state, seconds) {
  const ticks = Math.round(seconds / TICK_SECONDS);
  for (let i = 0; i < ticks; i += 1) step(state);
}

// ---------------------------------------------------------------------------
// Damage curve
// ---------------------------------------------------------------------------

// Melee creeps carry 2 armor: 0.12 / 1.12 = 10.71% reduction.
near(armorMultiplier(2), 0.892857, 0.0001, "armor 2 multiplier");
// Ranged creeps have no armor at all.
assert(armorMultiplier(0) === 1, "armor 0 must not change damage");
// T1 towers sit at 12 armor, matching the existing tower-damage module.
near(armorMultiplier(12), 0.5814, 0.001, "armor 12 multiplier");
// Negative armor amplifies rather than reduces.
assert(armorMultiplier(-5) > 1, "negative armor should amplify damage");

// Anti-Mage's 29-33 becomes ~25.9-29.5 against a melee creep's 2 armor, which
// is the number that actually decides whether a last hit lands.
near(29 * armorMultiplier(2), 25.9, 0.1, "AM min damage vs melee creep");
near(33 * armorMultiplier(2), 29.5, 0.1, "AM max damage vs melee creep");

// ---------------------------------------------------------------------------
// Attack timing
// ---------------------------------------------------------------------------

// Level 1 Anti-Mage has no attack speed bonuses, so the interval is just BAT.
near(attackInterval(FALLBACK_DATA.hero), 1.4, 0.0001, "AM attack interval");
// Towers run 0.9 BAT at 110 base attack speed.
near(attackInterval(FALLBACK_DATA.tower), 0.8182, 0.001, "tower attack interval");
near(attackInterval(FALLBACK_DATA.creeps.melee), 1.0, 0.0001, "melee creep interval");

// Attack range is measured hull to hull.
{
  const state = createSim(FALLBACK_DATA, { seed: 1 });
  const hero = getHero(state);
  runTicks(state, 1);
  const creep = livingCreeps(state)[0];
  if (creep) {
    // 150 attack range + 70 hero ring + 45 creep ring.
    near(attackReach(hero, creep), 265, 0.001, "AM reach vs creep");
  }
}

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

{
  const a = createRng(42);
  const b = createRng(42);
  const c = createRng(43);
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  assert(seqA.every((v, i) => v === seqB[i]), "same seed must replay identically");
  assert(seqA[0] !== c(), "different seeds should diverge");
  assert(seqA.every((v) => v >= 0 && v < 1), "rng must stay in [0,1)");
}

{
  const runIdle = (seed) => {
    const state = createSim(FALLBACK_DATA, { mode: "drill", seed });
    let ticks = 0;
    while (state.phase === "running" && ticks < 60 * 900) {
      step(state);
      ticks += 1;
    }
    return summarize(state);
  };
  const first = runIdle(11);
  const second = runIdle(11);
  assert(
    JSON.stringify(first) === JSON.stringify(second),
    "identical seeds must produce identical drills"
  );
}

// ---------------------------------------------------------------------------
// Wave spawning
// ---------------------------------------------------------------------------

{
  const state = createSim(FALLBACK_DATA, { mode: "drill", seed: 3 });
  step(state);
  assert(state.wavesSpawned === 1, "first wave spawns immediately");

  const creeps = livingCreeps(state);
  assert(
    creeps.length === WAVE_FORMATION.length * 2,
    `wave 1 should be ${WAVE_FORMATION.length} creeps per side, got ${creeps.length} total`
  );

  const radiant = creeps.filter((c) => c.team === TEAM_RADIANT);
  assert(radiant.filter((c) => c.kind === "melee").length === 3, "3 melee per wave");
  assert(radiant.filter((c) => c.kind === "ranged").length === 1, "1 ranged per wave");
  // Flagbearer and siege creeps are deliberately excluded from this trainer.
  assert(
    radiant.every((c) => c.kind === "melee" || c.kind === "ranged"),
    "no flagbearer or siege creeps should ever spawn"
  );

  runTicks(state, WAVE_INTERVAL);
  assert(state.wavesSpawned === 2, `wave 2 should spawn at ${WAVE_INTERVAL}s`);
}

// ---------------------------------------------------------------------------
// Deny gate
// ---------------------------------------------------------------------------

{
  const state = createSim(FALLBACK_DATA, { seed: 5 });
  step(state);
  const ally = livingCreeps(state).find((c) => c.team === TEAM_RADIANT);
  const enemy = livingCreeps(state).find((c) => c.team === TEAM_DIRE);

  assert(!isDeniable(ally), "a full health ally creep is not deniable");
  assert(!isPlayerAttackable(ally), "the player cannot attack a healthy ally");
  assert(isPlayerAttackable(enemy), "the player can always attack enemy creeps");

  ally.hp = ally.maxHp * 0.5;
  assert(!isDeniable(ally), "exactly 50% health is not yet deniable");

  ally.hp = ally.maxHp * 0.49;
  assert(isDeniable(ally), "below 50% health an ally becomes deniable");
  assert(isPlayerAttackable(ally), "a deniable ally is a legal attack target");

  // Towers are invulnerable scenery in this drill.
  const tower = state.units.get(state.direTowerId);
  assert(!isPlayerAttackable(tower), "towers cannot be attacked");
}

// ---------------------------------------------------------------------------
// Order handling: attacking a non-deniable ally is refused, as in game
// ---------------------------------------------------------------------------

{
  const state = createSim(FALLBACK_DATA, { seed: 6 });
  step(state);
  const hero = getHero(state);
  const ally = livingCreeps(state).find((c) => c.team === TEAM_RADIANT);

  issueOrder(state, { type: "attack", targetId: ally.id });
  assert(hero.order?.type === "move", "attacking a healthy ally becomes a move order");

  ally.hp = ally.maxHp * 0.4;
  issueOrder(state, { type: "attack", targetId: ally.id });
  assert(hero.order?.type === "attack", "a deniable ally accepts an attack order");
}

// ---------------------------------------------------------------------------
// The attack cycle: windup, damage at the attack point, cancellable backswing
// ---------------------------------------------------------------------------

{
  const state = createSim(FALLBACK_DATA, { seed: 9 });
  step(state);
  const hero = getHero(state);
  const enemy = livingCreeps(state).find((c) => c.team === TEAM_DIRE);

  // Park the hero on top of the creep so range and turning are not a factor.
  hero.x = enemy.x - 100;
  hero.y = enemy.y;
  hero.facing = 0;
  const startHp = enemy.hp;

  issueOrder(state, { type: "attack", targetId: enemy.id });

  // Half way through the 0.3s attack point, nothing has landed yet.
  runTicks(state, 0.15);
  assert(hero.attackState === "windup", "hero should be winding up");
  assert(enemy.hp === startHp, "no damage before the attack point");

  // Cancelling mid-windup wastes the swing but costs no cooldown, which is what
  // makes switching targets mid-windup free.
  issueOrder(state, { type: "stop" });
  assert(hero.attackState === "idle", "stop cancels the windup");
  assert(enemy.hp === startHp, "a cancelled windup deals no damage");
  assert(hero.attackCooldown === 0, "a cancelled windup consumes no cooldown");

  // Let a full swing land this time, sampling health on the exact impact tick
  // so creep regeneration cannot smear the measurement.
  const orderTime = state.time;
  issueOrder(state, { type: "attack", targetId: enemy.id });
  let hpAtImpact = null;
  let impactTime = null;
  for (let i = 0; i < Math.round(0.35 / TICK_SECONDS); i += 1) {
    const before = enemy.hp;
    step(state);
    if (hpAtImpact === null && enemy.hp < before) {
      hpAtImpact = enemy.hp;
      impactTime = state.time;
    }
  }

  assert(hpAtImpact !== null, "damage lands once the attack point is reached");
  assert(hero.attackState === "backswing", "the hero enters backswing after landing");
  // The 0.3s attack point is what the player is really timing.
  near(impactTime - orderTime, 0.3, 0.04, "impact lands one attack point after the order");
  near(hero.attackCooldown, 1.4 - 0.05, 0.1, "cooldown starts at the attack point");

  // Damage is a roll inside the armor-adjusted range, never a fixed number.
  const dealt = startHp - hpAtImpact;
  const mult = armorMultiplier(enemy.stats.armor);
  assert(
    dealt >= 29 * mult - 0.01 && dealt <= 33 * mult + 0.01,
    `damage ${dealt} should sit inside AM's armor-adjusted ${29 * mult}-${33 * mult} range`
  );
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

{
  // A player who never acts scores zero, and every creep death still counts
  // toward the denominator.
  const state = createSim(FALLBACK_DATA, { mode: "drill", seed: 7 });
  let ticks = 0;
  while (state.phase === "running" && ticks < 60 * 900) {
    step(state);
    ticks += 1;
  }
  const result = summarize(state);

  assert(state.phase === "finished", "an unattended drill should still terminate");
  assert(result.waves === DRILL_WAVES, `expected ${DRILL_WAVES} waves, got ${result.waves}`);
  assert(
    result.lastHitsPossible === DRILL_WAVES * WAVE_FORMATION.length,
    `every enemy creep should die: expected ${DRILL_WAVES * WAVE_FORMATION.length}, got ${result.lastHitsPossible}`
  );
  assert(result.lastHits === 0, "an idle player takes no last hits");
  assert(result.denies === 0, "an idle player takes no denies");
  assert(result.lastHitPct === 0 && result.denyPct === 0, "idle percentages are zero");
  assert(
    result.lostToTower + result.lostToCreeps === result.lastHitsPossible,
    "every missed enemy creep is attributed to a tower or to creeps"
  );
  // The run is only scored once the last enemy creep is dead, so it must run
  // past the final wave spawn.
  assert(
    result.durationSeconds > (DRILL_WAVES - 1) * WAVE_INTERVAL,
    "the drill must not end before the final wave has been fought out"
  );
  assert(
    livingCreeps(state).every((c) => c.team === TEAM_RADIANT),
    "no enemy creeps may remain alive when a drill is scored"
  );
}

{
  // Player kills are credited as last hits and denies respectively.
  const state = createSim(FALLBACK_DATA, { seed: 13 });
  step(state);
  const hero = getHero(state);
  const enemy = livingCreeps(state).find((c) => c.team === TEAM_DIRE);
  const ally = livingCreeps(state).find((c) => c.team === TEAM_RADIANT);

  hero.x = enemy.x - 100;
  hero.y = enemy.y;
  enemy.hp = 5;
  issueOrder(state, { type: "attack", targetId: enemy.id });
  runTicks(state, 0.5);
  assert(state.score.lastHits === 1, "killing an enemy creep scores a last hit");
  assert(state.score.enemyDeaths === 1, "the enemy death is counted");

  // Step in front of the creep and clear the cooldown left by the last hit
  // above: Anti-Mage moves at 315 to a creep's 325, so a hero chasing a healthy
  // creep from behind genuinely cannot catch it, and never gets to swing.
  hero.x = ally.x + 100;
  hero.y = ally.y;
  hero.attackCooldown = 0;
  ally.hp = 5;
  issueOrder(state, { type: "attack", targetId: ally.id });
  runTicks(state, 2.0);
  assert(state.score.denies === 1, "killing a low ally creep scores a deny");
  assert(state.score.allyDeaths === 1, "the ally death is counted");
}

{
  // Endless mode never self-terminates and keeps spawning waves.
  const state = createSim(FALLBACK_DATA, { mode: "endless", seed: 2 });
  runTicks(state, WAVE_INTERVAL * (DRILL_WAVES + 2));
  assert(state.phase === "running", "endless mode does not finish on its own");
  assert(
    state.wavesSpawned > DRILL_WAVES,
    `endless mode keeps spawning past ${DRILL_WAVES} waves, got ${state.wavesSpawned}`
  );
}

{
  // Towers stop a winning wave rather than letting it march into the spawn.
  const state = createSim(FALLBACK_DATA, { mode: "endless", seed: 4 });
  step(state);
  // Wipe the Dire wave so the Radiant creeps push completely uncontested.
  for (const creep of livingCreeps(state)) {
    if (creep.team === TEAM_DIRE) creep.alive = false;
  }
  runTicks(state, 25);
  const direTower = state.units.get(state.direTowerId);
  const pushers = livingCreeps(state).filter((c) => c.team === TEAM_RADIANT);
  assert(
    pushers.every((c) => c.x <= direTower.x + 1),
    "creeps must never walk past the enemy tower toward the spawn"
  );
  assert(direTower.hp === direTower.maxHp, "towers are invulnerable in this drill");
}

// ---------------------------------------------------------------------------
// Playability: a scripted bot must be able to actually take last hits
// ---------------------------------------------------------------------------

{
  // This guards what unit tests usually miss: that the numbers combine into a
  // game a person can actually play. If creeps never dropped into a reachable
  // kill window, or the hero could never close the distance in time, this would
  // collapse to nearly zero.
  //
  // The bot is deliberately naive — it waits until a kill is already guaranteed
  // and never anticipates incoming creep damage — so its score is a floor, not
  // a target. Across seeds it lands roughly 13-18 of 40, which leaves the
  // headroom toward 100% that the drill is meant to train.
  const state = createSim(FALLBACK_DATA, { mode: "drill", seed: 21 });
  const hero = getHero(state);

  const guaranteedKill = (target) =>
    target.hp <= FALLBACK_DATA.hero.damageMin * armorMultiplier(target.stats.armor);

  let ticks = 0;
  while (state.phase === "running" && ticks < 60 * 900) {
    const creeps = livingCreeps(state);
    const enemies = creeps.filter((c) => c.team === TEAM_DIRE);

    if (enemies.length) {
      const killable = creeps
        .filter((c) => isPlayerAttackable(c) && guaranteedKill(c))
        // Enemy creeps first (last hits), then whichever is closest to dying.
        .sort((a, b) => {
          const rank = (u) => (u.team === TEAM_DIRE ? 0 : 1);
          return rank(a) - rank(b) || a.hp - b.hp;
        });

      if (killable.length) {
        const target = killable[0];
        if (hero.order?.type !== "attack" || hero.order.targetId !== target.id) {
          issueOrder(state, { type: "attack", targetId: target.id });
        }
      } else if (hero.attackState === "idle") {
        // Loiter beside the weakest enemy creep, ready to pounce.
        const focus = [...enemies].sort((a, b) => a.hp - b.hp)[0];
        issueOrder(state, { type: "move", x: focus.x, y: focus.y });
      }
    }

    step(state);
    ticks += 1;
  }

  const result = summarize(state);
  assert(
    result.lastHits >= 8,
    `a bot sniping guaranteed kills should land real last hits, got ${result.lastHits}/${result.lastHitsPossible}`
  );
  assert(
    result.denies >= 4,
    `the same bot should also pick up denies, got ${result.denies}/${result.deniesPossible}`
  );
  // 100% must remain hard: a bot with no anticipation should be nowhere near it.
  assert(
    result.lastHits < result.lastHitsPossible,
    "a naive bot should not be able to score a perfect run"
  );
  assert(
    result.lastHits <= result.lastHitsPossible,
    "last hits can never exceed the number of enemy creeps that died"
  );
  assert(
    result.denies <= result.deniesPossible,
    "denies can never exceed the number of allied creeps that died"
  );
}

console.log("test-lasthit-sim: all assertions passed");
