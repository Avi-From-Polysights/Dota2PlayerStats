const PATCH_URL =
  "https://raw.githubusercontent.com/odota/dotaconstants/master/build/patch.json";

let patchCache = null;

export async function loadPatches() {
  if (patchCache) return patchCache;

  const response = await fetch(PATCH_URL);
  if (!response.ok) {
    throw new Error("Could not load patch list.");
  }

  const data = await response.json();
  patchCache = data
    .map((p) => ({ id: p.id, name: p.name, date: p.date }))
    .sort((a, b) => b.id - a.id);

  return patchCache;
}

export function patchLabel(patches, patchId) {
  if (patchId == null) return "Unknown";
  const match = patches.find((p) => p.id === patchId);
  return match?.name ?? `Patch ${patchId}`;
}

export function recentPatches(patches, count = 18) {
  return patches.slice(0, count);
}
