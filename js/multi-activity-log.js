import { ActivityLog } from "./activity-log.js";

/**
 * Tabbed activity log: Overview plus one pane per parallel worker lane.
 */
export class MultiActivityLog {
  constructor(panelEl) {
    this.panelEl = panelEl;
    this.mount = panelEl.querySelector("[data-multi-log-root]") ?? panelEl;
    this.workerCount = 0;
    this.summaryLog = null;
    this.workerLogs = [];
    this._configure(1);
  }

  show() {
    this.panelEl?.classList.remove("hidden");
    if (this.panelEl?.tagName === "DETAILS") {
      this.panelEl.open = true;
    }
  }

  hide() {
    this.panelEl?.classList.add("hidden");
  }

  clear() {
    this.summaryLog?.clear();
    this.workerLogs.forEach((log) => log.clear());
  }

  configureWorkers(count) {
    const n = Math.max(1, Math.min(6, Math.round(count)));
    if (n !== this.workerCount) this._configure(n);
  }

  overview() {
    return this.summaryLog;
  }

  /** Lane log for a worker slot; falls back to overview when running single-threaded. */
  lane(workerId) {
    if (this.workerCount <= 1) return this.summaryLog;
    return this.workerLogs[workerId] ?? this.summaryLog;
  }

  info(message) {
    this.summaryLog?.info(message);
  }

  warn(message) {
    this.summaryLog?.warn(message);
  }

  wait(message) {
    this.summaryLog?.wait(message);
  }

  cache(message) {
    this.summaryLog?.cache(message);
  }

  fetch(message) {
    this.summaryLog?.fetch(message);
  }

  parse(message) {
    this.summaryLog?.parse(message);
  }

  _configure(count) {
    this.workerCount = count;
    this.mount.innerHTML = "";

    if (count <= 1) {
      const body = document.createElement("pre");
      body.className = "activity-log-panel__body";
      body.setAttribute("data-log-pane", "overview");
      this.mount.appendChild(body);
      this.summaryLog = new ActivityLog(body, this.panelEl);
      this.workerLogs = [];
      return;
    }

    const tabs = document.createElement("div");
    tabs.className = "multi-log__tabs";
    tabs.setAttribute("role", "tablist");

    const panes = document.createElement("div");
    panes.className = "multi-log__panes";

    const addPane = (id, label, isOverview) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "multi-log__tab";
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", isOverview ? "true" : "false");
      tab.setAttribute("aria-controls", id);
      tab.id = `${id}-tab`;
      tab.textContent = label;

      const pane = document.createElement("div");
      pane.className = "multi-log__pane";
      pane.id = id;
      pane.setAttribute("role", "tabpanel");
      pane.setAttribute("aria-labelledby", `${id}-tab`);
      pane.hidden = !isOverview;

      const body = document.createElement("pre");
      body.className = "activity-log-panel__body";
      pane.appendChild(body);

      tab.addEventListener("click", () => {
        tabs.querySelectorAll(".multi-log__tab").forEach((t) => {
          t.setAttribute("aria-selected", "false");
        });
        panes.querySelectorAll(".multi-log__pane").forEach((p) => {
          p.hidden = true;
        });
        tab.setAttribute("aria-selected", "true");
        pane.hidden = false;
      });

      tabs.appendChild(tab);
      panes.appendChild(pane);
      return new ActivityLog(body, this.panelEl);
    };

    this.summaryLog = addPane("log-overview", "Overview", true);
    this.workerLogs = [];

    for (let i = 0; i < count; i += 1) {
      const log = addPane(`log-lane-${i + 1}`, `Lane ${i + 1}`, false);
      this.workerLogs.push(log);
    }

    this.mount.appendChild(tabs);
    this.mount.appendChild(panes);
  }
}

export function initMultiActivityLog(panelId = "activity-log-panel") {
  const panel = document.getElementById(panelId);
  if (!panel) return null;
  return new MultiActivityLog(panel);
}
