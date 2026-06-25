let gsapModule = null;
let scrollTriggerModule = null;
let ready = false;

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

async function loadGsap() {
  if (prefersReducedMotion()) return null;
  if (gsapModule) return gsapModule;

  try {
    const gsapImport = await import(
      "https://cdn.jsdelivr.net/npm/gsap@3.12.5/+esm"
    );
    gsapModule = gsapImport.gsap ?? gsapImport.default;
    scrollTriggerModule = gsapImport.ScrollTrigger;
    if (scrollTriggerModule && gsapModule?.registerPlugin) {
      gsapModule.registerPlugin(scrollTriggerModule);
    }
    ready = Boolean(gsapModule);
    return gsapModule;
  } catch {
    return null;
  }
}

export async function initAppMotion() {
  const gsap = await loadGsap();
  if (!gsap) return;

  gsap.from(".site-header", {
    y: -18,
    opacity: 0,
    duration: 0.55,
    ease: "power3.out",
  });

  gsap.from(".main-tabs__tab", {
    y: 14,
    opacity: 0,
    duration: 0.45,
    stagger: 0.07,
    delay: 0.12,
    ease: "power3.out",
  });

  const activePanel = document.querySelector(".tab-panel:not(.hidden)");
  if (activePanel) {
    gsap.from(activePanel.querySelector(".card, .changelog-page"), {
      y: 22,
      opacity: 0,
      duration: 0.5,
      delay: 0.2,
      ease: "power3.out",
    });
  }
}

export async function animateTabPanel(panel) {
  const gsap = await loadGsap();
  if (!gsap || !panel) return;

  gsap.fromTo(
    panel,
    { opacity: 0, y: 12 },
    { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" }
  );
}

export function animateChangelogPatch(container) {
  if (!gsapModule || prefersReducedMotion() || !container) return;

  gsap.from(container.querySelectorAll(".changelog-section, .changelog-change"), {
    y: 16,
    opacity: 0,
    duration: 0.4,
    stagger: 0.04,
    ease: "power2.out",
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
    clearProps: "transform",
  });
}

export async function initScrollReveals() {
  const gsap = await loadGsap();
  if (!gsap || !scrollTriggerModule) return;

  gsap.utils.toArray(".card").forEach((card) => {
    if (card.closest("#changelog-root")) return;
    gsap.from(card, {
      scrollTrigger: {
        trigger: card,
        start: "top 92%",
        once: true,
      },
      y: 24,
      opacity: 0,
      duration: 0.5,
      ease: "power2.out",
    });
  });
}
