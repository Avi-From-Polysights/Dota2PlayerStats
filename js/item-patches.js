/**
 * Apply structured item changes from Valve patch notes (7.41+) onto dotaconstants items.
 * Valve publishes letter patches faster than the dotaconstants repo updates.
 */

const VALVE_PATCH_BASE = "https://www.dota2.com/datafeed/patchnotes";
const PATCH_FLOOR = "7.41";

const STAT_LABEL_TO_KEY = {
  damage: "bonus_damage",
  armor: "bonus_armor",
  health: "bonus_health",
  mana: "bonus_mana",
  "health regen": "bonus_hp_regen",
  "mana regen": "bonus_mp_regen",
  strength: "bonus_strength",
  agility: "bonus_agility",
  intelligence: "bonus_intellect",
  "all attributes": "bonus_all_stats",
  "attack speed": "bonus_attack_speed",
  "magic resistance": "bonus_magical_armor",
  "slow resistance": "bonus_slow_resistance",
  "spell lifesteal": "bonus_spell_amplification",
  "movement speed": "bonus_movement_speed",
};

function ensureAttrib(item, key) {
  item.attrib = item.attrib ?? [];
  let entry = item.attrib.find((a) => a.key === key);
  if (!entry) {
    entry = { key, value: "0" };
    item.attrib.push(entry);
  }
  return entry;
}

function setAttribValue(item, key, value) {
  const entry = ensureAttrib(item, key);
  entry.value = String(value);
  if (!entry.display) {
    entry.display = `+ {value} ${key.replace(/^bonus_/, "").replace(/_/g, " ")}`;
  }
}

function parseStatNote(note) {
  let match = note.match(
    /^(?:Reduced )?(.+?) bonus (?:decreased|increased) from \+?([\d./]+)%? to \+?([\d./]+)%?$/i
  );
  if (match) {
    const label = match[1].trim().toLowerCase();
    const key = STAT_LABEL_TO_KEY[label];
    if (!key) return null;
    const toVal = match[3].includes("/") ? match[3].split("/")[0].trim() : match[3];
    return { key, value: toVal };
  }

  match = note.match(/^(.+?) bonus (?:decreased|increased) from \+?([\d./]+)%? to \+?([\d./]+)%?$/i);
  if (match) {
    const label = match[1].trim().toLowerCase();
    const key = STAT_LABEL_TO_KEY[label] ?? (label === "damage" ? "bonus_damage" : null);
    if (!key) return null;
    const toVal = match[3].includes("/") ? match[3].split("/")[0].trim() : match[3];
    return { key, value: toVal };
  }

  return null;
}

function parseCostNote(note) {
  let match = note.match(/^Cost decreased from (\d+)g to (\d+)g/i);
  if (match) return { cost: Number(match[2]) };
  match = note.match(/^Recipe cost decreased from (\d+) to (\d+)/i);
  if (match) return { recipeCost: Number(match[2]) };
  match = note.match(/^Total cost .+ to ([\d/]+)g?$/i);
  if (match) {
    const first = match[1].split("/")[0].trim();
    return { cost: Number(first) };
  }
  return null;
}

async function fetchPatchNotes(version) {
  const url = `${VALVE_PATCH_BASE}?language=english&version=${encodeURIComponent(version)}`;
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.json();
}

async function listPatchesSinceFloor() {
  const response = await fetch(`${VALVE_PATCH_BASE.replace("/patchnotes", "/patchnoteslist")}?language=english`);
  if (!response.ok) return [PATCH_FLOOR];
  const data = await response.json();
  const patches = data.patches ?? data.result?.data?.patches ?? [];
  const names = patches.map((p) => p.patch_name ?? p.patch_number).filter(Boolean);
  const floorIdx = names.findIndex((n) => n === PATCH_FLOOR || n.startsWith(PATCH_FLOOR));
  return floorIdx === -1 ? names.slice(-5) : names.slice(floorIdx);
}

/**
 * Mutates `items` in place. Returns metadata about applied patches.
 */
export async function applyItemPatches(items, itemKeyById, { signal } = {}) {
  const patches = await listPatchesSinceFloor();
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  let changeCount = 0;
  const appliedPatches = [];

  for (const version of patches) {
    const notes = await fetchPatchNotes(version);
    if (!notes?.items?.length) continue;

    let patchChanges = 0;
    for (const block of notes.items) {
      const itemKey = itemKeyById.get(Number(block.ability_id));
      if (!itemKey || !items[itemKey]) continue;
      const item = items[itemKey];

      for (const entry of block.ability_notes ?? []) {
        const note = entry.note?.replace(/<br>/g, "").trim();
        if (!note) continue;

        const stat = parseStatNote(note);
        if (stat) {
          setAttribValue(item, stat.key, stat.value);
          patchChanges += 1;
          continue;
        }

        const cost = parseCostNote(note);
        if (cost?.cost != null) {
          item.cost = cost.cost;
          patchChanges += 1;
        }
      }
    }

    if (patchChanges > 0) {
      appliedPatches.push(version);
      changeCount += patchChanges;
    }
  }

  const latest = patches[patches.length - 1] ?? PATCH_FLOOR;
  return { latestPatch: latest, appliedPatches, changeCount };
}
