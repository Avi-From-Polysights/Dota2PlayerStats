import {
  dotaPositionLabel,
  laneLabel,
  resolveDotaPosition,
  resolvePlayerLane,
} from "./lane.js";

export const LANE_FILTER_OPTIONS = [
  { value: "", label: "All lanes" },
  { value: "1", label: "Safe Lane" },
  { value: "2", label: "Mid Lane" },
  { value: "3", label: "Off Lane" },
  { value: "4", label: "Jungle" },
  { value: "5", label: "Roaming" },
  { value: "0", label: "Unknown" },
];

/** Dota positions 1–5 (inferred from parsed lane + LH@10 / wards). */
export const LANE_ROLE_FILTER_OPTIONS = [
  { value: "", label: "All positions" },
  { value: "1", label: "Pos 1 — Hard Carry" },
  { value: "2", label: "Pos 2 — Mid" },
  { value: "3", label: "Pos 3 — Off Lane" },
  { value: "4", label: "Pos 4 — Soft Support" },
  { value: "5", label: "Pos 5 — Hard Support" },
];

/** Legacy share URL values mapped to Dota positions. */
const LEGACY_ROLE_MAP = {
  support: "5",
  roaming: "4",
};

export function populateLaneFilterSelects() {
  const map = {
    "my-lane-filter": LANE_FILTER_OPTIONS,
    "my-role-filter": LANE_ROLE_FILTER_OPTIONS,
    "enemy-lane-filter": LANE_FILTER_OPTIONS,
    "enemy-role-filter": LANE_ROLE_FILTER_OPTIONS,
  };

  for (const [id, options] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.innerHTML = options
      .map((o) => `<option value="${o.value}">${o.label}</option>`)
      .join("");
  }
}

export function readLaneFiltersFromDom() {
  return {
    myLane: document.getElementById("my-lane-filter")?.value ?? "",
    myRole: document.getElementById("my-role-filter")?.value ?? "",
    enemyLane: document.getElementById("enemy-lane-filter")?.value ?? "",
    enemyRole: document.getElementById("enemy-role-filter")?.value ?? "",
  };
}

export function applyLaneFiltersToDom(filters) {
  const normalizeRole = (value) => {
    if (value == null || value === "") return "";
    return LEGACY_ROLE_MAP[value] ?? String(value);
  };

  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el && value != null) el.value = String(value);
  };
  set("my-lane-filter", filters.myLane ?? "");
  set("my-role-filter", normalizeRole(filters.myRole));
  set("enemy-lane-filter", filters.enemyLane ?? "");
  set("enemy-role-filter", normalizeRole(filters.enemyRole));
}

export function hasActiveLaneFilters(filters) {
  return Boolean(filters.myLane || filters.myRole || filters.enemyLane || filters.enemyRole);
}

function roleLabel(role) {
  if (!role) return "";
  const opt = LANE_ROLE_FILTER_OPTIONS.find((o) => o.value === String(role));
  if (opt) return opt.label;
  return dotaPositionLabel(Number(role));
}

export function formatLaneFilterSummary(filters) {
  if (!hasActiveLaneFilters(filters)) return "";

  const parts = [];
  if (filters.myLane) parts.push(`you: ${laneLabel(Number(filters.myLane))}`);
  if (filters.myRole) parts.push(`your position: ${roleLabel(filters.myRole)}`);
  if (filters.enemyLane) parts.push(`enemy lane: ${laneLabel(Number(filters.enemyLane))}`);
  if (filters.enemyRole) parts.push(`enemy position: ${roleLabel(filters.enemyRole)}`);
  return parts.join(" · ");
}

/** Dota position 1–5 for role filters: STRATZ when merged, else parsed-replay inference. */
function resolveFilterPosition(player, allPlayers) {
  const stratz = player?.stratz_position;
  if (typeof stratz === "number" && stratz >= 1 && stratz <= 5) return stratz;
  return resolveDotaPosition(player, allPlayers);
}

function matchRoleFilter(player, roleValue, allPlayers) {
  if (!roleValue) return true;

  const normalized = LEGACY_ROLE_MAP[roleValue] ?? String(roleValue);
  const position = resolveFilterPosition(player, allPlayers);
  if (position === 0) return false;

  return String(position) === normalized;
}

export function matchMyLaneFilter(player, filters, allPlayers = []) {
  if (!filters?.myLane && !filters?.myRole) return true;

  if (filters.myLane) {
    const lane = resolvePlayerLane(player).lane;
    if (String(lane) !== String(filters.myLane)) return false;
  }

  if (filters.myRole && !matchRoleFilter(player, filters.myRole, allPlayers)) {
    return false;
  }

  return true;
}

export function matchEnemyLaneFilter(player, filters, allPlayers = []) {
  if (!filters?.enemyLane && !filters?.enemyRole) return true;

  if (filters.enemyLane) {
    const lane = resolvePlayerLane(player).lane;
    if (String(lane) !== String(filters.enemyLane)) return false;
  }

  if (filters.enemyRole && !matchRoleFilter(player, filters.enemyRole, allPlayers)) {
    return false;
  }

  return true;
}
