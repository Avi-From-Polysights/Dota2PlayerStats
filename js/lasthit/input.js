/**
 * Dota-faithful input for the Last Hit Trainer.
 *
 *   right-click a creep   attack it (an enemy creep, or an ally below 50% to deny)
 *   right-click the ground move there
 *   A then left-click      attack-move (picks up enemies only, never auto-denies)
 *   S                      stop, cancelling the windup or the backswing
 *
 * Ordering an attack on an ally that is not yet deniable is refused and turns
 * into a move, exactly as the game does.
 */
import { KIND_TOWER } from "./constants.js";
import { isPlayerAttackable, issueOrder } from "./sim.js";

/** Extra slack around a unit's hull when picking a click target. */
const PICK_PADDING = 26;

function pickUnit(state, world) {
  let best = null;
  let bestDist = Infinity;
  for (const unit of state.units.values()) {
    if (!unit.alive || unit.isPlayer || unit.kind === KIND_TOWER) continue;
    const dist = Math.hypot(unit.x - world.x, unit.y - world.y);
    if (dist > unit.stats.ringRadius + PICK_PADDING) continue;
    if (dist < bestDist) {
      best = unit;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ getState: () => object|null, screenToWorld: (x: number, y: number) => {x: number, y: number}, onAttackMoveChange?: (armed: boolean) => void }} deps
 */
export function attachInput(canvas, { getState, screenToWorld, onAttackMoveChange }) {
  let attackMoveArmed = false;

  const setArmed = (value) => {
    if (attackMoveArmed === value) return;
    attackMoveArmed = value;
    canvas.classList.toggle("lasthit-canvas--attack-move", value);
    onAttackMoveChange?.(value);
  };

  const onContextMenu = (event) => event.preventDefault();

  const onMouseDown = (event) => {
    const state = getState();
    if (!state || state.phase !== "running") return;
    const world = screenToWorld(event.clientX, event.clientY);

    // Left click only does anything while attack-move is armed.
    if (event.button === 0) {
      if (!attackMoveArmed) return;
      event.preventDefault();
      setArmed(false);
      issueOrder(state, { type: "attackMove", x: world.x, y: world.y });
      return;
    }

    if (event.button !== 2) return;
    event.preventDefault();
    setArmed(false);

    const target = pickUnit(state, world);
    if (target && isPlayerAttackable(target)) {
      issueOrder(state, { type: "attack", targetId: target.id });
      return;
    }
    // Right-clicking a healthy ally, or empty ground, is a move order.
    issueOrder(state, { type: "move", x: world.x, y: world.y });
  };

  const onKeyDown = (event) => {
    const state = getState();
    if (!state || state.phase !== "running") return;
    // Never swallow keystrokes aimed at a form field elsewhere on the page.
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const key = event.key.toLowerCase();
    if (key === "s") {
      event.preventDefault();
      setArmed(false);
      issueOrder(state, { type: "stop" });
      return;
    }
    if (key === "a") {
      event.preventDefault();
      setArmed(!attackMoveArmed);
      return;
    }
    if (key === "escape") setArmed(false);
  };

  canvas.addEventListener("contextmenu", onContextMenu);
  canvas.addEventListener("mousedown", onMouseDown);
  window.addEventListener("keydown", onKeyDown);

  return {
    disarm: () => setArmed(false),
    destroy() {
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    },
  };
}
