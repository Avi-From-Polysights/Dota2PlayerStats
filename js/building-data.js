/**
 * Live building/tower stats bundled from Dota VPK extracts at deploy time.
 */
import { fetchBundledJson } from "./valve-fetch.js";

let memoryCache = null;

/** @typedef {import('./tower-damage.js').BuildingDataset} BuildingDataset */

export async function loadBuildingData({ force = false } = {}) {
  if (memoryCache && !force) return memoryCache;

  const bundled = await fetchBundledJson("buildings.json");
  if (bundled?.targets) {
    memoryCache = bundled;
    return bundled;
  }

  throw new Error("Building data not bundled — run scripts/bundle-building-data.mjs");
}

export function clearBuildingDataCache() {
  memoryCache = null;
}

export function getBuildingDataSourceLabel(data) {
  if (!data) return "unknown";
  const when = data.bundledAt ? new Date(data.bundledAt).toLocaleDateString() : "?";
  return `${data.source ?? "bundled"} · ${when}`;
}
