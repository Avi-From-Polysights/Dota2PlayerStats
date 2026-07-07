import { abilityIconUrl, heroIconUrl, heroPortraitUrl, itemIconUrl } from "./dota-cdn.js";
import { loadDotaData, loadItemPopularity, resolveItemPopularityKeys } from "./dota-data.js";
import { normalizeHeroQuery } from "./hero-picker.js";
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
  "consumable",
  "component",
  "common",
  "rare",
  "epic",
  "artifact",
  "secret_shop",
];

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

  let data = null; // { heroesById, heroAbilities, abilities, items, itemKeyById }
  let heroList = []; // [{ id, name, key, hero }]
  let hero = null;
  let heroKey = null;
  let skillCtx = { regular: [], ultimate: null, innate: [] };
  let talentTiers = [];
  let build = null;
  let savedBuilds = [];
  let popularity = null; // resolved { start, early, mid, late } Maps
  let pickerState = { kind: null, index: null, qual: QUAL_ORDER[0] };

  function setStatus(text, isError = false) {
    statusEl.textContent = text;
    statusEl.classList.toggle("builder-status--error", isError);
  }

  async function ensureData() {
    if (data) return data;
    setStatus("Loading hero, ability, and item data…");
    data = await loadDotaData();
    heroList = [...data.heroesById.values()]
      .map((h) => ({ id: h.id, key: h.name, name: h.localized_name, hero: h }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return data;
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
        <img src="${heroIconUrl(h.hero)}" alt="" class="builder-hero-option__icon" loading="lazy" />
        <span>${escapeHtml(h.name)}</span>
      </li>`
      )
      .join("");
    heroSuggestions.classList.remove("hidden");
  }

  function selectHero(heroId, { fresh = true, existingBuild = null } = {}) {
    const entry = heroList.find((h) => h.id === Number(heroId));
    if (!entry) return;

    hero = entry.hero;
    heroKey = entry.key;
    heroSearch.value = entry.name;
    heroSuggestions.classList.add("hidden");

    skillCtx = getSkillableAbilities(heroKey, data.heroAbilities, data.abilities);
    talentTiers = getTalentTiers(heroKey, data.heroAbilities);

    build = existingBuild ?? createEmptyBuild({ heroId: entry.id, name: `${entry.name} build` });
    nameInput.value = build.name;
    saveBtn.disabled = false;
    root.classList.remove("hidden");

    portraitImg.src = heroPortraitUrl(hero);
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
    setStatus(fresh ? `Building ${entry.name}. Pick abilities, talents, and items below.` : `Loaded build for ${entry.name}.`);
  }

  function renderAll() {
    renderLevelBadge();
    renderSkillGrid();
    renderTalents();
    renderItemSlots();
    renderStats();
    refreshSavedBuilds();
  }

  function renderLevelBadge() {
    const level = currentHeroLevel(build);
    levelBadge.textContent = `Level ${level}`;
  }

  function skillRows() {
    const rows = skillCtx.regular.map((key) => ({ kind: "ability", key, isUltimate: false }));
    if (skillCtx.ultimate) rows.push({ kind: "ability", key: skillCtx.ultimate, isUltimate: true });
    if (heroHasAttributeBonus(heroKey)) rows.push({ kind: "attribute" });
    return rows;
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
      const label =
        row.kind === "attribute"
          ? `<span class="builder-skill-row__name">Attribute Bonus</span>`
          : `<img src="${abilityIconUrl(data.abilities[row.key])}" alt="" class="builder-skill-row__icon" loading="lazy" /><span class="builder-skill-row__name">${escapeHtml(data.abilities[row.key]?.dname ?? row.key)}</span>`;

      html += `<div class="builder-skill-row__label${row.isUltimate ? " builder-skill-row__label--ultimate" : ""}" title="${escapeHtml(data.abilities[row.key]?.desc ?? "")}">${label}</div>`;

      const pointsSoFar = row.kind === "attribute" ? countAttributeBonusPoints(build) : countAbilityPoints(build, row.key);
      const maxPoints = row.kind === "attribute" ? ATTRIBUTE_BONUS_MAX_POINTS : row.isUltimate ? ULTIMATE_MAX_POINTS : 4;
      let pointsRendered = 0;

      for (let level = 1; level <= MAX_LEVEL; level += 1) {
        const idx = level - 1;
        const entry = build.skillOrder[idx];
        const isTalentCol = TALENT_TIER_LEVELS.includes(level);
        const matches =
          entry &&
          ((row.kind === "ability" && entry.kind === "ability" && entry.key === row.key) ||
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
              : canAssignAbility(build, skillCtx, row.key);
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
          const dname = talentLabel(data.abilities[name]?.dname, name);
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

  function itemSlotHtml(itemKey, { kind, index }) {
    const item = itemKey ? data.items[itemKey] : null;
    const img = item ? `<img src="${itemIconUrl(item)}" alt="${escapeHtml(item.dname)}" loading="lazy" />` : "";
    return `<button type="button" class="builder-item-slot${item ? " builder-item-slot--filled" : ""}" data-slot-kind="${kind}" data-slot-index="${index}" title="${item ? escapeHtml(item.dname) : "Empty slot"}">${img}</button>`;
  }

  function renderItemSlots() {
    itemSlotsEl.innerHTML = build.items
      .map((key, i) => itemSlotHtml(key, { kind: "main", index: i }))
      .join("");
    neutralSlotEl.innerHTML = itemSlotHtml(build.neutralItem, { kind: "neutral", index: 0 });
    backpackSlotsEl.innerHTML = build.backpack
      .map((key, i) => itemSlotHtml(key, { kind: "backpack", index: i }))
      .join("");

    const mainCost = totalItemCost(build.items, data.items);
    const neutralCost = totalItemCost([build.neutralItem], data.items);
    const backpackCost = totalItemCost(build.backpack, data.items);
    costEl.textContent = `Inventory: ${mainCost + neutralCost}g  ·  Backpack (not counted in stats): ${backpackCost}g  ·  Total: ${mainCost + neutralCost + backpackCost}g`;
  }

  function renderStats() {
    const level = Math.max(1, currentHeroLevel(build));
    const talentDnameByKey = new Map(
      Object.entries(data.abilities).map(([key, a]) => [key, a.dname])
    );
    const extraAttrs = computeSkillAttributeBonus(build, {
      parseTalentAttributeBonus,
      talentDnameByKey,
    });
    const itemBonuses = computeItemBonuses(
      [...build.items, build.neutralItem],
      data.items,
      { primaryAttr: hero.primary_attr }
    );
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
        assignAbility(build, skillCtx, cell.dataset.rowKey);
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
    pickerState = { kind, index, qual: pickerState.qual };
    const current =
      kind === "main" ? build.items[index] : kind === "backpack" ? build.backpack[index] : build.neutralItem;
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

  function renderPickerList(query) {
    const q = query.trim().toLowerCase();
    let entries = Object.entries(data.items).filter(([, item]) => item.qual === pickerState.qual && item.dname);
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
    if (pickerState.kind === "main") setItemSlot(build, pickerState.index, itemKey);
    else if (pickerState.kind === "backpack") setBackpackSlot(build, pickerState.index, itemKey);
    else if (pickerState.kind === "neutral") setNeutralItem(build, itemKey);
    closePicker();
    renderItemSlots();
    renderStats();
  }

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
    selectHero(Number(option.dataset.heroId));
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
    build = createEmptyBuild({ heroId: hero.id, name: `${hero.localized_name} build` });
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
    selectHero(stored.heroId, { fresh: false, existingBuild: stored });
    deleteBtn.disabled = false;
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
        selectHero(defaultHeroId);
      } else {
        setStatus("Pick a hero to start building.");
      }
    })
    .catch((error) => {
      setStatus(`Could not load hero/item data: ${error.message}`, true);
    });
}
