const MAX_LINES = 250;

function formatTime(date = new Date()) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export class ActivityLog {
  constructor(bodyEl, panelEl) {
    this.bodyEl = bodyEl;
    this.panelEl = panelEl;
    this.lines = [];
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
    this.lines = [];
    if (this.bodyEl) this.bodyEl.textContent = "";
  }

  append(kind, message) {
    const line = `[${formatTime()}] ${message}`;
    this.lines.push({ kind, line });
    if (this.lines.length > MAX_LINES) {
      this.lines.shift();
    }
    if (this.bodyEl) {
      this.bodyEl.textContent = this.lines.map((l) => l.line).join("\n");
      this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
    }
  }

  info(message) {
    this.append("info", message);
  }

  cache(message) {
    this.append("cache", message);
  }

  fetch(message) {
    this.append("fetch", message);
  }

  parse(message) {
    this.append("parse", message);
  }

  wait(message) {
    this.append("wait", message);
  }

  warn(message) {
    this.append("warn", message);
  }
}

export function initActivityLog() {
  const panel = document.getElementById("activity-log-panel");
  const body = document.getElementById("activity-log");
  if (!panel || !body) return null;
  return new ActivityLog(body, panel);
}
