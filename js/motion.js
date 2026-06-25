let gsapModule = null;

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function resetMotionStyles(selectors) {
  document.querySelectorAll(selectors).forEach((el) => {
    el.style.removeProperty("opacity");
    el.style.removeProperty("transform");
    el.style.removeProperty("visibility");
  });
}

async function loadGsap() {
  if (prefersReducedMotion()) return null;
  if (gsapModule) return gsapModule;

  try {
    const gsapImport = await import(
      "https://cdn.jsdelivr.net/npm/gsap@3.12.5/+esm"
    );
    gsapModule = gsapImport.gsap ?? gsapImport.default;
    return gsapModule ?? null;
  } catch {
    return null;
  }
}

export async function initAppMotion() {
  const gsap = await loadGsap();
  if (!gsap) return;

  const targets = gsap.utils.toArray(
    ".site-header, .main-tabs__tab, .tab-panel:not(.hidden) .card, .tab-panel:not(.hidden) .changelog-page"
  );
  if (!targets.length) return;

  gsap.from(targets, {
    y: 18,
    opacity: 0,
    duration: 0.55,
    stagger: 0.06,
    ease: "power3.out",
    clearProps: "opacity,transform,visibility",
  });

  window.setTimeout(() => {
    resetMotionStyles(
      ".site-header, .main-tabs__tab, .tab-panel:not(.hidden) .card, .tab-panel:not(.hidden) .changelog-page"
    );
  }, 2000);
}

export async function animateTabPanel(panel) {
  const gsap = await loadGsap();
  if (!gsap || !panel || panel.hidden) return;

  gsap.fromTo(
    panel,
    { opacity: 0, y: 12 },
    { opacity: 1, y: 0, duration: 0.35, ease: "power2.out", clearProps: "opacity,transform" }
  );
}

export function animateChangelogPatch(container) {
  if (!gsapModule || prefersReducedMotion() || !container) return;

  gsapModule.from(container.querySelectorAll(".changelog-section, .changelog-change"), {
    y: 16,
    opacity: 0,
    duration: 0.4,
    stagger: 0.04,
    ease: "power2.out",
    clearProps: "opacity,transform",
  });
}

export async function animateResultsReveal(container) {
  const gsap = await loadGsap();
  if (!gsap || !container) return;

  gsap.from(container.querySelectorAll(".motion-rise, .motion-stagger > *, .card"), {
    y: 20,
    opacity: 0,
    duration: 0.45,
    stagger: 0.06,
    ease: "power2.out",
    clearProps: "opacity,transform",
  });
}

/** CSS handles scroll reveals; GSAP scroll triggers were leaving hidden cards invisible. */
export async function initScrollReveals() {}
