const CDN_BASE = "https://cdn.cloudflare.steamstatic.com";

/** dotaconstants image paths already start with "/apps/dota2/images/..."; just prefix the CDN host. */
function cdnUrl(path) {
  if (!path) return null;
  const clean = path.split("?")[0];
  return `${CDN_BASE}${clean}`;
}

export function heroIconUrl(hero) {
  return cdnUrl(hero?.icon);
}

export function heroPortraitUrl(hero) {
  return cdnUrl(hero?.img);
}

export function abilityIconUrl(ability) {
  return cdnUrl(ability?.img);
}

export function itemIconUrl(item) {
  return cdnUrl(item?.img);
}

/** Fallback ability/item icon when data is missing an image path. */
export const BLANK_ABILITY_ICON =
  `${CDN_BASE}/apps/dota2/images/dota_react/abilities/dota_empty_ability.png`;
