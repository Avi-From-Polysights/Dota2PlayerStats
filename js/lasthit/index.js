/**
 * Last Hit Trainer tab controller.
 *
 * Wires the deterministic sim (sim.js) to a canvas renderer, Dota-style input,
 * and local run history. Anti-Mage at level 1 with no items, two creep waves
 * and two invulnerable towers — nothing else.
 */
import { renderLastHitHistoryChart } from "../charts.js";
import { DRILL_WAVES, TICK_SECONDS, WAVE_INTERVAL } from "./constants.js";
import { loadTrainerData, trainerDataSourceLabel } from "./data.js";
import { clearRuns, loadRuns, saveRun, summarizeRuns } from "./history.js";
import { attachInput } from "./input.js";
import { createRenderer } from "./render.js";
import { createSim, step, summarize } from "./sim.js";

/** Never advance more than this much sim time in one frame after a stall. */
const MAX_FRAME_SECONDS = 0.25;

function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function formatPct(value) {
  return `${value.toFixed(0)}%`;
}

export function initLastHitTrainer() {
  const panel = document.querySelector('[data-tab-panel="lasthit"]');
  const canvas = document.getElementById("lasthit-canvas");
  if (!panel || !canvas) return;

  const el = {
    start: document.getElementById("lasthit-start"),
    stop: document.getElementById("lasthit-stop"),
    modeInputs: [...panel.querySelectorAll('input[name="lasthit-mode"]')],
    time: document.getElementById("lasthit-time"),
    wave: document.getElementById("lasthit-wave"),
    lastHits: document.getElementById("lasthit-lh"),
    denies: document.getElementById("lasthit-deny"),
    overlay: document.getElementById("lasthit-overlay"),
    overlayBody: document.getElementById("lasthit-overlay-body"),
    source: document.getElementById("lasthit-source"),
    bestBody: document.getElementById("lasthit-best"),
    historyChart: document.getElementById("lasthit-history-chart"),
    historyEmpty: document.getElementById("lasthit-history-empty"),
    clearHistory: document.getElementById("lasthit-clear-history"),
    attackMove: document.getElementById("lasthit-attack-move"),
  };

  let data = null;
  let sim = null;
  let renderer = null;
  let input = null;
  let rafId = null;
  let lastTimestamp = 0;
  let accumulator = 0;
  let saving = false;

  const selectedMode = () =>
    el.modeInputs.find((i) => i.checked)?.value === "endless" ? "endless" : "drill";

  /** The sim is only reachable while a run is live on a visible trainer tab. */
  const getActiveState = () => {
    if (!sim || sim.phase !== "running") return null;
    if (panel.hidden) return null;
    return sim;
  };

  function setOverlay(html) {
    if (!el.overlay) return;
    if (!html) {
      el.overlay.hidden = true;
      return;
    }
    if (el.overlayBody) el.overlayBody.innerHTML = html;
    el.overlay.hidden = false;
  }

  function updateHud() {
    if (!sim) return;
    const { score } = sim;
    if (el.time) el.time.textContent = formatClock(sim.time);
    if (el.wave) {
      el.wave.textContent =
        sim.mode === "drill" ? `${sim.wavesSpawned} / ${DRILL_WAVES}` : String(sim.wavesSpawned);
    }
    if (el.lastHits) el.lastHits.textContent = `${score.lastHits} / ${score.enemyDeaths}`;
    if (el.denies) el.denies.textContent = `${score.denies} / ${score.allyDeaths}`;
  }

  function scorecardHtml(result) {
    const lhPct = formatPct(result.lastHitPct);
    const denyPct = formatPct(result.denyPct);
    const perfect = result.lastHits === result.lastHitsPossible && result.lastHits > 0;
    const heading = perfect ? "Perfect run" : "Run complete";

    const waveRows = result.waveStats
      .map(
        (w) =>
          `<tr><td>${w.wave}</td><td>${w.lastHits}/${w.enemyDeaths}</td><td>${w.denies}/${w.allyDeaths}</td></tr>`
      )
      .join("");

    return `
      <h3 class="lasthit-overlay__title">${heading}</h3>
      <div class="lasthit-overlay__score">
        <div class="lasthit-stat">
          <span class="lasthit-stat__value">${result.lastHits} / ${result.lastHitsPossible}</span>
          <span class="lasthit-stat__label">Last hits · ${lhPct}</span>
        </div>
        <div class="lasthit-stat">
          <span class="lasthit-stat__value">${result.denies} / ${result.deniesPossible}</span>
          <span class="lasthit-stat__label">Denies · ${denyPct}</span>
        </div>
      </div>
      <p class="lasthit-overlay__note">
        ${result.lostToTower} lost to towers · ${result.lostToCreeps} lost to creeps · ${formatClock(result.durationSeconds)}
      </p>
      <div class="lasthit-overlay__waves">
        <table class="lasthit-wave-table">
          <thead><tr><th>Wave</th><th>Last hits</th><th>Denies</th></tr></thead>
          <tbody>${waveRows}</tbody>
        </table>
      </div>
    `;
  }

  function idleHtml() {
    const mode = selectedMode();
    const lengthLine =
      mode === "drill"
        ? `${DRILL_WAVES} waves on a real ${WAVE_INTERVAL}-second cadence, scored once the last enemy creep dies.`
        : "Waves keep coming until you stop. Your score is saved when you do.";

    return `
      <h3 class="lasthit-overlay__title">Anti-Mage · level 1 · no items</h3>
      <p class="lasthit-overlay__note">${lengthLine}</p>
      <ul class="lasthit-keys">
        <li><kbd>Right-click</kbd> a creep to attack it, or the ground to move</li>
        <li><kbd>A</kbd> then <kbd>Left-click</kbd> to attack-move</li>
        <li><kbd>S</kbd> to stop — cancels the swing windup and the backswing</li>
      </ul>
      <p class="lasthit-overlay__note">Allied creeps can only be denied below half health.</p>
    `;
  }

  async function refreshHistory() {
    const runs = await loadRuns();
    const stats = summarizeRuns(runs);

    if (el.bestBody) {
      el.bestBody.innerHTML = stats.count
        ? `
          <div class="lasthit-stat">
            <span class="lasthit-stat__value">${formatPct(stats.bestLastHitPct)}</span>
            <span class="lasthit-stat__label">Best last hit %</span>
          </div>
          <div class="lasthit-stat">
            <span class="lasthit-stat__value">${formatPct(stats.bestDenyPct)}</span>
            <span class="lasthit-stat__label">Best deny %</span>
          </div>
          <div class="lasthit-stat">
            <span class="lasthit-stat__value">${formatPct(stats.avgLastHitPct)}</span>
            <span class="lasthit-stat__label">Average last hit %</span>
          </div>
          <div class="lasthit-stat">
            <span class="lasthit-stat__value">${stats.count}</span>
            <span class="lasthit-stat__label">Drills completed</span>
          </div>
        `
        : `<p class="section-desc">No drills yet. Your scores will build up here.</p>`;
    }

    const hasDrills = stats.count > 0;
    if (el.historyEmpty) el.historyEmpty.hidden = hasDrills;
    if (el.historyChart) {
      el.historyChart.hidden = !hasDrills;
      if (hasDrills) renderLastHitHistoryChart(el.historyChart, runs);
    }
  }

  async function finishRun({ save = true } = {}) {
    if (!sim || saving) return;
    saving = true;
    stopLoop();

    const result = summarize(sim);
    sim.phase = "finished";
    setOverlay(scorecardHtml(result));
    if (el.start) el.start.textContent = "Start again";
    if (el.stop) el.stop.disabled = true;
    input?.disarm();

    // A run in which no creep died at all is not worth logging.
    if (save && result.lastHitsPossible + result.deniesPossible > 0) {
      await saveRun(result);
      await refreshHistory();
    }
    saving = false;
  }

  function frame(timestamp) {
    rafId = requestAnimationFrame(frame);
    if (!sim || !renderer) return;

    const elapsed = lastTimestamp ? (timestamp - lastTimestamp) / 1000 : 0;
    lastTimestamp = timestamp;

    // Pause cleanly when the tab is hidden or the user navigated away, rather
    // than fast-forwarding the whole absence on return.
    if (panel.hidden || document.hidden) {
      accumulator = 0;
      return;
    }

    if (sim.phase === "running") {
      accumulator += Math.min(elapsed, MAX_FRAME_SECONDS);
      while (accumulator >= TICK_SECONDS) {
        step(sim);
        accumulator -= TICK_SECONDS;
        if (sim.phase !== "running") break;
      }
      updateHud();
    }

    renderer.draw(sim, Math.min(elapsed, MAX_FRAME_SECONDS));

    if (sim.phase === "finished" && !saving) {
      void finishRun({ save: true });
    }
  }

  function startLoop() {
    if (rafId !== null) return;
    lastTimestamp = 0;
    accumulator = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (rafId === null) return;
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  async function startRun() {
    if (!data) data = await loadTrainerData();
    if (el.source) el.source.textContent = trainerDataSourceLabel(data);

    sim = createSim(data, { mode: selectedMode(), seed: Date.now() % 2147483647 });
    renderer?.reset();
    saving = false;
    setOverlay(null);
    if (el.stop) el.stop.disabled = false;
    if (el.start) el.start.textContent = "Restart";
    updateHud();
    startLoop();
  }

  renderer = createRenderer(canvas);
  input = attachInput(canvas, {
    getState: getActiveState,
    screenToWorld: (x, y) => renderer.screenToWorld(x, y),
    onAttackMoveChange: (armed) => {
      if (el.attackMove) el.attackMove.hidden = !armed;
    },
  });

  // Test hook: scripts/test-lasthit-browser.mjs drives the real canvas
  // listeners, so it needs the live sim and the same coordinate transform the
  // renderer uses. Read-only, and unused by the app itself.
  window.__lasthitTrainer = {
    getState: () => sim,
    worldToScreen: (x, y) => renderer.worldToScreen(x, y),
  };

  el.start?.addEventListener("click", () => void startRun());
  el.stop?.addEventListener("click", () => void finishRun({ save: true }));
  el.clearHistory?.addEventListener("click", async () => {
    await clearRuns();
    await refreshHistory();
  });
  for (const modeInput of el.modeInputs) {
    modeInput.addEventListener("change", () => {
      if (!sim || sim.phase !== "running") setOverlay(idleHtml());
    });
  }

  // Draw an idle lane immediately so the tab is never a blank rectangle.
  void (async () => {
    data = await loadTrainerData();
    if (el.source) el.source.textContent = trainerDataSourceLabel(data);
    sim = createSim(data, { mode: selectedMode(), seed: 1 });
    sim.phase = "idle";
    setOverlay(idleHtml());
    updateHud();
    renderer.draw(sim, 0);
    await refreshHistory();
    startLoop();
  })();
}
