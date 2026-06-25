import { animateTabPanel } from "./motion.js";

const TAB_KEY = "dota2stats-tab";
const VALID_TABS = new Set(["analyze", "tools", "changelogs"]);

export function initMainTabs() {
  const tabs = document.querySelectorAll(".main-tabs__tab");
  const panels = document.querySelectorAll("[data-tab-panel]");
  if (!tabs.length || !panels.length) return;

  const activate = (name) => {
    if (!VALID_TABS.has(name)) name = "analyze";

    tabs.forEach((tab) => {
      const active = tab.dataset.tab === name;
      tab.classList.toggle("main-tabs__tab--active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });

    let shownPanel = null;
    panels.forEach((panel) => {
      const show = panel.dataset.tabPanel === name;
      panel.classList.toggle("hidden", !show);
      panel.hidden = !show;
      if (show) shownPanel = panel;
    });

    try {
      localStorage.setItem(TAB_KEY, name);
    } catch {
      // private mode
    }

    const url = new URL(window.location.href);
    if (name === "tools") {
      url.hash = "#tools";
    } else if (name === "changelogs") {
      url.hash = "#changelogs";
    } else {
      url.hash = "";
    }
    history.replaceState(null, "", url.pathname + url.search + url.hash);

    if (shownPanel) animateTabPanel(shownPanel);
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => activate(tab.dataset.tab));
  });

  let initial = "analyze";
  if (window.location.hash === "#tools") initial = "tools";
  else if (window.location.hash === "#changelogs") initial = "changelogs";
  else {
    try {
      const saved = localStorage.getItem(TAB_KEY);
      if (VALID_TABS.has(saved)) initial = saved;
    } catch {
      // ignore
    }
  }

  activate(initial);
}
