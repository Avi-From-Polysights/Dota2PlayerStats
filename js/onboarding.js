import { activateMainTab } from "./tabs.js";

export const ONBOARDING_STORAGE_KEY = "d2ps-onboarding-complete-v1";

/** @typedef {'top' | 'bottom' | 'left' | 'right' | 'center' | 'auto'} TutorialPlacement */

/**
 * @typedef {object} TutorialStep
 * @property {string} id
 * @property {string | null} target CSS selector; null = centered welcome step
 * @property {'analyze' | 'tools' | 'changelogs'} [tab]
 * @property {string} title
 * @property {string} body
 * @property {TutorialPlacement} [placement]
 * @property {(ctx: { root: HTMLElement }) => void | Promise<void>} [beforeShow]
 */

/** @type {TutorialStep[]} */
export const TUTORIAL_STEPS = [
  {
    id: "welcome",
    target: null,
    tab: "analyze",
    placement: "center",
    title: "Welcome to Dota 2 Player Stats",
    body:
      "This quick tour shows how to analyze hero matchups, lane win rates, and trends from OpenDota. You can skip anytime or replay it from Tools → Guided tour.",
  },
  {
    id: "account",
    target: "#account-id",
    tab: "analyze",
    placement: "bottom",
    title: "Steam account ID",
    body:
      "Enter your numeric Steam32 account ID. Saved accounts appear below after your first successful run — pick one to fill the field quickly.",
  },
  {
    id: "hero",
    target: "#hero-combobox",
    tab: "analyze",
    placement: "bottom",
    title: "Hero filter",
    body:
      "Search and pick the hero you want stats for. Matchup tables, lane charts, and win-rate trends all focus on this hero.",
  },
  {
    id: "match-scope",
    target: "#match-scope-section",
    tab: "analyze",
    placement: "bottom",
    beforeShow: ({ root }) => {
      root.querySelector("#match-scope-section")?.setAttribute("open", "");
    },
    title: "Match scope",
    body:
      "Limit how many matches to load, filter by patch, exclude Turbo, require ranked only, or use OpenDota’s “significant” filter for less casual data.",
  },
  {
    id: "parse",
    target: "#parse-options",
    tab: "analyze",
    placement: "bottom",
    beforeShow: ({ root }) => {
      root.querySelector("#parse-options")?.setAttribute("open", "");
    },
    title: "Replay parsing",
    body:
      "Enable parse requests for lane stats from replays. Optional STRATZ fallback fills lane roles when OpenDota parse is slow or unavailable.",
  },
  {
    id: "analyze",
    target: "#fetch-btn",
    tab: "analyze",
    placement: "top",
    title: "Run analysis",
    body:
      "Click Analyze matches to fetch history, parse replays when enabled, and build matchup tables with Wilson confidence intervals.",
  },
  {
    id: "results",
    target: ".config-panel",
    tab: "analyze",
    placement: "bottom",
    title: "Results below",
    body:
      "After a run, summary cards, data-quality warnings, lane charts, and the enemy matchup table appear under the parameters panel.",
  },
  {
    id: "tabs",
    target: ".main-tabs",
    tab: "analyze",
    placement: "bottom",
    title: "App sections",
    body:
      "Switch tabs anytime: Analyze for stats, Tools for batch parse jobs, and Changelogs for release notes.",
  },
  {
    id: "tools",
    target: "#tutorial-tool-accordion",
    tab: "tools",
    placement: "bottom",
    beforeShow: ({ root }) => {
      root.querySelector("#tutorial-tool-accordion")?.setAttribute("open", "");
    },
    title: "Batch tools",
    body:
      "Tools run longer jobs (parse all matches, full history, retry failures) with the same filters as Analyze. Use Guided tour here anytime to replay this walkthrough.",
  },
  {
    id: "footer",
    target: ".footer-bar__actions",
    tab: "analyze",
    placement: "top",
    title: "Share & cache",
    body:
      "Copy a share link with your current settings, clear locally cached matches, or open GitHub for issues and source code.",
  },
  {
    id: "done",
    target: null,
    tab: "analyze",
    placement: "center",
    title: "You’re ready",
    body:
      "Enter an account and hero, then run Analyze. Check the data-quality panel if lane stats look sparse. Have fun climbing!",
  },
];

export function isOnboardingComplete(storage = localStorage) {
  try {
    return storage.getItem(ONBOARDING_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markOnboardingComplete(storage = localStorage) {
  try {
    storage.setItem(ONBOARDING_STORAGE_KEY, "1");
  } catch {
    // private mode
  }
}

export function resetOnboardingStorage(storage = localStorage) {
  try {
    storage.removeItem(ONBOARDING_STORAGE_KEY);
  } catch {
    // private mode
  }
}

const PAD = 8;
const POPOVER_GAP = 14;

function ensureTargetVisible(el) {
  let node = el.parentElement;
  while (node) {
    if (node instanceof HTMLDetailsElement) node.open = true;
    node = node.parentElement;
  }
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function createTourDom() {
  const root = document.createElement("div");
  root.id = "tutorial-root";
  root.className = "tutorial hidden";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.innerHTML = `
    <div class="tutorial__backdrop" data-tutorial-action="block"></div>
    <div class="tutorial__spotlight" aria-hidden="true"></div>
    <div class="tutorial__popover" role="document">
      <p class="tutorial__step" aria-live="polite"></p>
      <h2 class="tutorial__title"></h2>
      <p class="tutorial__body"></p>
      <div class="tutorial__actions">
        <button type="button" class="btn btn--outline btn--sm tutorial__skip" data-tutorial-action="skip">Skip tour</button>
        <div class="tutorial__nav">
          <button type="button" class="btn btn--outline btn--sm tutorial__back" data-tutorial-action="back">Back</button>
          <button type="button" class="btn btn--primary btn--sm tutorial__next" data-tutorial-action="next">Next</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(root);
  return root;
}

/**
 * @param {{ autoStart?: boolean }} [options]
 */
export function initOnboarding({ autoStart = true } = {}) {
  const restartBtn = document.getElementById("tutorial-restart-btn");
  let root = document.getElementById("tutorial-root");
  if (!root) root = createTourDom();

  const spotlight = root.querySelector(".tutorial__spotlight");
  const popover = root.querySelector(".tutorial__popover");
  const stepEl = root.querySelector(".tutorial__step");
  const titleEl = root.querySelector(".tutorial__title");
  const bodyEl = root.querySelector(".tutorial__body");
  const backBtn = root.querySelector(".tutorial__back");
  const nextBtn = root.querySelector(".tutorial__next");

  let index = 0;
  let active = false;
  let resizeObserver = null;

  const layout = () => {
    if (!active) return;
    const step = TUTORIAL_STEPS[index];
    if (!step?.target) {
      spotlight.classList.add("hidden");
      popover.classList.add("tutorial__popover--center");
      popover.style.top = "";
      popover.style.left = "";
      popover.style.right = "";
      popover.style.bottom = "";
      return;
    }

    const target = document.querySelector(step.target);
    if (!target) {
      spotlight.classList.add("hidden");
      return;
    }

    ensureTargetVisible(target);
    const rect = target.getBoundingClientRect();
    const top = rect.top - PAD;
    const left = rect.left - PAD;
    const width = rect.width + PAD * 2;
    const height = rect.height + PAD * 2;

    spotlight.classList.remove("hidden");
    spotlight.style.top = `${top}px`;
    spotlight.style.left = `${left}px`;
    spotlight.style.width = `${width}px`;
    spotlight.style.height = `${height}px`;

    popover.classList.remove("tutorial__popover--center");
    const popRect = popover.getBoundingClientRect();
    const placement = step.placement === "auto" ? "bottom" : step.placement;
    const margin = 12;
    let popTop = 0;
    let popLeft = 0;

    if (placement === "center") {
      popover.classList.add("tutorial__popover--center");
      return;
    }

    if (placement === "bottom") {
      popTop = top + height + POPOVER_GAP;
      popLeft = left + width / 2 - popRect.width / 2;
    } else if (placement === "top") {
      popTop = top - popRect.height - POPOVER_GAP;
      popLeft = left + width / 2 - popRect.width / 2;
    } else if (placement === "left") {
      popTop = top + height / 2 - popRect.height / 2;
      popLeft = left - popRect.width - POPOVER_GAP;
    } else {
      popTop = top + height / 2 - popRect.height / 2;
      popLeft = left + width + POPOVER_GAP;
    }

    popTop = clamp(popTop, margin, window.innerHeight - popRect.height - margin);
    popLeft = clamp(popLeft, margin, window.innerWidth - popRect.width - margin);
    popover.style.top = `${popTop}px`;
    popover.style.left = `${popLeft}px`;
  };

  const renderStep = async () => {
    const step = TUTORIAL_STEPS[index];
    if (!step) return finish();

    if (step.tab) activateMainTab(step.tab);
    if (step.beforeShow) await step.beforeShow({ root: document });

    stepEl.textContent = `Step ${index + 1} of ${TUTORIAL_STEPS.length}`;
    titleEl.textContent = step.title;
    bodyEl.textContent = step.body;
    backBtn.disabled = index === 0;
    nextBtn.textContent = index === TUTORIAL_STEPS.length - 1 ? "Done" : "Next";

    root.setAttribute("aria-labelledby", "tutorial-title");
    titleEl.id = "tutorial-title";

    requestAnimationFrame(() => {
      layout();
      requestAnimationFrame(layout);
    });
  };

  const finish = () => {
    active = false;
    markOnboardingComplete();
    root.classList.add("hidden");
    document.body.classList.remove("tutorial-active");
    window.removeEventListener("resize", layout);
    window.removeEventListener("scroll", layout, true);
    resizeObserver?.disconnect();
    resizeObserver = null;
  };

  const start = async ({ force = false } = {}) => {
    if (active) return;
    if (!force && isOnboardingComplete()) return;

    index = 0;
    active = true;
    root.classList.remove("hidden");
    document.body.classList.add("tutorial-active");
    window.addEventListener("resize", layout);
    window.addEventListener("scroll", layout, true);

    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(layout);
      resizeObserver.observe(document.body);
    }

    await renderStep();
  };

  const go = async (delta) => {
    const next = index + delta;
    if (next < 0) return;
    if (next >= TUTORIAL_STEPS.length) {
      finish();
      return;
    }
    index = next;
    await renderStep();
  };

  root.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-tutorial-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-tutorial-action");
    if (action === "next") go(1);
    else if (action === "back") go(-1);
    else if (action === "skip") finish();
  });

  document.addEventListener("keydown", (event) => {
    if (!active || event.target.closest("input, textarea, select")) return;
    if (event.key === "Escape") finish();
    else if (event.key === "ArrowRight" || event.key === "Enter") {
      event.preventDefault();
      go(1);
    } else if (event.key === "ArrowLeft") go(-1);
  });

  restartBtn?.addEventListener("click", () => {
    resetOnboardingStorage();
    activateMainTab("tools");
    start({ force: true });
  });

  if (autoStart && !isOnboardingComplete()) {
    requestAnimationFrame(() => start({ force: false }));
  }

  return { start, finish, reset: () => resetOnboardingStorage() };
}
