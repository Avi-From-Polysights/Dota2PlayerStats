/**
 * Unit stats for the Last Hit Trainer.
 *
 * Prefers data/creeps.json, bundled from the live Dota VPK at deploy time by
 * scripts/bundle-creep-data.mjs, so damage and timing track the current patch.
 * Falls back to the table in constants.js when that file is absent, which is
 * the normal case on a bare local checkout.
 */
import { fetchBundledJson } from "../valve-fetch.js";
import { FALLBACK_DATA } from "./constants.js";

let memoryCache = null;

function isUsable(data) {
  return Boolean(
    data?.creeps?.melee?.health &&
      data?.creeps?.ranged?.health &&
      data?.tower?.damageMax &&
      data?.hero?.damageMax
  );
}

export async function loadTrainerData({ force = false, signal } = {}) {
  if (memoryCache && !force) return memoryCache;

  const bundled = await fetchBundledJson("creeps.json", { signal });
  memoryCache = isUsable(bundled) ? bundled : FALLBACK_DATA;
  return memoryCache;
}

export function clearTrainerDataCache() {
  memoryCache = null;
}

/** Short provenance label for the UI, so it is obvious which numbers are in play. */
export function trainerDataSourceLabel(data) {
  if (!data || data.source === "fallback") return "built-in stat table";
  const when = data.bundledAt ? new Date(data.bundledAt).toLocaleDateString() : "?";
  return `live Dota data · ${when}`;
}
