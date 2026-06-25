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

export const DOTA_POSITION_LABELS = {
  0: "Unknown",
  1: "Pos 1 — Hard Carry",
  2: "Pos 2 — Mid",
  3: "Pos 3 — Off Lane",
  4: "Pos 4 — Soft Support",
  5: "Pos 5 — Hard Support",
};

export function laneLabel(lane) {
  return LANE_LABELS[lane] ?? `Lane ${lane}`;
}

export function dotaPositionLabel(pos) {
  return DOTA_POSITION_LABELS[pos] ?? `Pos ${pos}`;
}

export function lastHitsAt10(player) {
  if (Array.isArray(player?.lh_t) && player.lh_t.length > 0) {
    const idx = Math.min(LANE_GOLD_MINUTE, player.lh_t.length - 1);
    const value = player.lh_t[idx];
    if (typeof value === "number") return value;
  }
  if (typeof player?.lane_last_hits === "number") return player.lane_last_hits;
  return null;
}

/** OpenDota web-style support heuristic (parsed replays). */
export function isSupportPlayer(player) {
  const lh10 = lastHitsAt10(player);
  if (lh10 == null) return false;

  const wards =
    (player.obs_placed ?? 0) +
    (player.sen_placed ?? 0) +
    (player.observer_uses ?? 0) +
    (player.sentry_uses ?? 0);

  if (lh10 < 20 && wards > 2) return true;
  if (lh10 <= 12) return true;
  if (lh10 < 20 && wards > 0) return true;
  return false;
}

/**
 * Infer Dota position 1–5 from lane + laning farm/wards (OpenDota parsed data).
 * Pos 4/5 are ranked among supports on the same team by LH@10 (lower = pos 5).
 */
export function resolveDotaPosition(player, allPlayers = []) {
  const lane = resolvePlayerLane(player).lane;
  const support = isSupportPlayer(player);

  const teammates = allPlayers.filter(
    (p) => isRadiant(p.player_slot) === isRadiant(player.player_slot)
  );

  if (support) {
    const supports = teammates.filter(isSupportPlayer);
    if (supports.length >= 2) {
      const ranked = [...supports].sort(
        (a, b) => (lastHitsAt10(a) ?? Infinity) - (lastHitsAt10(b) ?? Infinity)
      );
      const idx = ranked.findIndex((p) => p.player_slot === player.player_slot);
      if (idx === 0) return 5;
      if (idx === 1) return 4;
      if (idx > 1) return 4;
    }
    if (lane === 3) return 4;
    if (lane === 1) return 5;
    return 5;
  }

  if (lane === 2) return 2;
  if (lane === 1) return 1;
  if (lane === 3) return 3;

  const cores = teammates.filter((p) => !isSupportPlayer(p));
  const lh10 = lastHitsAt10(player);
  if (lh10 != null && cores.length >= 2) {
    const ranked = [...cores].sort(
      (a, b) => (lastHitsAt10(b) ?? 0) - (lastHitsAt10(a) ?? 0)
    );
    const idx = ranked.findIndex((p) => p.player_slot === player.player_slot);
    if (idx === 0) return 1;
    if (idx === 1) return 2;
    if (idx === 2) return 3;
  }

  return 0;
}

/** @deprecated Use resolveDotaPosition for role filters. */
export function resolveOpenDotaLaneRole(player) {
  const lane = player?.lane;
  if (lane === 4) return 4;

  const laneRole = player?.lane_role;
  if (typeof laneRole === "number" && laneRole >= 1 && laneRole <= 5) {
    return laneRole;
  }

  if (typeof lane === "number" && lane >= 1 && lane <= 3) {
    return lane;
  }

  if (player?.is_roaming) return 5;
  return 0;
}

/**
 * Lane assignment from OpenDota match player object (map lane, not Dota position).
 * Primary `lane` and lane win % (`gold_t`) only exist on parsed replays.
 * Falls back to OpenDota geographic `lane_role` (1 safe, 2 mid, 3 off, 4 jungle, 5 roam).
 */
export function resolvePlayerLane(player) {
  const lane = player?.lane;
  if (typeof lane === "number" && lane >= 1 && lane <= 5) {
    return {
      lane,
      label: laneLabel(lane),
      source: "lane",
      hasParsedReplay: Boolean(player?.gold_t?.length || player?.lane_total_gold != null),
    };
  }

  const role = player?.lane_role;
  if (role === 5) {
    return {
      lane: 5,
      label: laneLabel(5),
      source: "lane_role",
      hasParsedReplay: Boolean(player?.gold_t?.length || player?.lane_total_gold != null),
    };
  }
  if (typeof role === "number" && role >= 1 && role <= 4) {
    return {
      lane: role,
      label: laneLabel(role),
      source: "lane_role",
      hasParsedReplay: Boolean(player?.gold_t?.length || player?.lane_total_gold != null),
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
  if (minute === LANE_GOLD_MINUTE && typeof player?.lane_total_gold === "number") {
    return player.lane_total_gold;
  }

  const series = player?.gold_t;
  if (!Array.isArray(series) || series.length === 0) return null;
  const idx = Math.min(minute, series.length - 1);
  const value = series[idx];
  return typeof value === "number" ? value : null;
}

export function findLaneOpponents(me, players, laneInfo) {
  const lane = laneInfo.lane;
  if (!lane || lane === 4 || lane === 5) return [];

  return players.filter(
    (p) =>
      isRadiant(p.player_slot) !== isRadiant(me.player_slot) &&
      resolvePlayerLane(p).lane === lane
  );
}

/** Safelane and offlane are 2v2 — OpenDota compares combined team gold in the lane. */
export function isDualLane(lane) {
  return lane === 1 || lane === 3;
}

export function findLaneAllies(me, players, laneInfo) {
  const lane = laneInfo.lane;
  if (!lane || lane === 4 || lane === 5) return [];

  return players.filter(
    (p) =>
      isRadiant(p.player_slot) === isRadiant(me.player_slot) &&
      p.player_slot !== me.player_slot &&
      resolvePlayerLane(p).lane === lane
  );
}

function sumLaneGold(players) {
  if (!players.length) return null;
  let total = 0;
  for (const p of players) {
    const gold = goldAtMinute(p);
    if (gold == null) return null;
    total += gold;
  }
  return total;
}

function outcomeFromGoldDiff(diff) {
  if (Math.abs(diff) <= LANE_DRAW_THRESHOLD) return "draw";
  return diff > 0 ? "won" : "lost";
}

export function isLaneOpponent(me, enemy, players, laneInfo = resolvePlayerLane(me)) {
  return findLaneOpponents(me, players, laneInfo).some(
    (p) => p.player_slot === enemy.player_slot
  );
}

/**
 * Lane outcome vs a specific enemy when they share the same lane (10-min gold).
 * Returns null when data is unavailable or they did not lane together.
 */
export function computeLaneOutcomeVsOpponent(me, opponent, players) {
  const laneInfo = resolvePlayerLane(me);
  if (!isLaneOpponent(me, opponent, players, laneInfo)) return null;

  const lane = laneInfo.lane;
  if (isDualLane(lane)) {
    return computeLaneOutcome(me, players);
  }

  const myGold = goldAtMinute(me);
  const oppGold = goldAtMinute(opponent);
  if (myGold == null || oppGold == null) return null;

  return outcomeFromGoldDiff(myGold - oppGold);
}

/**
 * Lane outcome from gold at 10 min vs lane opponent(s).
 * Safelane/offlane: sum ally gold vs sum enemy gold (OpenDota 2v2 lanes).
 * Mid: 1v1 gold comparison. Requires parsed replay data.
 */
export function computeLaneOutcome(me, players) {
  const laneInfo = resolvePlayerLane(me);
  const lane = laneInfo.lane;
  if (!lane || lane === 4 || lane === 5) return null;

  const opponents = findLaneOpponents(me, players, laneInfo);
  if (!opponents.length) return null;

  if (isDualLane(lane)) {
    const allies = findLaneAllies(me, players, laneInfo);
    const teamGold = sumLaneGold([me, ...allies]);
    const enemyGold = sumLaneGold(opponents);
    if (teamGold == null || enemyGold == null) return null;
    return outcomeFromGoldDiff(teamGold - enemyGold);
  }

  const myGold = goldAtMinute(me);
  if (myGold == null) return null;

  const oppGolds = opponents
    .map((o) => goldAtMinute(o))
    .filter((g) => g != null);
  if (oppGolds.length !== 1) return null;

  return outcomeFromGoldDiff(myGold - oppGolds[0]);
}

export function laneOutcomeLabel(outcome) {
  if (outcome === "won") return "Lane won";
  if (outcome === "lost") return "Lane lost";
  if (outcome === "draw") return "Lane draw";
  return "Unknown";
}
