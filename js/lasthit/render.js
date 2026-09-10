/**
 * Canvas renderer for the Last Hit Trainer.
 *
 * Abstract top-down: geometric units, health bars, a Dota-style follow camera.
 * Deliberately shows nothing predictive — no kill-range highlighting, no damage
 * numbers, no deny threshold marker — because working the health bar out for
 * yourself is the skill being drilled.
 */
import {
  KIND_HERO,
  KIND_MELEE,
  KIND_RANGED,
  KIND_TOWER,
  LANE_HALF_WIDTH,
  LANE_LENGTH,
  SPAWN_OFFSET,
  TEAM_RADIANT,
} from "./constants.js";
import { attackReach } from "./sim.js";

const COLORS = {
  ground: "#101512",
  laneFill: "#191f1c",
  laneEdge: "rgba(255, 255, 255, 0.10)",
  radiant: "#42d68c",
  dire: "#ff6467",
  hero: "#7cf0b4",
  heroRing: "rgba(124, 240, 180, 0.28)",
  hpBack: "rgba(0, 0, 0, 0.65)",
  text: "#e8e8e8",
  muted: "#7d7d7d",
  projectile: "#ffd479",
};

/**
 * World units visible across the canvas width. Close enough that individual
 * creeps stay comfortably clickable and their health bars readable.
 */
const VIEW_WIDTH = 1900;

/** Short-lived score popups, in world space. */
const FLASH_DURATION = 0.9;

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  let flashes = [];
  let camX = LANE_LENGTH / 2;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    return { width, height, dpr };
  }

  /** Consume sim events into transient on-screen feedback. */
  function ingestEvents(state) {
    for (const event of state.events) {
      if (event.type === "lasthit" || event.type === "deny") {
        flashes.push({
          x: event.x,
          y: event.y,
          text: event.type === "lasthit" ? "LAST HIT" : "DENY",
          color: event.type === "lasthit" ? COLORS.radiant : COLORS.dire,
          age: 0,
        });
      }
    }
    state.events.length = 0;
  }

  function stepFlashes(dt) {
    for (const flash of flashes) flash.age += dt;
    flashes = flashes.filter((f) => f.age < FLASH_DURATION);
  }

  function draw(state, dt = 0) {
    const { width, height, dpr } = resize();
    ingestEvents(state);
    stepFlashes(dt);

    const scale = width / VIEW_WIDTH;
    const hero = state.units.get(state.heroId);

    // Follow camera, clamped so the view never drifts past the spawn points.
    const halfView = VIEW_WIDTH / 2;
    const minX = -SPAWN_OFFSET - 200 + halfView;
    const maxX = LANE_LENGTH + SPAWN_OFFSET + 200 - halfView;
    const desired = hero ? hero.x : LANE_LENGTH / 2;
    camX = Math.max(Math.min(minX, maxX), Math.min(Math.max(minX, maxX), desired));

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0, 0, width, height);

    // World -> screen
    ctx.translate(width / 2, height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-camX, 0);

    drawLane(ctx);
    for (const unit of state.units.values()) {
      if (!unit.alive) continue;
      if (unit.kind === KIND_TOWER) drawTower(ctx, unit);
    }
    for (const shot of state.projectiles) drawProjectile(ctx, shot);
    for (const unit of state.units.values()) {
      if (!unit.alive || unit.kind === KIND_TOWER) continue;
      if (unit.kind === KIND_HERO) drawHero(ctx, unit, state);
      else drawCreep(ctx, unit);
    }
    drawFlashes(ctx);

    ctx.restore();
  }

  function drawLane(context) {
    const left = -SPAWN_OFFSET - 400;
    const right = LANE_LENGTH + SPAWN_OFFSET + 400;
    const top = -LANE_HALF_WIDTH - 90;
    const bottom = LANE_HALF_WIDTH + 90;

    context.fillStyle = COLORS.laneFill;
    context.fillRect(left, top, right - left, bottom - top);

    context.strokeStyle = COLORS.laneEdge;
    context.lineWidth = 6;
    context.beginPath();
    context.moveTo(left, top);
    context.lineTo(right, top);
    context.moveTo(left, bottom);
    context.lineTo(right, bottom);
    context.stroke();
  }

  function drawTower(context, tower) {
    const team = tower.team === TEAM_RADIANT;
    const color = team ? COLORS.radiant : COLORS.dire;
    const size = tower.stats.ringRadius;

    // Faint attack-range circle: this is the tower's reach, not a hint about
    // any particular creep.
    context.strokeStyle = team ? "rgba(66, 214, 140, 0.10)" : "rgba(255, 100, 103, 0.10)";
    context.lineWidth = 5;
    context.beginPath();
    context.arc(tower.x, tower.y, tower.stats.attackRange, 0, Math.PI * 2);
    context.stroke();

    context.fillStyle = color;
    context.globalAlpha = 0.85;
    context.fillRect(tower.x - size, tower.y - size, size * 2, size * 2);
    context.globalAlpha = 1;

    context.fillStyle = COLORS.ground;
    context.fillRect(tower.x - size * 0.4, tower.y - size * 0.4, size * 0.8, size * 0.8);
  }

  function drawCreep(context, creep) {
    const color = creep.team === TEAM_RADIANT ? COLORS.radiant : COLORS.dire;
    const r = creep.stats.ringRadius;

    context.fillStyle = color;
    context.strokeStyle = "rgba(0, 0, 0, 0.55)";
    context.lineWidth = 5;
    if (creep.kind === KIND_MELEE) {
      context.beginPath();
      context.arc(creep.x, creep.y, r, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    } else if (creep.kind === KIND_RANGED) {
      // Ranged creeps read as diamonds so they are obvious at a glance — they
      // have less health and far more regen, so they need different timing.
      context.beginPath();
      context.moveTo(creep.x, creep.y - r);
      context.lineTo(creep.x + r, creep.y);
      context.lineTo(creep.x, creep.y + r);
      context.lineTo(creep.x - r, creep.y);
      context.closePath();
      context.fill();
      context.stroke();
    }

    drawSwing(context, creep, color);
    drawHealthBar(context, creep);
  }

  /**
   * A visible swing arc during the windup and backswing. This is the unit's
   * attack animation, the same information the real game gives you — not a
   * timing readout.
   */
  function drawSwing(context, unit, color) {
    if (unit.attackState === "idle") return;
    const r = unit.stats.ringRadius;
    const progress =
      unit.attackState === "windup"
        ? Math.min(1, unit.attackTimer / unit.stats.attackPoint)
        : 1;
    const sweep = (Math.PI / 2) * (unit.attackState === "windup" ? progress : 1 - progress * 0.2);

    context.strokeStyle = color;
    context.globalAlpha = unit.attackState === "windup" ? 0.9 : 0.35;
    context.lineWidth = 7;
    context.beginPath();
    context.arc(unit.x, unit.y, r + 16, unit.facing - sweep / 2, unit.facing + sweep / 2);
    context.stroke();
    context.globalAlpha = 1;
  }

  function drawHealthBar(context, unit) {
    const r = unit.stats.ringRadius;
    const barWidth = r * 1.9;
    const barHeight = 10;
    const x = unit.x - barWidth / 2;
    const y = unit.y - r - 40;
    const pct = Math.max(0, Math.min(1, unit.hp / unit.maxHp));

    context.fillStyle = COLORS.hpBack;
    context.fillRect(x - 2, y - 2, barWidth + 4, barHeight + 4);

    context.fillStyle = unit.team === TEAM_RADIANT ? COLORS.radiant : COLORS.dire;
    context.fillRect(x, y, barWidth * pct, barHeight);

    context.fillStyle = COLORS.text;
    context.font = "600 19px Inter, system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "bottom";
    // A dark rim keeps the number readable over a crowded creep pile.
    context.lineWidth = 4;
    context.strokeStyle = "rgba(0, 0, 0, 0.85)";
    context.strokeText(String(Math.ceil(unit.hp)), unit.x, y - 5);
    context.fillText(String(Math.ceil(unit.hp)), unit.x, y - 5);
  }

  function drawHero(context, hero, state) {
    const r = hero.stats.ringRadius;

    // The hero's own attack reach against a standard creep hull. This is the
    // hero's range, fixed and knowable, not a per-creep hint.
    const sample = { stats: { ringRadius: 45 } };
    context.strokeStyle = COLORS.heroRing;
    context.lineWidth = 4;
    context.setLineDash([18, 14]);
    context.beginPath();
    context.arc(hero.x, hero.y, attackReach(hero, sample), 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);

    // A dark moat plus a white rim lifts the hero out of the creep pile.
    context.fillStyle = "rgba(0, 0, 0, 0.55)";
    context.beginPath();
    context.arc(hero.x, hero.y, r * 0.95, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = COLORS.hero;
    context.beginPath();
    context.arc(hero.x, hero.y, r * 0.72, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = "#ffffff";
    context.lineWidth = 5;
    context.beginPath();
    context.arc(hero.x, hero.y, r * 0.72, 0, Math.PI * 2);
    context.stroke();

    // Facing notch, drawn outside the body ring in white. Anti-Mage has to
    // finish turning before a swing can start, so which way he points is
    // information the player genuinely needs.
    const noseInner = r * 0.78;
    const noseOuter = r * 1.15;
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.moveTo(
      hero.x + Math.cos(hero.facing) * noseOuter,
      hero.y + Math.sin(hero.facing) * noseOuter
    );
    context.lineTo(
      hero.x + Math.cos(hero.facing + 0.42) * noseInner,
      hero.y + Math.sin(hero.facing + 0.42) * noseInner
    );
    context.lineTo(
      hero.x + Math.cos(hero.facing - 0.42) * noseInner,
      hero.y + Math.sin(hero.facing - 0.42) * noseInner
    );
    context.closePath();
    context.fill();

    drawSwing(context, hero, COLORS.hero);

    // Highlight the current order target with a plain selection ring.
    const target = hero.targetId ? state.units.get(hero.targetId) : null;
    if (target?.alive) {
      context.strokeStyle = "rgba(255, 255, 255, 0.5)";
      context.lineWidth = 4;
      context.beginPath();
      context.arc(target.x, target.y, target.stats.ringRadius + 10, 0, Math.PI * 2);
      context.stroke();
    }
  }

  function drawProjectile(context, shot) {
    context.fillStyle = COLORS.projectile;
    context.beginPath();
    context.arc(shot.x, shot.y, 12, 0, Math.PI * 2);
    context.fill();
  }

  function drawFlashes(context) {
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "700 30px Inter, system-ui, sans-serif";
    for (const flash of flashes) {
      const t = flash.age / FLASH_DURATION;
      context.globalAlpha = 1 - t;
      context.fillStyle = flash.color;
      context.fillText(flash.text, flash.x, flash.y - 70 - t * 60);
    }
    context.globalAlpha = 1;
  }

  /** Convert a canvas-relative pointer position into world coordinates. */
  function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / VIEW_WIDTH;
    return {
      x: (clientX - rect.left - rect.width / 2) / scale + camX,
      y: (clientY - rect.top - rect.height / 2) / scale,
    };
  }

  /** Inverse of screenToWorld, in client coordinates. */
  function worldToScreen(worldX, worldY) {
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / VIEW_WIDTH;
    return {
      x: rect.left + rect.width / 2 + (worldX - camX) * scale,
      y: rect.top + rect.height / 2 + worldY * scale,
    };
  }

  function reset() {
    flashes = [];
    camX = LANE_LENGTH / 2;
  }

  return { draw, screenToWorld, worldToScreen, reset };
}
