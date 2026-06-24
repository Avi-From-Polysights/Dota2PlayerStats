import { isRadiant } from "./api.js";

/** Minute index used for lane outcome (OpenDota-style laning phase). */
export const LANE_GOLD_MINUTE = 10;

/** Gold diff within this band counts as a lane draw. */
export const LANE_DRAW_THRESHOLD = 200;

const LANE_LABELS = {
  0: "Unknown",
  1: "Safe Lane",
  2: "Mid Lane",
  3: "Off Lane",
  4: "Jungle",
  5: "Roaming",
};

export function laneLabel(lane) {
  return LANE_LABELS[lane] ?? `Lane ${lane}`;
}

/**
 * Lane assignment from OpenDota match player object.
 * Primary `lane` and lane win % (`gold_t`) only exist on parsed replays.
 * Falls back to `lane_role` for position grouping when lane is missing.
 */
export function resolvePlayerLane(player) {
  const lane = player?.lane;
  if (typeof lane === "number" && lane >= 1 && lane <= 4) {
    return {
      lane,
      label: laneLabel(lane),
      source: "lane",
      hasParsedReplay: Boolean(player?.gold_t?.length),
    };
  }

  const role = player?.lane_role;
  if (role === 5) {
    return {
      lane: 5,
      label: laneLabel(5),
      source: "lane_role",
      hasParsedReplay: Boolean(player?.gold_t?.length),
    };
  }
  if (typeof role === "number" && role >= 1 && role <= 4) {
    return {
      lane: role,
      label: laneLabel(role),
      source: "lane_role",
      hasParsedReplay: Boolean(player?.gold_t?.length),
    };
  }

  return {
    lane: 0,
    label: laneLabel(0),
    source: "none",
    hasParsedReplay: false,
  };
}

export function goldAtMinute(player, minute = LANE_GOLD_MINUTE) {
  const series = player?.gold_t;
  if (!Array.isArray(series) || series.length === 0) return null;
  const idx = Math.min(minute, series.length - 1);
  const value = series[idx];
  return typeof value === "number" ? value : null;
}

export function findLaneOpponents(me, players, laneInfo) {
  const lane = laneInfo.lane;
  if (!lane || lane === 4 || lane === 5) return [];

  const enemies = players.filter(
    (p) =>
      isRadiant(p.player_slot) !== isRadiant(me.player_slot) &&
      resolvePlayerLane(p).lane === lane
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
 * Requires parsed replay (`gold_t`). Returns null when unavailable.
 */
export function computeLaneOutcome(me, players) {
  const laneInfo = resolvePlayerLane(me);
  const opponents = findLaneOpponents(me, players, laneInfo);
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
