/**
 * Resolve Valve ability/talent placeholder text ({s:bonus_x}, %param%) using special_values.
 * Ported from dota2-datawrapper (MIT) — simplified for the Hero Builder.
 */

function roundVal(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.floor(100 * value) / 100;
}

function formatValues(values) {
  if (!values?.length) return "";
  const rounded = values.map(roundVal);
  const allSame = rounded.every((v) => v === rounded[0]);
  return allSame ? String(rounded[0]) : rounded.join(" / ");
}

function getEffectiveValues(sv, upgradeContext, placeholderName) {
  let base = [...(sv.values_float || [])];
  let effectiveUpgrade = upgradeContext;
  if (!effectiveUpgrade && placeholderName) {
    const lower = placeholderName.toLowerCase();
    if (lower.includes("shard")) effectiveUpgrade = "shard";
    else if (lower.includes("scepter")) effectiveUpgrade = "scepter";
  }
  if (effectiveUpgrade === "shard" && sv.values_shard?.length > 0) base = [...sv.values_shard];
  else if (effectiveUpgrade === "scepter" && sv.values_scepter?.length > 0) base = [...sv.values_scepter];
  return base;
}

function resolvePlaceholder(param, svs, heroAbilities, sourceAbility, upgradeContext) {
  const pLower = param.toLowerCase();
  const checkName = (name) => {
    const lower = name.toLowerCase();
    return lower === pLower || (pLower.startsWith("bonus_") && lower === pLower.replace("bonus_", ""));
  };

  const localSv = svs?.find((v) => checkName(v.name));
  if (localSv) return formatValues(getEffectiveValues(localSv, upgradeContext, param));

  if (heroAbilities?.length) {
    for (const ability of heroAbilities) {
      for (const sv of ability.special_values ?? []) {
        if (checkName(sv.name)) {
          if (pLower.startsWith("bonus_")) {
            const bonus = sv.bonuses?.find((b) => b.name === sourceAbility?.name);
            if (bonus) return String(Math.abs(roundVal(bonus.value)));
          }
          return formatValues(getEffectiveValues(sv, upgradeContext, param));
        }
        if (param === "value") {
          const bonus = sv.bonuses?.find((b) => b.name === sourceAbility?.name);
          if (bonus) return String(Math.abs(roundVal(bonus.value)));
        }
      }
    }
  }

  return null;
}

/** Format localized ability/talent text with resolved numeric placeholders. */
export function formatAbilityText(text, svs, heroAbilities, sourceAbility, upgradeContext) {
  if (!text) return "";

  let res = text;

  res = res.replace(/{s:([^}]+)}/g, (match, param) => {
    return resolvePlaceholder(param, svs, heroAbilities, sourceAbility, upgradeContext) ?? match;
  });

  res = res.replace(/%([a-z0-9_$]+)%/gi, (match, param) => {
    const pName = param.split("$")[0].toLowerCase();
    if (pName === "zero_tooltip") return "0";
    return resolvePlaceholder(pName, svs, heroAbilities, sourceAbility, upgradeContext) ?? match;
  });

  return res.replace(/%%/g, "%");
}
