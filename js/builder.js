import { abilityIconByName, heroIconByKey, heroIconUrl, heroPortraitByKey, itemIconUrl } from "./dota-cdn.js";
import {
  clearDotaDataCache,
  ensureGameDataUpToDate,
  loadItemPopularity,
  resolveItemPopularityKeys,
} from "./dota-data.js";
import { normalizeHeroQuery } from "./hero-picker.js";
import { formatAbilityText } from "./valve-text.js";
import {
  allHeroAbilities,
  fetchHeroData,
  fetchHeroList,
  formatValveAbilityLabel,
  getAbilityFromValve,
  normalizeValveHeroForStats,
  clearValveHeroCache,
  clearValvePatchCache,
} from "./valve-datafeed.js";
import {
  goldCheckpointTable,
  totalTimelineNetCost,
  timelineGoldDelta,
} from "./build-gold.js";
import {
  importBuildFromMatchPlayer,
  listCachedMatchImports,
} from "./build-import.js";
import {
  CONSUMABLE_SLOT_KINDS,
  CONSUMABLE_ITEM_KEYS,
  heroUsesBearInventory,
  isConsumableSlotItem,
  isMainInventoryItem,
  resolveHeroSkillLayout,
  resolveTalentTiers,
} from "./hero-special.js";
import {
  computeDerivedStats,
  computeItemBonuses,
  parseTalentAttributeBonus,
} from "./build-stats.js";
import {
  ATTRIBUTE_BONUS_MAX_POINTS,
  ATTRIBUTE_BONUS_PER_POINT,
  BACKPACK_SLOT_COUNT,
  ITEM_SLOT_COUNT,
  MAX_LEVEL,
  TALENT_TIER_LEVELS,
  ULTIMATE_MAX_POINTS,
  assignAbility,
  assignAttribute,
  assignTalent,
  canAssignAbility,
  canAssignAttribute,
  canAssignTalent,
  cloneBuild,
  computeSkillAttributeBonus,
  countAbilityPoints,
  countAttributeBonusPoints,
  createEmptyBuild,
  currentHeroLevel,
  getChosenTalentSides,
  getSkillableAbilities,
  getTalentTiers,
  heroHasAttributeBonus,
  addTimelineEvent,
  removeTimelineEvent,
  setConsumableSlot,
  setBearItemSlot,
  setUpgradeTiming,
  equippedItemKeys,
  normalizeBuild,
  nextOpenLevelIndex,
  resetSkillOrder,
  setBackpackSlot,
  setItemSlot,
  setNeutralItem,
  totalItemCost,
  undoLastPick,
} from "./build-model.js";
import {
  deleteBuild,
  getBuild,
  listBuilds,
  saveBuild,
} from "./builder-cache.js";

const QUAL_LABELS = {
  all: "All items",
  consumable: "Consumables",
  "consumable;laning": "Consumables",
  component: "Basics",
  common: "Upgrades",
  rare: "Support",
  epic: "Advanced",
  artifact: "Artifacts",
  secret_shop: "Secret Shop",
};
const QUAL_ORDER = [
  "all",
  "consumable",
  "component",
  "common",
  "rare",
  "epic",
  "artifact",
  "secret_shop",
];

const CONSUMABLE_SLOT_LABELS = {
  scepter: "Aghanim's Scepter",
  shard: "Aghanim's Shard",
  moonshard: "Moon Shard",
};

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function fmt(value, digits = 0) {
  if (value == null || Number.isNaN(value)) return "—";
  return Number(value).toFixed(digits);
}

/** dotaconstants talent names, humanized: "special_bonus_unique_antimage_5" -> "Unique Antimage 5". */
function humanizeTalentKey(key) {
  return String(key ?? "")
    .replace(/^special_bonus_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Many talent display names embed unresolved value templates like "{s:bonus_damage}"
 * (the referenced value lives in Valve's ability script data, not in this dataset).
 * Swap those tokens for "X" rather than showing the raw template syntax.
 */
function talentLabel(dname, key) {
  if (!dname) return humanizeTalentKey(key);
  if (/\{[^}]*\}/.test(dname)) {
    const cleaned = dname.replace(/\{[^}]*\}/g, "X").replace(/\s+/g, " ").trim();
    return cleaned || humanizeTalentKey(key);
  }
  return dname;
}

/**
 * @param {{ getDefaultHeroId?: () => number|null }} [options]
 */
export function initBuilder(options = {}) {
  const root = document.getElementById("builder-workspace");
  const heroSearch = document.getElementById("builder-hero-search");
  const heroSuggestions = document.getElementById("builder-hero-suggestions");
  const statusEl = document.getElementById("builder-status");
  const savedSelect = document.getElementById("builder-saved-select");
  const newBtn = document.getElementById("builder-new-btn");
  const saveBtn = document.getElementById("builder-save-btn");
  const deleteBtn = document.getElementById("builder-delete-btn");
  const refreshBtn = document.getElementById("builder-refresh-btn");
  const importBtn = document.getElementById("builder-import-btn");
  const upgradeGrantsEl = document.getElementById("builder-upgrade-grants");
  const heroNoteEl = document.getElementById("builder-hero-note");
  const consumableSlotsEl = document.getElementById("builder-consumable-slots");
  const bearGroupEl = document.getElementById("builder-bear-group");
  const bearSlotsEl = document.getElementById("builder-bear-slots");
  const gpmInput = document.getElementById("builder-gpm");
  const startGoldInput = document.getElementById("builder-start-gold");
  const goldCheckpointsEl = document.getElementById("builder-gold-checkpoints");
  const timelineListEl = document.getElementById("builder-timeline-list");
  const timelineAddBtn = document.getElementById("builder-timeline-add");
  const importModal = document.getElementById("builder-import-modal");
  const importListEl = document.getElementById("builder-import-list");
  const importDescEl = document.getElementById("builder-import-desc");
  const nameInput = document.getElementById("builder-build-name");
  const portraitImg = document.getElementById("builder-hero-portrait");
  const heroMetaEl = document.getElementById("builder-hero-meta");
  const levelBadge = document.getElementById("builder-level-badge");
  const skillGridEl = document.getElementById("builder-skill-grid");
  const talentTiersEl = document.getElementById("builder-talent-tiers");
  const undoBtn = document.getElementById("builder-undo-btn");
  const resetSkillsBtn = document.getElementById("builder-reset-skills-btn");
  const itemSlotsEl = document.getElementById("builder-item-slots");
  const neutralSlotEl = document.getElementById("builder-neutral-slot");
  const backpackSlotsEl = document.getElementById("builder-backpack-slots");
  const costEl = document.getElementById("builder-cost");
  const statsGridEl = document.getElementById("builder-stats-grid");

  const pickerModal = document.getElementById("builder-item-picker");
  const pickerSearch = document.getElementById("builder-item-search");
  const pickerTabsEl = document.getElementById("builder-item-tabs");
  const pickerListEl = document.getElementById("builder-item-list");
  const pickerRemoveBtn = document.getElementById("builder-item-remove");

  if (!root || !heroSearch) return;

  let data = null; // { heroesById, heroAbilities, abilities, items, itemKeyById, patchMeta }
  let heroList = []; // [{ id, name, key, hero }]
  let hero = null;
  let heroKey = null;
  let valveHero = null;
  let patchVersion = null;
  let skillCtx = { regular: [], ultimate: null, innate: [], layout: "standard", linkedUltimates: [], grants: { shard: [], scepter: [] } };
  let talentTiers = [];
  let build = null;
  let savedBuilds = [];
  let popularity = null; // resolved { start, early, mid, late } Maps
  let pickerState = { kind: null, index: null, qual: QUAL_ORDER[0] };

  function setStatus(text, isError = false) {
    statusEl.textContent = text;
    statusEl.classList.toggle("builder-status--error", isError);
  }

  function dataStatusSuffix() {
    const patch = patchVersion ?? data?.patchMeta?.latestPatch ?? "?";
    const heroSource = valveHero ? "live" : "cached";
    return `Hero data: ${heroSource} · Items: patched to ${patch}`;
  }

  function skillAssignOptions() {
    return { heroKey, linkedUltimates: skillCtx.linkedUltimates ?? [] };
  }

  async function ensureData({ force = false } = {}) {
    if (data && !force) return data;
    setStatus("Loading hero, ability, and item data…");
    const loaded = await ensureGameDataUpToDate({ force });
    data = loaded;
    patchVersion = loaded.latestPatch ?? loaded.patchMeta?.latestPatch ?? null;

    try {
      const valveList = await fetchHeroList();
      heroList = valveList.map((h) => ({
        id: h.id,
        key: h.key,
        name: h.name,
        hero: data.heroesById.get(h.id) ?? null,
      }));
    } catch {
      heroList = [...data.heroesById.values()]
        .map((h) => ({ id: h.id, key: h.name, name: h.localized_name, hero: h }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    if (!patchVersion) {
      patchVersion = loaded.patchMeta?.latestPatch ?? null;
    }

    return data;
  }

  function abilityDisplayLabel(key) {
    const va = valveHero ? getAbilityFromValve(valveHero, key) : null;
    if (va) return formatValveAbilityLabel(va, valveHero);
    return data.abilities[key]?.dname ?? key;
  }

  function abilityTooltip(key) {
    const va = valveHero ? getAbilityFromValve(valveHero, key) : null;
    if (va?.desc_loc) {
      return formatAbilityText(va.desc_loc, va.special_values ?? [], allHeroAbilities(valveHero), va);
    }
    return data.abilities[key]?.desc ?? "";
  }

  function talentDisplayLabel(name) {
    if (!name) return "";
    const va = valveHero ? getAbilityFromValve(valveHero, name) : null;
    if (va) return formatValveAbilityLabel(va, valveHero);
    return talentLabel(data.abilities[name]?.dname, name);
  }

  async function refreshSavedBuilds() {
    savedBuilds = await listBuilds().catch(() => []);
    const current = build?.id;
    savedSelect.innerHTML =
      `<option value="">My builds (${savedBuilds.length})…</option>` +
      savedBuilds
        .map((b) => {
          const heroName = data?.heroesById.get(b.heroId)?.localized_name ?? `Hero ${b.heroId}`;
          const label = `${escapeHtml(b.name)} — ${escapeHtml(heroName)}`;
          return `<option value="${b.id}" ${b.id === current ? "selected" : ""}>${label}</option>`;
        })
        .join("");
    deleteBtn.disabled = !current || !savedBuilds.some((b) => b.id === current);
  }

  function renderHeroSuggestions(query) {
    const q = normalizeHeroQuery(query);
    const items = !q
      ? heroList.slice(0, 20)
      : heroList.filter((h) => normalizeHeroQuery(h.name).includes(q)).slice(0, 20);

    if (!items.length) {
      heroSuggestions.classList.add("hidden");
      heroSuggestions.innerHTML = "";
      return;
    }
    heroSuggestions.innerHTML = items
      .map(
        (h) => `
      <li class="hero-combobox__option builder-hero-option" role="option" data-hero-id="${h.id}">
        <img src="${heroIconByKey(h.key) ?? heroIconUrl(h.hero) ?? ""}" alt="" class="builder-hero-option__icon" loading="lazy" />
        <span>${escapeHtml(h.name)}</span>
      </li>`
      )
      .join("");
    heroSuggestions.classList.remove("hidden");
  }

  async function selectHero(heroId, { fresh = true, existingBuild = null, force = false } = {}) {
    const entry = heroList.find((h) => h.id === Number(heroId));
    if (!entry) return;

    heroKey = entry.key;
    heroSearch.value = entry.name;
    heroSuggestions.classList.add("hidden");

    build = normalizeBuild(existingBuild ?? createEmptyBuild({ heroId: entry.id, name: `${entry.name} build` }));
    nameInput.value = build.name;
    if (gpmInput) gpmInput.value = String(build.gpm ?? 450);
    if (startGoldInput) startGoldInput.value = String(build.startingGold ?? 600);
    saveBtn.disabled = false;
    root.classList.remove("hidden");

    setStatus(`Loading live data for ${entry.name}…`);
    valveHero = null;

    try {
      valveHero = await fetchHeroData(entry.id, { force });
      hero = normalizeValveHeroForStats(valveHero);
      skillCtx = resolveHeroSkillLayout(heroKey, {
        valveHero,
        heroAbilities: data.heroAbilities,
        abilities: data.abilities,
      });
      talentTiers = resolveTalentTiers(heroKey, { valveHero, heroAbilities: data.heroAbilities });
    } catch (error) {
      hero = entry.hero ?? data.heroesById.get(entry.id);
      if (!hero) {
        setStatus(`Could not load hero data for ${entry.name}.`, true);
        return;
      }
      skillCtx = resolveHeroSkillLayout(heroKey, {
        heroAbilities: data.heroAbilities,
        abilities: data.abilities,
      });
      talentTiers = resolveTalentTiers(heroKey, { heroAbilities: data.heroAbilities });
      portraitImg.src = heroPortraitByKey(heroKey) ?? "";
      portraitImg.alt = entry.name;
      heroMetaEl.innerHTML = `
      <span class="builder-hero-meta__badge">${escapeHtml(hero.primary_attr?.toUpperCase() ?? "")}</span>
      <span class="builder-hero-meta__badge">${escapeHtml(hero.attack_type ?? "")}</span>
      ${(hero.roles ?? []).slice(0, 3).map((r) => `<span class="builder-hero-meta__role">${escapeHtml(r)}</span>`).join("")}
    `;
      popularity = null;
      loadItemPopularity(entry.id)
        .then((raw) => {
          popularity = resolveItemPopularityKeys(raw, data.itemKeyById);
        })
        .catch(() => {
          popularity = null;
        });
      renderAll();
      setStatus(`Using cached hero data for ${entry.name} (${error.message}).`, true);
      return;
    }

    portraitImg.src = heroPortraitByKey(heroKey) ?? "";
    portraitImg.alt = entry.name;
    heroMetaEl.innerHTML = `
      <span class="builder-hero-meta__badge">${escapeHtml(hero.primary_attr?.toUpperCase() ?? "")}</span>
      <span class="builder-hero-meta__badge">${escapeHtml(hero.attack_type ?? "")}</span>
      ${(hero.roles ?? []).slice(0, 3).map((r) => `<span class="builder-hero-meta__role">${escapeHtml(r)}</span>`).join("")}
    `;

    popularity = null;
    loadItemPopularity(entry.id)
      .then((raw) => {
        popularity = resolveItemPopularityKeys(raw, data.itemKeyById);
      })
      .catch(() => {
        popularity = null;
      });

    renderAll();
    const suffix = dataStatusSuffix();
    setStatus(
      fresh
        ? `Building ${entry.name}. ${suffix}`
        : `Loaded build for ${entry.name}. ${suffix}`
    );
  }

  function renderLevelBadge() {
    const level = currentHeroLevel(build);
    levelBadge.textContent = `Level ${level}`;
  }

  function renderAll() {
    renderLevelBadge();
    renderHeroNote();
    renderSkillGrid();
    renderTalents();
    renderUpgradeGrants();
    renderItemSlots();
    renderGoldCheckpoints();
    renderTimeline();
    renderStats();
    refreshSavedBuilds();
  }

  function renderHeroNote() {
    if (!heroNoteEl) return;
    if (skillCtx.layout === "lone_druid") {
      heroNoteEl.textContent =
        "Lone Druid: Spirit Bear mirrors your skill order at the same levels. Use the bear inventory below for the bear's items.";
      heroNoteEl.classList.remove("hidden");
    } else if (skillCtx.layout === "kez") {
      heroNoteEl.textContent =
        "Kez: Katana and Sai each have their own abilities; ultimate points apply to both stances.";
      heroNoteEl.classList.remove("hidden");
    } else {
      heroNoteEl.classList.add("hidden");
      heroNoteEl.textContent = "";
    }
  }

  function skillRows() {
    const rows = [];
    if (skillCtx.layout === "kez" && skillCtx.stances) {
      for (const stance of skillCtx.stances) {
        rows.push({ kind: "stance-head", label: stance.label });
        for (const key of stance.regular) {
          rows.push({ kind: "ability", key, isUltimate: false, stance: stance.id });
        }
        rows.push({ kind: "ability", key: stance.ultimate, isUltimate: true, stance: stance.id });
      }
    } else {
      for (const key of skillCtx.regular) rows.push({ kind: "ability", key, isUltimate: false });
      if (skillCtx.ultimate) rows.push({ kind: "ability", key: skillCtx.ultimate, isUltimate: true });
    }
    if (heroHasAttributeBonus(heroKey)) rows.push({ kind: "attribute" });
    return rows;
  }

  function abilityMatchesRow(entry, row) {
    if (!entry || entry.kind !== "ability") return false;
    if (entry.key === row.key) return true;
    if (row.isUltimate && skillCtx.linkedUltimates?.includes(row.key)) {
      return skillCtx.linkedUltimates.includes(entry.key);
    }
    return false;
  }

  function renderSkillGrid() {
    const rows = skillRows();
    const nextIdx = nextOpenLevelIndex(build);
    let html = "";

    html += `<div class="builder-skill-grid__corner"></div>`;
    for (let level = 1; level <= MAX_LEVEL; level += 1) {
      const isTalentCol = TALENT_TIER_LEVELS.includes(level);
      html += `<div class="builder-skill-grid__level-head${isTalentCol ? " builder-skill-grid__level-head--talent" : ""}">${level}</div>`;
    }

    for (const row of rows) {
      if (row.kind === "stance-head") {
        html += `<div class="builder-skill-row__label builder-skill-row__label--stance">${escapeHtml(row.label)}</div>`;
        for (let level = 1; level <= MAX_LEVEL; level += 1) {
          html += `<div class="builder-skill-cell builder-skill-cell--stance-head"></div>`;
        }
        continue;
      }

      const label =
        row.kind === "attribute"
          ? `<span class="builder-skill-row__name">Attribute Bonus</span>`
          : `<img src="${abilityIconByName(row.key)}" alt="" class="builder-skill-row__icon" loading="lazy" /><span class="builder-skill-row__name">${escapeHtml(abilityDisplayLabel(row.key))}</span>`;

      html += `<div class="builder-skill-row__label${row.isUltimate ? " builder-skill-row__label--ultimate" : ""}" title="${escapeHtml(abilityTooltip(row.key))}">${label}</div>`;

      const assignOpts = skillAssignOptions();
      const pointsSoFar =
        row.kind === "attribute"
          ? countAttributeBonusPoints(build)
          : countAbilityPoints(build, row.key, assignOpts);
      const maxPoints = row.kind === "attribute" ? ATTRIBUTE_BONUS_MAX_POINTS : row.isUltimate ? ULTIMATE_MAX_POINTS : 4;
      let pointsRendered = 0;

      for (let level = 1; level <= MAX_LEVEL; level += 1) {
        const idx = level - 1;
        const entry = build.skillOrder[idx];
        const isTalentCol = TALENT_TIER_LEVELS.includes(level);
        const matches =
          entry &&
          ((row.kind === "ability" && abilityMatchesRow(entry, row)) ||
            (row.kind === "attribute" && entry.kind === "attribute"));

        let cls = "builder-skill-cell";
        let title = "";
        if (isTalentCol) {
          cls += " builder-skill-cell--talent";
        } else if (matches) {
          pointsRendered += 1;
          cls += row.isUltimate ? " builder-skill-cell--ultimate-filled" : " builder-skill-cell--filled";
          if (idx === nextIdx - 1) cls += " builder-skill-cell--undo";
          title = `Level ${level}: point ${pointsRendered}/${maxPoints}`;
        } else if (idx === nextIdx) {
          const check =
            row.kind === "attribute"
              ? canAssignAttribute(build, heroKey)
              : canAssignAbility(build, skillCtx, row.key, assignOpts);
          if (check.ok) {
            cls += " builder-skill-cell--available";
            title = "Click to assign this level";
          } else {
            cls += " builder-skill-cell--blocked";
            title = check.reason;
          }
        } else {
          cls += " builder-skill-cell--empty";
        }

        html += `<button type="button" class="${cls}" data-row-kind="${row.kind}" data-row-key="${row.kind === "ability" ? row.key : ""}" data-level="${level}" title="${escapeHtml(title)}" ${isTalentCol ? "disabled" : ""}></button>`;
      }
    }

    skillGridEl.style.gridTemplateColumns = `160px repeat(${MAX_LEVEL}, 30px)`;
    skillGridEl.innerHTML = html;
    undoBtn.disabled = nextIdx === 0;
  }

  function renderTalents() {
    const nextIdx = nextOpenLevelIndex(build);
    const chosen = getChosenTalentSides(build);

    talentTiersEl.innerHTML = talentTiers
      .map((tier) => {
        const isNext = nextIdx + 1 === tier.level;
        const chosenSide = chosen[tier.tier];
        const renderOption = (side, name) => {
          if (!name) return "";
          const dname = talentDisplayLabel(name);
          const isChosen = chosenSide === side;
          const isLocked = !isNext && !isChosen;
          const cls = [
            "builder-talent-option",
            isChosen ? "builder-talent-option--chosen" : "",
            isNext && !chosenSide ? "builder-talent-option--ready" : "",
            isLocked ? "builder-talent-option--locked" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return `<button type="button" class="${cls}" data-talent-tier="${tier.tier}" data-talent-side="${side}" data-talent-name="${escapeHtml(name)}" ${isNext && !chosenSide ? "" : "disabled"}>${escapeHtml(dname)}</button>`;
        };

        return `
        <div class="builder-talent-tier ${isNext ? "builder-talent-tier--active" : ""}">
          <div class="builder-talent-tier__level">Lv ${tier.level}</div>
          ${renderOption("left", tier.left)}
          ${renderOption("right", tier.right)}
        </div>`;
      })
      .join("");
  }

  function renderUpgradeGrants() {
    if (!upgradeGrantsEl) return;
    const grants = skillCtx.grants ?? { shard: [], scepter: [] };
    const hasGrants = grants.shard.length || grants.scepter.length;
    if (!hasGrants) {
      upgradeGrantsEl.classList.add("hidden");
      upgradeGrantsEl.innerHTML = "";
      return;
    }

    const currentLevel = currentHeroLevel(build);
    const renderBlock = (kind, abilities, slotKind) => {
      if (!abilities.length) return "";
      const timing = build.upgradeTimings?.[slotKind];
      const owned = build.consumables?.[slotKind];
      const active = owned || (timing != null && timing <= currentLevel);
      const abilityCards = abilities
        .map(
          (a) =>
            `<div class="builder-grant-ability${active ? " builder-grant-ability--active" : ""}" title="${escapeHtml(formatValveAbilityLabel(a, valveHero))}">
              <img src="${abilityIconByName(a.name)}" alt="" loading="lazy" />
              <span>${escapeHtml(formatValveAbilityLabel(a, valveHero))}</span>
            </div>`
        )
        .join("");
      return `
        <div class="builder-upgrade-block">
          <div class="builder-upgrade-block__head">
            <strong>${escapeHtml(CONSUMABLE_SLOT_LABELS[slotKind] ?? slotKind)}</strong>
            <label class="builder-upgrade-timing">Target level
              <select data-upgrade-kind="${slotKind}">
                <option value="">—</option>
                ${Array.from({ length: MAX_LEVEL }, (_, i) => i + 1)
                  .map(
                    (lv) =>
                      `<option value="${lv}" ${Number(timing) === lv ? "selected" : ""}>${lv}</option>`
                  )
                  .join("")}
              </select>
            </label>
          </div>
          <div class="builder-grant-abilities">${abilityCards}</div>
        </div>`;
    };

    upgradeGrantsEl.innerHTML =
      renderBlock("shard", grants.shard, "shard") + renderBlock("scepter", grants.scepter, "scepter");
    upgradeGrantsEl.classList.remove("hidden");
  }

  function itemSlotHtml(itemKey, { kind, index, label }) {
    const item = itemKey ? data.items[itemKey] : null;
    const img = item ? `<img src="${itemIconUrl(item)}" alt="${escapeHtml(item.dname)}" loading="lazy" />` : "";
    const slotLabel = label ?? (item ? item.dname : "Empty slot");
    return `<button type="button" class="builder-item-slot${item ? " builder-item-slot--filled" : ""}" data-slot-kind="${kind}" data-slot-index="${index}" title="${escapeHtml(slotLabel)}">${img}${label && !item ? `<span class="builder-item-slot__hint">${escapeHtml(label)}</span>` : ""}</button>`;
  }

  function renderItemSlots() {
    itemSlotsEl.innerHTML = build.items
      .map((key, i) => itemSlotHtml(key, { kind: "main", index: i }))
      .join("");

    if (consumableSlotsEl) {
      consumableSlotsEl.innerHTML = CONSUMABLE_SLOT_KINDS.map((kind) =>
        itemSlotHtml(build.consumables?.[kind], {
          kind,
          index: 0,
          label: CONSUMABLE_SLOT_LABELS[kind],
        })
      ).join("");
    }

    neutralSlotEl.innerHTML = itemSlotHtml(build.neutralItem, { kind: "neutral", index: 0 });
    backpackSlotsEl.innerHTML = build.backpack
      .map((key, i) => itemSlotHtml(key, { kind: "backpack", index: i }))
      .join("");

    if (bearGroupEl && bearSlotsEl) {
      const showBear = heroUsesBearInventory(heroKey);
      bearGroupEl.classList.toggle("hidden", !showBear);
      if (showBear) {
        bearSlotsEl.innerHTML = (build.bearItems ?? [])
          .map((key, i) => itemSlotHtml(key, { kind: "bear", index: i }))
          .join("");
      }
    }

    const mainCost = totalItemCost(build.items, data.items);
    const neutralCost = totalItemCost([build.neutralItem], data.items);
    const consumableCost = totalItemCost(Object.values(build.consumables ?? {}), data.items);
    const backpackCost = totalItemCost(build.backpack, data.items);
    const bearCost = totalItemCost(build.bearItems ?? [], data.items);
    const timelineNet = totalTimelineNetCost(build.itemTimeline, data.items);
    costEl.textContent =
      `Inventory: ${mainCost + neutralCost + consumableCost}g · Timeline net: ${timelineNet}g · Backpack: ${backpackCost}g` +
      (bearCost ? ` · Bear: ${bearCost}g` : "");
  }

  function renderGoldCheckpoints() {
    if (!goldCheckpointsEl) return;
    const rows = goldCheckpointTable({
      gpm: build.gpm,
      startingGold: build.startingGold,
      timeline: build.itemTimeline,
      itemsData: data.items,
    });
    goldCheckpointsEl.innerHTML = rows
      .map(
        (row) =>
          `<div class="builder-gold-checkpoint"><span>${row.minute}m</span><strong>${Math.round(row.gold)}g</strong></div>`
      )
      .join("");
  }

  function renderTimeline() {
    if (!timelineListEl) return;
    const events = build.itemTimeline ?? [];
    if (!events.length) {
      timelineListEl.innerHTML = `<p class="builder-timeline__empty">No buy/sell events yet. Add purchases to track gold.</p>`;
      return;
    }
    timelineListEl.innerHTML = events
      .map((event) => {
        const item = data.items[event.itemKey];
        const delta = timelineGoldDelta(event, data.items);
        const sign = delta >= 0 ? "+" : "";
        return `
        <div class="builder-timeline__row" data-event-id="${escapeHtml(event.id)}">
          <span class="builder-timeline__minute">${event.minute}m</span>
          <span class="builder-timeline__action">${event.action === "sell" ? "Sell" : "Buy"}</span>
          <span class="builder-timeline__item">${escapeHtml(item?.dname ?? event.itemKey)}</span>
          <span class="builder-timeline__gold">${sign}${delta}g</span>
          <button type="button" class="builder-timeline__remove" data-remove-event="${escapeHtml(event.id)}" aria-label="Remove event">×</button>
        </div>`;
      })
      .join("");
  }

  function renderStats() {
    const level = Math.max(1, currentHeroLevel(build));
    const talentDnameByKey = valveHero
      ? new Map(
          (valveHero.talents ?? []).map((t) => [t.name, formatValveAbilityLabel(t, valveHero)])
        )
      : new Map(Object.entries(data.abilities).map(([key, a]) => [key, a.dname]));
    const extraAttrs = computeSkillAttributeBonus(build, {
      parseTalentAttributeBonus,
      talentDnameByKey,
    });
    const itemBonuses = computeItemBonuses(equippedItemKeys(build), data.items, {
      primaryAttr: hero.primary_attr,
    });
    const stats = computeDerivedStats(hero, level, extraAttrs, itemBonuses);

    const attributePoints = countAttributeBonusPoints(build);
    const cards = [
      { label: "Strength", value: fmt(stats.str, 1) },
      { label: "Agility", value: fmt(stats.agi, 1) },
      { label: "Intelligence", value: fmt(stats.int, 1) },
      { label: "Health", value: fmt(stats.health) },
      { label: "Mana", value: fmt(stats.mana) },
      { label: "Health regen", value: `${fmt(stats.healthRegen, 1)}/s` },
      { label: "Mana regen", value: `${fmt(stats.manaRegen, 1)}/s` },
      { label: "Armor", value: fmt(stats.armor, 1) },
      { label: "Magic resist", value: `${fmt(stats.magicResist, 1)}%` },
      { label: "Attack damage", value: `${fmt(stats.damageMin)}–${fmt(stats.damageMax)}` },
      { label: "Attack speed", value: `${fmt(stats.attacksPerSecond, 2)}/s` },
      { label: "Move speed", value: fmt(stats.moveSpeed) },
      { label: "Effective HP (phys.)", value: fmt(stats.effectiveHpPhysical) },
      {
        label: "Attribute Bonus",
        value: heroHasAttributeBonus(heroKey)
          ? `${attributePoints}/${ATTRIBUTE_BONUS_MAX_POINTS} (+${attributePoints * ATTRIBUTE_BONUS_PER_POINT} all)`
          : "N/A",
      },
    ];

    statsGridEl.innerHTML = cards
      .map(
        (c) => `
      <div class="summary-card">
        <div class="summary-card__label">${escapeHtml(c.label)}</div>
        <div class="summary-card__value" style="font-size:1.1rem">${escapeHtml(c.value)}</div>
      </div>`
      )
      .join("");
  }

  // ---- Skill grid interactions ----

  skillGridEl.addEventListener("click", (event) => {
    const cell = event.target.closest("button[data-level]");
    if (!cell || cell.disabled) return;
    const level = Number(cell.dataset.level);
    const idx = level - 1;
    const nextIdx = nextOpenLevelIndex(build);

    if (idx === nextIdx - 1) {
      undoLastPick(build);
      renderAll();
      return;
    }
    if (idx !== nextIdx) return;

    try {
      if (cell.dataset.rowKind === "attribute") {
        assignAttribute(build, heroKey);
      } else {
        assignAbility(build, skillCtx, cell.dataset.rowKey, skillAssignOptions());
      }
      renderAll();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  undoBtn.addEventListener("click", () => {
    undoLastPick(build);
    renderAll();
  });

  resetSkillsBtn.addEventListener("click", () => {
    resetSkillOrder(build);
    renderAll();
  });

  talentTiersEl.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-talent-tier]");
    if (!btn || btn.disabled) return;
    const tier = Number(btn.dataset.talentTier);
    const side = btn.dataset.talentSide;
    const name = btn.dataset.talentName;
    try {
      assignTalent(build, tier, side, name);
      renderAll();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  // ---- Item picker ----

  function openPicker(kind, index) {
    pickerState = { kind, index, qual: pickerState.qual ?? "all" };
    let current = null;
    if (kind === "main") current = build.items[index];
    else if (kind === "backpack") current = build.backpack[index];
    else if (kind === "neutral") current = build.neutralItem;
    else if (kind === "bear") current = build.bearItems?.[index];
    else if (CONSUMABLE_SLOT_KINDS.includes(kind)) current = build.consumables?.[kind];

    pickerRemoveBtn.disabled = !current;
    pickerSearch.value = "";
    renderPickerTabs();
    renderPickerList("");
    pickerModal.classList.remove("hidden");
    pickerModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    pickerSearch.focus();
  }

  function closePicker() {
    pickerModal.classList.add("hidden");
    pickerModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function renderPickerTabs() {
    pickerTabsEl.innerHTML = QUAL_ORDER.map(
      (q) =>
        `<button type="button" class="builder-item-tab${q === pickerState.qual ? " builder-item-tab--active" : ""}" data-qual="${q}">${QUAL_LABELS[q]}</button>`
    ).join("");
  }

  function popularityScore(itemKey) {
    if (!popularity) return 0;
    return (
      (popularity.start.get(itemKey) ?? 0) +
      (popularity.early.get(itemKey) ?? 0) +
      (popularity.mid.get(itemKey) ?? 0) +
      (popularity.late.get(itemKey) ?? 0)
    );
  }

  function pickerItemAllowed(key) {
    if (CONSUMABLE_SLOT_KINDS.includes(pickerState.kind)) {
      return isConsumableSlotItem(pickerState.kind, key);
    }
    if (pickerState.kind === "main" || pickerState.kind === "backpack" || pickerState.kind === "bear") {
      return isMainInventoryItem(key, data.items);
    }
    return true;
  }

  function renderPickerList(query) {
    const q = query.trim().toLowerCase();
    let entries = Object.entries(data.items).filter(([, item]) => item.dname);
    if (pickerState.qual !== "all") {
      entries = entries.filter(([, item]) => item.qual === pickerState.qual);
    }
    entries = entries.filter(([key]) => pickerItemAllowed(key));
    if (q) {
      entries = entries.filter(([, item]) => item.dname.toLowerCase().includes(q));
    }
    entries.sort((a, b) => {
      const scoreDiff = popularityScore(b[0]) - popularityScore(a[0]);
      if (scoreDiff !== 0) return scoreDiff;
      return (a[1].cost ?? 0) - (b[1].cost ?? 0);
    });

    if (!entries.length) {
      pickerListEl.innerHTML = `<p class="builder-item-list__empty">No items match.</p>`;
      return;
    }

    pickerListEl.innerHTML = entries
      .map(([key, item]) => {
        const score = popularityScore(key);
        const badge = score > 0 ? `<span class="builder-item-card__badge">Popular · ${score}</span>` : "";
        return `
        <button type="button" class="builder-item-card" data-item-key="${key}" title="${escapeHtml(item.dname)}">
          <img src="${itemIconUrl(item)}" alt="" loading="lazy" />
          <span class="builder-item-card__name">${escapeHtml(item.dname)}</span>
          <span class="builder-item-card__cost">${item.cost ?? 0}g</span>
          ${badge}
        </button>`;
      })
      .join("");
  }

  consumableSlotsEl?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-slot-kind]");
    if (!btn) return;
    openPicker(btn.dataset.slotKind, Number(btn.dataset.slotIndex));
  });
  bearSlotsEl?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-slot-kind]");
    if (!btn) return;
    openPicker(btn.dataset.slotKind, Number(btn.dataset.slotIndex));
  });

  itemSlotsEl.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-slot-kind]");
    if (!btn) return;
    openPicker(btn.dataset.slotKind, Number(btn.dataset.slotIndex));
  });
  neutralSlotEl.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-slot-kind]");
    if (!btn) return;
    openPicker(btn.dataset.slotKind, Number(btn.dataset.slotIndex));
  });
  backpackSlotsEl.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-slot-kind]");
    if (!btn) return;
    openPicker(btn.dataset.slotKind, Number(btn.dataset.slotIndex));
  });

  pickerModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-modal-close]")) closePicker();
  });

  pickerTabsEl.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-qual]");
    if (!btn) return;
    pickerState.qual = btn.dataset.qual;
    renderPickerTabs();
    renderPickerList(pickerSearch.value);
  });

  pickerSearch.addEventListener("input", () => renderPickerList(pickerSearch.value));

  pickerListEl.addEventListener("click", (event) => {
    const card = event.target.closest("[data-item-key]");
    if (!card) return;
    applyPicked(card.dataset.itemKey);
  });

  pickerRemoveBtn.addEventListener("click", () => applyPicked(null));

  function applyPicked(itemKey) {
    const kind = pickerState.kind;
    if (kind === "main") setItemSlot(build, pickerState.index, itemKey);
    else if (kind === "backpack") setBackpackSlot(build, pickerState.index, itemKey);
    else if (kind === "neutral") setNeutralItem(build, itemKey);
    else if (kind === "bear") setBearItemSlot(build, pickerState.index, itemKey);
    else if (CONSUMABLE_SLOT_KINDS.includes(kind)) setConsumableSlot(build, kind, itemKey);
    closePicker();
    renderItemSlots();
    renderStats();
    renderUpgradeGrants();
  }

  // ---- Gold, timeline, upgrades ----

  gpmInput?.addEventListener("change", () => {
    if (!build) return;
    build.gpm = Number(gpmInput.value) || 450;
    renderGoldCheckpoints();
    renderItemSlots();
  });

  startGoldInput?.addEventListener("change", () => {
    if (!build) return;
    build.startingGold = Number(startGoldInput.value) || 600;
    renderGoldCheckpoints();
    renderItemSlots();
  });

  timelineAddBtn?.addEventListener("click", () => {
    if (!build || !data) return;
    const minute = Number(window.prompt("Minute of game (0–60):", "10"));
    if (!Number.isFinite(minute)) return;
    const action = window.confirm("OK = Buy, Cancel = Sell (50% refund)") ? "buy" : "sell";
    const query = window.prompt("Item name search (partial match):", "");
    if (!query) return;
    const match = Object.entries(data.items).find(([, item]) =>
      item.dname?.toLowerCase().includes(query.trim().toLowerCase())
    );
    if (!match) {
      setStatus(`No item matching “${query}”.`, true);
      return;
    }
    addTimelineEvent(build, {
      minute,
      action,
      itemKey: match[0],
      slotKind: classifyTimelineSlot(match[0]),
    });
    renderTimeline();
    renderGoldCheckpoints();
    renderItemSlots();
  });

  function classifyTimelineSlot(itemKey) {
    for (const kind of CONSUMABLE_SLOT_KINDS) {
      if (CONSUMABLE_ITEM_KEYS[kind]?.has(itemKey)) return kind;
    }
    return "main";
  }

  timelineListEl?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-remove-event]");
    if (!btn || !build) return;
    removeTimelineEvent(build, btn.dataset.removeEvent);
    renderTimeline();
    renderGoldCheckpoints();
    renderItemSlots();
  });

  upgradeGrantsEl?.addEventListener("change", (event) => {
    const select = event.target.closest("[data-upgrade-kind]");
    if (!select || !build) return;
    const kind = select.dataset.upgradeKind;
    const level = select.value ? Number(select.value) : null;
    setUpgradeTiming(build, kind, level);
    renderUpgradeGrants();
  });

  // ---- Import from cache ----

  async function openImportModal() {
    if (!hero || !build) {
      setStatus("Pick a hero first.");
      return;
    }
    const accountId = Number(options.getDefaultAccountId?.());
    if (!accountId) {
      setStatus("Set your Account ID on the Analyze tab to import cached matches.", true);
      return;
    }
    importDescEl.textContent = `Cached matches for account ${accountId} on ${hero.localized_name ?? heroSearch.value}.`;
    importListEl.innerHTML = `<li class="builder-import-list__loading">Loading cached matches…</li>`;
    importModal.classList.remove("hidden");
    importModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    try {
      const rows = await listCachedMatchImports({
        accountId,
        heroId: hero.id,
        heroNameById: data?.heroesById,
      });
      if (!rows.length) {
        importListEl.innerHTML = `<li class="builder-import-list__empty">No cached matches for this hero. Run an analysis on the Analyze tab first.</li>`;
        return;
      }
      importListEl.innerHTML = rows
        .map(
          (row) =>
            `<li><button type="button" class="builder-import-option" data-match-id="${row.matchId}">${escapeHtml(row.label)}${row.gpm ? ` · ${row.gpm} GPM` : ""}</button></li>`
        )
        .join("");
    } catch (error) {
      importListEl.innerHTML = `<li class="builder-import-list__empty">${escapeHtml(error.message)}</li>`;
    }
  }

  function closeImportModal() {
    importModal?.classList.add("hidden");
    importModal?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  importBtn?.addEventListener("click", () => void openImportModal());
  importModal?.addEventListener("click", (event) => {
    if (event.target.closest("[data-modal-close]")) closeImportModal();
  });
  importListEl?.addEventListener("click", async (event) => {
    const btn = event.target.closest(".builder-import-option");
    if (!btn || !hero) return;
    const accountId = Number(options.getDefaultAccountId?.());
    const rows = await listCachedMatchImports({
      accountId,
      heroId: hero.id,
      heroNameById: data?.heroesById,
    });
    const row = rows.find((r) => String(r.matchId) === btn.dataset.matchId);
    if (!row) return;
    build = importBuildFromMatchPlayer({
      player: row.player,
      heroId: hero.id,
      heroKey,
      valveHero,
      skillCtx,
      itemsData: data.items,
      itemKeyById: data.itemKeyById,
      matchLabel: `${hero.localized_name ?? heroSearch.value} · ${row.label}`,
    });
    nameInput.value = build.name;
    if (gpmInput) gpmInput.value = String(build.gpm);
    if (startGoldInput) startGoldInput.value = String(build.startingGold);
    closeImportModal();
    renderAll();
    setStatus(`Imported build from match ${row.matchId}. ${dataStatusSuffix()}`);
  });

  // ---- Hero search ----

  heroSearch.addEventListener("input", () => renderHeroSuggestions(heroSearch.value));
  heroSearch.addEventListener("focus", () => renderHeroSuggestions(heroSearch.value));
  heroSearch.addEventListener("blur", () => {
    setTimeout(() => heroSuggestions.classList.add("hidden"), 150);
  });
  heroSuggestions.addEventListener("mousedown", (e) => e.preventDefault());
  heroSuggestions.addEventListener("click", (event) => {
    const option = event.target.closest("[data-hero-id]");
    if (!option) return;
    void selectHero(Number(option.dataset.heroId));
  });

  // ---- Save/load/delete ----

  saveBtn.addEventListener("click", async () => {
    if (!build) return;
    build.name = nameInput.value.trim() || build.name;
    build.updatedAt = Date.now();
    try {
      await saveBuild(cloneBuild(build));
      setStatus(`Saved “${build.name}”.`);
      await refreshSavedBuilds();
    } catch (error) {
      setStatus(`Could not save build: ${error.message}`, true);
    }
  });

  newBtn.addEventListener("click", () => {
    if (!hero) {
      setStatus("Pick a hero first.");
      return;
    }
    build = normalizeBuild(createEmptyBuild({ heroId: hero.id, name: `${hero.localized_name} build` }));
    nameInput.value = build.name;
    savedSelect.value = "";
    deleteBtn.disabled = true;
    renderAll();
    setStatus(`Started a new build for ${hero.localized_name}.`);
  });

  deleteBtn.addEventListener("click", async () => {
    if (!build?.id) return;
    if (!savedBuilds.some((b) => b.id === build.id)) return;
    await deleteBuild(build.id);
    setStatus(`Deleted “${build.name}”.`);
    newBtn.click();
    await refreshSavedBuilds();
  });

  savedSelect.addEventListener("change", async () => {
    const id = savedSelect.value;
    if (!id) return;
    const stored = await getBuild(id);
    if (!stored) return;
    await ensureData();
    await selectHero(stored.heroId, { fresh: false, existingBuild: stored });
    deleteBtn.disabled = false;
  });

  refreshBtn?.addEventListener("click", async () => {
    const prevHeroId = hero?.id;
    const prevBuild = build ? cloneBuild(build) : null;
    setStatus("Refreshing game data from Valve…");
    clearDotaDataCache();
    clearValvePatchCache();
    if (prevHeroId) clearValveHeroCache(prevHeroId);
    data = null;
    valveHero = null;
    try {
      await ensureData({ force: true });
      if (prevHeroId) {
        await selectHero(prevHeroId, { fresh: false, existingBuild: prevBuild, force: true });
      } else {
        setStatus(`Game data refreshed. ${dataStatusSuffix()}`);
      }
    } catch (error) {
      setStatus(`Could not refresh game data: ${error.message}`, true);
    }
  });

  nameInput.addEventListener("change", () => {
    if (build) build.name = nameInput.value.trim() || build.name;
  });

  // ---- Init ----

  ensureData()
    .then(async () => {
      await refreshSavedBuilds();
      const defaultHeroId = options.getDefaultHeroId?.();
      if (defaultHeroId && heroList.some((h) => h.id === Number(defaultHeroId))) {
        await selectHero(defaultHeroId);
      } else {
        setStatus(`Pick a hero to start building. ${dataStatusSuffix()}`);
      }
    })
    .catch((error) => {
      setStatus(`Could not load hero/item data: ${error.message}`, true);
    });
}
