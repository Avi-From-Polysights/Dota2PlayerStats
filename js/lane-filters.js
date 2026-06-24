import { laneLabel, resolvePlayerLane } from "./lane.js";

export const LANE_FILTER_OPTIONS = [
  { value: "", label: "All lanes" },
  { value: "1", label: "Safe Lane" },
  { value: "2", label: "Mid Lane" },
  { value: "3", label: "Off Lane" },
  { value: "4", label: "Jungle" },
  { value: "5", label: "Roaming" },
  { value: "0", label: "Unknown" },
];

/** OpenDota lane_role (farm priority / position). */
export const LANE_ROLE_FILTER_OPTIONS = [
  { value: "", label: "All roles" },
  { value: "1", label: "Safe Core" },
  { value: "2", label: "Mid" },
  { value: "3", label: "Off Lane" },
  { value: "4", label: "Jungle" },
  { value: "5", label: "Support" },
];

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
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el && value != null) el.value = String(value);
  };
  set("my-lane-filter", filters.myLane ?? "");
  set("my-role-filter", filters.myRole ?? "");
  set("enemy-lane-filter", filters.enemyLane ?? "");
  set("enemy-role-filter", filters.enemyRole ?? "");
}

export function hasActiveLaneFilters(filters) {
  return Boolean(filters.myLane || filters.myRole || filters.enemyLane || filters.enemyRole);
}

function roleLabel(role) {
  const opt = LANE_ROLE_FILTER_OPTIONS.find((o) => o.value === String(role));
  return opt?.label ?? `Role ${role}`;
}

export function formatLaneFilterSummary(filters) {
  if (!hasActiveLaneFilters(filters)) return "";

  const parts = [];
  if (filters.myLane) parts.push(`you: ${laneLabel(Number(filters.myLane))}`);
  if (filters.myRole) parts.push(`your role: ${roleLabel(filters.myRole)}`);
  if (filters.enemyLane) parts.push(`enemy lane: ${laneLabel(Number(filters.enemyLane))}`);
  if (filters.enemyRole) parts.push(`enemy role: ${roleLabel(filters.enemyRole)}`);
  return parts.join(" · ");
}

export function matchMyLaneFilter(player, filters) {
  if (!filters?.myLane && !filters?.myRole) return true;

  if (filters.myLane) {
    const lane = resolvePlayerLane(player).lane;
    if (String(lane) !== String(filters.myLane)) return false;
  }

  if (filters.myRole) {
    const role = player?.lane_role;
    if (role == null || String(role) !== String(filters.myRole)) return false;
  }

  return true;
}

export function matchEnemyLaneFilter(player, filters) {
  if (!filters?.enemyLane && !filters?.enemyRole) return true;

  if (filters.enemyLane) {
    const lane = resolvePlayerLane(player).lane;
    if (String(lane) !== String(filters.enemyLane)) return false;
  }

  if (filters.enemyRole) {
    const role = player?.lane_role;
    if (role == null || String(role) !== String(filters.enemyRole)) return false;
  }

  return true;
}
