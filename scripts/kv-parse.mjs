/** Minimal KeyValues block parser for Valve npc_*.txt files. */

export function parseKvBlocks(text) {
  const blocks = new Map();
  const lines = text.split(/\r?\n/);
  let current = null;
  let depth = 0;

  for (const rawLine of lines) {
    const withoutComment = rawLine.replace(/\s*\/\/.*$/, "");
    const line = withoutComment.trim();
    if (!line) continue;

    if (line === "{") {
      depth += 1;
      continue;
    }
    if (line === "}") {
      depth -= 1;
      if (depth <= 1) current = null;
      continue;
    }

    const quotedPair = line.match(/^"([^"]+)"\s+"([^"]*)"\s*$/);
    if (quotedPair) {
      const [, key, value] = quotedPair;
      if (depth === 1) {
        current = key;
        if (!blocks.has(current)) blocks.set(current, {});
        continue;
      }
      if (depth === 2 && current) {
        blocks.get(current)[key] = value;
      }
      continue;
    }

    const quotedName = line.match(/^"([^"]+)"\s*$/);
    if (quotedName && depth === 1) {
      current = quotedName[1];
      if (!blocks.has(current)) blocks.set(current, {});
    }
  }

  return blocks;
}

export function parseAbilityValues(blockText) {
  const values = {};
  const abilityValuesIdx = blockText.indexOf('"AbilityValues"');
  if (abilityValuesIdx < 0) return values;

  const chunk = blockText.slice(abilityValuesIdx, abilityValuesIdx + 2500);
  const re = /"([^"]+)"\s+"([^"]*)"/g;
  let match;
  let inValues = false;
  for (const line of chunk.split(/\r?\n/)) {
    if (line.includes('"AbilityValues"')) {
      inValues = true;
      continue;
    }
    if (inValues && line.trim() === "}") break;
    if (!inValues) continue;
    while ((match = re.exec(line))) {
      const [, key, value] = match;
      if (key === "AbilityValues") continue;
      if (!values[key]) values[key] = value;
    }
  }
  return values;
}

export function pickUnit(blocks, unitName) {
  const data = blocks.get(unitName);
  if (!data) return null;
  return {
    name: unitName,
    health: Number(data.StatusHealth) || 0,
    healthRegen: Number(data.StatusHealthRegen) || 0,
    armor: Number(data.ArmorPhysical) || 0,
    attackMin: Number(data.AttackDamageMin) || 0,
    attackMax: Number(data.AttackDamageMax) || 0,
    attackRate: Number(data.AttackRate) || 1,
    baseAttackSpeed: Number(data.BaseAttackSpeed) || 100,
    level: Number(data.Level) || 1,
    strGain: Number(data.AttributeStrengthGain) || 0,
    agiGain: Number(data.AttributeAgilityGain) || 0,
    intGain: Number(data.AttributeIntelligenceGain) || 0,
    baseStr: Number(data.AttributeBaseStrength) || 0,
    baseAgi: Number(data.AttributeBaseAgility) || 0,
    baseInt: Number(data.AttributeBaseIntelligence) || 0,
    primaryAttr: data.AttributePrimary ?? "DOTA_ATTRIBUTE_STRENGTH",
    abilities: [
      data.Ability1,
      data.Ability2,
      data.Ability3,
      data.Ability4,
      data.Ability5,
      data.Ability6,
    ].filter(Boolean),
  };
}
