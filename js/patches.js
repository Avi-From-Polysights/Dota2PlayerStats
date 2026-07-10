import { fetchBundledJson } from "./valve-fetch.js";

const PATCH_URL =
  "https://raw.githubusercontent.com/odota/dotaconstants/master/build/patch.json";

let patchCache = null;

function normalizePatchList(data) {
  return data
    .map((p) => ({ id: p.id, name: p.name, date: p.date }))
    .sort((a, b) => b.id - a.id);
}

export async function loadPatches() {
  if (patchCache) return patchCache;

  try {
    const bundled = await fetchBundledJson("constants/patch.json");
    if (Array.isArray(bundled) && bundled.length) {
      patchCache = normalizePatchList(bundled);
      return patchCache;
    }
  } catch {
    // fall through
  }

  const response = await fetch(PATCH_URL);
  if (!response.ok) {
    throw new Error("Could not load patch list.");
  }

  const data = await response.json();
  patchCache = normalizePatchList(data);
  return patchCache;
}

export function patchLabel(patches, patchId) {
  if (patchId == null) return "Unknown";
  const match = patches.find((p) => p.id === patchId);
  return match?.name ?? `Patch ${patchId}`;
}

export function selectablePatches(patches, minId = 39) {
  return patches.filter((p) => p.id >= minId);
}
