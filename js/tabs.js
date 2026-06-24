const TAB_KEY = "dota2stats-tab";

export function initMainTabs() {
  const tabs = document.querySelectorAll(".main-tabs__tab");
  const panels = document.querySelectorAll("[data-tab-panel]");
  if (!tabs.length || !panels.length) return;

  const activate = (name) => {
    tabs.forEach((tab) => {
      const active = tab.dataset.tab === name;
      tab.classList.toggle("main-tabs__tab--active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });

    panels.forEach((panel) => {
      const show = panel.dataset.tabPanel === name;
      panel.classList.toggle("hidden", !show);
      panel.hidden = !show;
    });

    try {
      localStorage.setItem(TAB_KEY, name);
    } catch {
      // private mode
    }

    if (name === "tools") {
      history.replaceState(null, "", "#tools");
    } else {
      const url = new URL(window.location.href);
      url.hash = "";
      history.replaceState(null, "", url.pathname + url.search);
    }
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => activate(tab.dataset.tab));
  });

  let initial = "analyze";
  if (window.location.hash === "#tools") initial = "tools";
  else {
    try {
      const saved = localStorage.getItem(TAB_KEY);
      if (saved === "tools" || saved === "analyze") initial = saved;
    } catch {
      // ignore
    }
  }

  activate(initial);
}
