import { isRadiant } from "./api.js";

/** Minute index used for lane outcome (OpenDota-style laning phase). */
export const LANE_GOLD_MINUTE = 10;

/** Gold diff within this band counts as a lane draw. */
export const LANE_DRAW_THRESHOLD = 200;

export function goldAtMinute(player, minute = LANE_GOLD_MINUTE) {
  const series = player?.gold_t;
  if (!Array.isArray(series) || series.length === 0) return null;
  const idx = Math.min(minute, series.length - 1);
  const value = series[idx];
  return typeof value === "number" ? value : null;
}

export function findLaneOpponents(me, players) {
  const lane = me.lane;
  if (!lane || lane === 4) return [];

  const enemies = players.filter(
    (p) =>
      isRadiant(p.player_slot) !== isRadiant(me.player_slot) &&
      p.lane === lane
  );

  if (!enemies.length) return [];

  if (me.lane_role) {
    const roleMatch = enemies.filter((e) => e.lane_role === me.lane_role);
    if (roleMatch.length) return roleMatch;
  }

  return enemies;
}

/**
 * Lane outcome from gold at 10 min vs lane opponent(s).
 * Returns "won" | "lost" | "draw" | null when data is unavailable.
 */
export function computeLaneOutcome(me, players) {
  const opponents = findLaneOpponents(me, players);
  if (!opponents.length) return null;

  const myGold = goldAtMinute(me);
  if (myGold == null) return null;

  const oppGolds = opponents
    .map((o) => goldAtMinute(o))
    .filter((g) => g != null);
  if (!oppGolds.length) return null;

  const oppGold =
    oppGolds.reduce((sum, g) => sum + g, 0) / oppGolds.length;
  const diff = myGold - oppGold;

  if (Math.abs(diff) <= LANE_DRAW_THRESHOLD) return "draw";
  return diff > 0 ? "won" : "lost";
}

export function laneOutcomeLabel(outcome) {
  if (outcome === "won") return "Lane won";
  if (outcome === "lost") return "Lane lost";
  if (outcome === "draw") return "Lane draw";
  return "Unknown";
}
