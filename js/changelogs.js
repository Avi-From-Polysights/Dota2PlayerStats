import { APP_VERSION } from "./version.js";
import { CHANGELOGS, DOTA_IMG, SECTION_ICONS } from "./changelog-data.js";
import { animateChangelogPatch, prefersReducedMotion } from "./motion.js";

function escHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

const TYPE_LABELS = {
  added: "New",
  changed: "Changed",
  fixed: "Fix",
  removed: "Removed",
};

function renderChangeItem(item) {
  const label = TYPE_LABELS[item.type] ?? "Note";
  return `
    <li class="changelog-change changelog-change--${escHtml(item.type)}">
      <span class="changelog-change__badge">${escHtml(label)}</span>
      <span class="changelog-change__text">${escHtml(item.text)}</span>
    </li>
  `;
}

function renderSection(section) {
  const icon = SECTION_ICONS[section.id] ?? DOTA_IMG.logo;
  return `
    <details class="changelog-section" open data-changelog-section>
      <summary class="changelog-section__summary">
        <img class="changelog-section__icon" src="${icon}" alt="" width="32" height="32" loading="lazy" />
        <span class="changelog-section__title">${escHtml(section.title)}</span>
        <span class="changelog-section__chevron" aria-hidden="true"></span>
      </summary>
      <ul class="changelog-section__list">
        ${section.items.map(renderChangeItem).join("")}
      </ul>
    </details>
  `;
}

function renderPatch(patch, { active = false } = {}) {
  return `
    <article
      class="changelog-patch${active ? " changelog-patch--active" : ""}"
      data-patch-version="${escHtml(patch.version)}"
      style="--patch-accent: ${escHtml(patch.accent)}"
      ${active ? "" : "hidden"}
    >
      <header class="changelog-patch__hero">
        <div class="changelog-patch__hero-bg" style="background-image: url('${DOTA_IMG.patchBg}')"></div>
        <div class="changelog-patch__hero-overlay"></div>
        <img class="changelog-patch__hero-icon" src="${patch.heroImage}" alt="" width="96" height="96" loading="lazy" />
        <div class="changelog-patch__hero-text">
          <p class="changelog-patch__label">Gameplay Update</p>
          <h2 class="changelog-patch__version">v${escHtml(patch.version)}</h2>
          <p class="changelog-patch__title">${escHtml(patch.title)}</p>
          <p class="changelog-patch__tagline">${escHtml(patch.tagline)}</p>
          <time class="changelog-patch__date" datetime="${escHtml(patch.date)}">${formatDate(patch.date)}</time>
        </div>
      </header>
      <div class="changelog-patch__body">
        ${patch.sections.map(renderSection).join("")}
      </div>
    </article>
  `;
}

function renderVersionNav(patches, activeVersion) {
  return patches
    .map(
      (patch) => `
      <button
        type="button"
        class="changelog-nav__pill${patch.version === activeVersion ? " changelog-nav__pill--active" : ""}"
        data-version="${escHtml(patch.version)}"
        style="--pill-accent: ${escHtml(patch.accent)}"
      >
        v${escHtml(patch.version)}
      </button>
    `
    )
    .join("");
}

function showPatch(root, version) {
  root.querySelectorAll("[data-patch-version]").forEach((el) => {
    const show = el.dataset.patchVersion === version;
    el.hidden = !show;
    el.classList.toggle("changelog-patch--active", show);
  });

  root.querySelectorAll("[data-version]").forEach((btn) => {
    btn.classList.toggle("changelog-nav__pill--active", btn.dataset.version === version);
  });

  const patchEl = root.querySelector(`[data-patch-version="${version}"]`);
  if (patchEl && !prefersReducedMotion()) {
    animateChangelogPatch(patchEl);
  }
}

export function initChangelogs() {
  const root = document.getElementById("changelog-root");
  if (!root) return;

  const defaultVersion =
    CHANGELOGS.find((p) => p.version === APP_VERSION)?.version ?? CHANGELOGS[0]?.version;

  root.innerHTML = `
    <div class="changelog-page">
      <header class="changelog-page__head motion-rise">
        <img class="changelog-page__logo" src="${DOTA_IMG.logo}" alt="" width="48" height="48" />
        <div>
          <h2 class="changelog-page__title">Patch Notes</h2>
          <p class="changelog-page__desc">Dota 2 Player Stats updates, presented like a gameplay patch. Newest first.</p>
        </div>
      </header>
      <nav class="changelog-nav" aria-label="Version history">
        <div class="changelog-nav__scroll" data-changelog-nav>
          ${renderVersionNav(CHANGELOGS, defaultVersion)}
        </div>
      </nav>
      <div class="changelog-patches" data-changelog-patches>
        ${CHANGELOGS.map((p) => renderPatch(p, { active: p.version === defaultVersion })).join("")}
      </div>
      <p class="changelog-page__footer">
        Imagery from
        <a href="https://www.dota2.com/" target="_blank" rel="noopener">Dota 2</a>
        / Valve. This is a fan stats tool, not affiliated with Valve.
      </p>
    </div>
  `;

  const initial = root.querySelector(`[data-patch-version="${defaultVersion}"]`);
  if (initial) {
    initial.hidden = false;
    initial.classList.add("changelog-patch--active");
  }

  root.querySelector("[data-changelog-nav]")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-version]");
    if (!btn) return;
    showPatch(root, btn.dataset.version);
  });

  root.querySelectorAll("[data-changelog-section]").forEach((details) => {
    details.addEventListener("toggle", () => {
      if (!details.open || prefersReducedMotion()) return;
      const list = details.querySelector(".changelog-section__list");
      if (list) animateChangelogPatch(list);
    });
  });

  if (initial && !prefersReducedMotion()) {
    requestAnimationFrame(() => animateChangelogPatch(initial));
  }
}
