const STORAGE_KEY = "abf-middle-day-logger-v2";

const defaultState = {
  settings: { rounds: 4, transitionRestSec: 30, betweenRoundRestSec: 75, autoAdvance: true, defaultUnit: "lb" },
  movements: [
    { name: "Rows", target: "16-20 reps" },
    { name: "Light OHS", target: "16-20 reps" },
    { name: "Swings", target: "16-20 reps" },
    { name: "Carries", target: "45-60s" }
  ],
  progress: { currentRound: 1, currentMovementIndex: 0, mode: "ready", restEndsAt: null },
  logs: []
};

let state = loadState();
let restInterval = null;

const el = {
  todayDate: document.getElementById("todayDate"),
  roundsInput: document.getElementById("roundsInput"),
  transitionRestInput: document.getElementById("transitionRestInput"),
  betweenRoundRestInput: document.getElementById("betweenRoundRestInput"),
  autoAdvanceInput: document.getElementById("autoAdvanceInput"),
  defaultUnitInput: document.getElementById("defaultUnitInput"),
  movementList: document.getElementById("movementList"),
  addMovementBtn: document.getElementById("addMovementBtn"),
  activeMeta: document.getElementById("activeMeta"),
  activeMovement: document.getElementById("activeMovement"),
  weightInput: document.getElementById("weightInput"),
  unitInput: document.getElementById("unitInput"),
  repTypeInput: document.getElementById("repTypeInput"),
  valueInput: document.getElementById("valueInput"),
  notesInput: document.getElementById("notesInput"),
  setDoneBtn: document.getElementById("setDoneBtn"),
  readyActions: document.getElementById("readyActions"),
  restPanel: document.getElementById("restPanel"),
  restCountdown: document.getElementById("restCountdown"),
  skipRestBtn: document.getElementById("skipRestBtn"),
  nextSetBtn: document.getElementById("nextSetBtn"),
  totalSets: document.getElementById("totalSets"),
  summaryMovements: document.getElementById("summaryMovements"),
  logBody: document.getElementById("logBody"),
  exportCsvBtn: document.getElementById("exportCsvBtn"),
  exportJsonBtn: document.getElementById("exportJsonBtn"),
  clearWorkoutBtn: document.getElementById("clearWorkoutBtn"),
  movementRowTemplate: document.getElementById("movementRowTemplate")
};

init();

function init() {
  el.todayDate.textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  bindSettings();
  bindActions();
  bindKeyboard();
  restoreRestIfNeeded();
  renderAll();
  registerServiceWorker();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return {
      settings: { ...defaultState.settings, ...(parsed.settings || {}) },
      movements: Array.isArray(parsed.movements) && parsed.movements.length
        ? parsed.movements.map((m) => ({ name: String(m.name || "Movement"), target: String(m.target || "") }))
        : structuredClone(defaultState.movements),
      progress: { ...defaultState.progress, ...(parsed.progress || {}) },
      logs: Array.isArray(parsed.logs) ? parsed.logs : []
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function saveAndRender() { saveState(); renderAll(); }

function bindSettings() {
  el.roundsInput.addEventListener("change", () => {
    state.settings.rounds = clampInt(el.roundsInput.value, 1, 999, 4);
    state.progress.currentRound = Math.min(state.progress.currentRound, state.settings.rounds);
    saveAndRender();
  });
  el.transitionRestInput.addEventListener("change", () => {
    state.settings.transitionRestSec = clampInt(el.transitionRestInput.value, 0, 3600, 30);
    saveAndRender();
  });
  el.betweenRoundRestInput.addEventListener("change", () => {
    state.settings.betweenRoundRestSec = clampInt(el.betweenRoundRestInput.value, 0, 3600, 75);
    saveAndRender();
  });
  el.autoAdvanceInput.addEventListener("change", () => { state.settings.autoAdvance = el.autoAdvanceInput.checked; saveAndRender(); });
  el.defaultUnitInput.addEventListener("change", () => {
    state.settings.defaultUnit = el.defaultUnitInput.value;
    if (!el.weightInput.value) el.unitInput.value = state.settings.defaultUnit;
    saveAndRender();
  });
}

function bindActions() {
  el.addMovementBtn.addEventListener("click", () => {
    state.movements.push({ name: `Movement ${state.movements.length + 1}`, target: "" });
    saveAndRender();
  });
  el.setDoneBtn.addEventListener("click", completeSet);
  el.skipRestBtn.addEventListener("click", endRest);
  el.nextSetBtn.addEventListener("click", () => {
    advanceProgress();
    state.progress.mode = "ready";
    state.progress.restEndsAt = null;
    stopRestTimer();
    saveAndRender();
  });
  el.exportCsvBtn.addEventListener("click", exportCsv);
  el.exportJsonBtn.addEventListener("click", exportJson);
  el.clearWorkoutBtn.addEventListener("click", clearWorkout);
  el.logBody.addEventListener("input", handleLogInlineEdit);
  el.logBody.addEventListener("click", handleLogDelete);
  el.movementList.addEventListener("input", handleMovementEdit);
  el.movementList.addEventListener("click", handleMovementAction);
}

function bindKeyboard() {
  document.addEventListener("keydown", (event) => {
    const tag = document.activeElement ? document.activeElement.tagName : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (event.code === "Space" && state.progress.mode === "ready") { event.preventDefault(); completeSet(); }
    if (event.key.toLowerCase() === "s" && state.progress.mode === "resting") endRest();
  });
}

function completeSet() {
  if (state.progress.mode !== "ready" || !state.movements.length) return;
  const value = Number(el.valueInput.value);
  if (!Number.isFinite(value) || value < 0) return alert("Please enter a valid value.");

  const movement = state.movements[state.progress.currentMovementIndex];
  const weightRaw = el.weightInput.value.trim();

  state.logs.push({
    id: cryptoRandomId(),
    timestamp: Date.now(),
    round: state.progress.currentRound,
    movement: movement.name,
    weight: weightRaw === "" ? "" : Number(weightRaw),
    unit: el.unitInput.value,
    repType: el.repTypeInput.value,
    value,
    notes: el.notesInput.value.trim()
  });

  startRestForTransition();
  resetSetInputs();
  saveAndRender();
}

function startRestForTransition() {
  state.progress.mode = "resting";
  const endOfRound = state.progress.currentMovementIndex >= state.movements.length - 1;
  const restSec = endOfRound ? state.settings.betweenRoundRestSec : state.settings.transitionRestSec;
  state.progress.restEndsAt = Date.now() + restSec * 1000;
  startRestTimer();
}

function startRestTimer() {
  stopRestTimer();
  restInterval = setInterval(() => {
    const remaining = (state.progress.restEndsAt || 0) - Date.now();
    if (remaining <= 0) return endRest();
    renderRestOnly();
  }, 250);
}

function stopRestTimer() { if (restInterval) clearInterval(restInterval); restInterval = null; }
function restoreRestIfNeeded() {
  if (state.progress.mode !== "resting") return;
  const remaining = (state.progress.restEndsAt || 0) - Date.now();
  if (remaining > 0) startRestTimer(); else endRest();
}

function endRest() {
  stopRestTimer();
  playBeep();
  if (state.settings.autoAdvance) {
    advanceProgress();
    state.progress.mode = "ready";
    state.progress.restEndsAt = null;
  } else {
    state.progress.mode = "resting";
    state.progress.restEndsAt = Date.now();
  }
  saveAndRender();
}

function advanceProgress() {
  if (!state.movements.length) return;
  if (state.progress.currentMovementIndex < state.movements.length - 1) {
    state.progress.currentMovementIndex += 1;
  } else {
    state.progress.currentMovementIndex = 0;
    if (state.progress.currentRound < state.settings.rounds) state.progress.currentRound += 1;
  }
}

function renderAll() {
  el.roundsInput.value = state.settings.rounds;
  el.transitionRestInput.value = state.settings.transitionRestSec;
  el.betweenRoundRestInput.value = state.settings.betweenRoundRestSec;
  el.autoAdvanceInput.checked = state.settings.autoAdvance;
  el.defaultUnitInput.value = state.settings.defaultUnit;
  if (!el.weightInput.value) el.unitInput.value = state.settings.defaultUnit;
  renderPlanEditor();
  renderActiveSet();
  renderLogTable();
  renderSummary();
}

function renderPlanEditor() {
  el.movementList.textContent = "";
  state.movements.forEach((m, i) => {
    const row = el.movementRowTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.index = String(i);
    row.querySelector('[data-field="name"]').value = m.name;
    row.querySelector('[data-field="target"]').value = m.target;
    row.querySelector('[data-action="up"]').disabled = i === 0;
    row.querySelector('[data-action="down"]').disabled = i === state.movements.length - 1;
    el.movementList.appendChild(row);
  });
}

function renderActiveSet() {
  if (!state.movements.length) {
    el.activeMeta.textContent = "No movements. Add one in Plan Editor.";
    el.activeMovement.textContent = "-";
    el.setDoneBtn.disabled = true;
    el.readyActions.classList.remove("hidden");
    el.restPanel.classList.add("hidden");
    return;
  }

  const movement = state.movements[state.progress.currentMovementIndex];
  const target = movement.target ? ` (${movement.target})` : "";
  const roundText = `Round ${state.progress.currentRound}/${state.settings.rounds}`;

  if (state.progress.mode === "ready") {
    el.activeMeta.textContent = `${roundText} | Ready`;
    el.activeMovement.textContent = `${movement.name}${target}`;
    el.readyActions.classList.remove("hidden");
    el.restPanel.classList.add("hidden");
    el.nextSetBtn.classList.add("hidden");
    el.setDoneBtn.disabled = false;
  } else {
    const done = (state.progress.restEndsAt || 0) <= Date.now();
    el.activeMeta.textContent = done ? `${roundText} | Rest done` : `${roundText} | Resting`;
    el.activeMovement.textContent = `${movement.name}${target}`;
    el.readyActions.classList.add("hidden");
    el.restPanel.classList.remove("hidden");
    el.nextSetBtn.classList.toggle("hidden", !done || state.settings.autoAdvance);
    renderRestOnly();
  }
}

function renderRestOnly() {
  const ms = Math.max(0, (state.progress.restEndsAt || 0) - Date.now());
  el.restCountdown.textContent = formatMs(ms);
}

function renderLogTable() {
  el.logBody.textContent = "";
  state.logs.forEach((log) => {
    const tr = document.createElement("tr");
    tr.dataset.id = log.id;

    tr.appendChild(tdText(new Date(log.timestamp).toLocaleTimeString()));
    tr.appendChild(tdText(String(log.round)));
    tr.appendChild(tdText(log.movement));

    const wTd = document.createElement("td");
    const wInput = document.createElement("input");
    wInput.type = "number";
    wInput.dataset.field = "weight";
    wInput.value = log.weight === "" ? "" : String(log.weight);
    wTd.appendChild(wInput);
    tr.appendChild(wTd);

    const uTd = document.createElement("td");
    const uSelect = document.createElement("select");
    uSelect.dataset.field = "unit";
    uSelect.appendChild(option("lb", "lb", log.unit === "lb"));
    uSelect.appendChild(option("kg", "kg", log.unit === "kg"));
    uTd.appendChild(uSelect);
    tr.appendChild(uTd);

    tr.appendChild(tdText(log.repType));

    const vTd = document.createElement("td");
    const vInput = document.createElement("input");
    vInput.type = "number";
    vInput.dataset.field = "value";
    vInput.value = String(log.value);
    vTd.appendChild(vInput);
    tr.appendChild(vTd);

    const nTd = document.createElement("td");
    const nInput = document.createElement("input");
    nInput.type = "text";
    nInput.dataset.field = "notes";
    nInput.value = log.notes || "";
    nTd.appendChild(nInput);
    tr.appendChild(nTd);

    const dTd = document.createElement("td");
    const del = document.createElement("button");
    del.type = "button";
    del.className = "danger";
    del.dataset.action = "delete";
    del.textContent = "Delete";
    dTd.appendChild(del);
    tr.appendChild(dTd);

    el.logBody.appendChild(tr);
  });
}

function renderSummary() {
  el.totalSets.textContent = `Total sets completed: ${state.logs.length}`;
  const summary = {};
  state.logs.forEach((log) => {
    if (!summary[log.movement]) summary[log.movement] = { reps: 0, seconds: 0, meters: 0, lastWeight: "-" };
    summary[log.movement][log.repType] += Number(log.value) || 0;
    if (log.weight !== "" && Number.isFinite(Number(log.weight))) summary[log.movement].lastWeight = `${log.weight} ${log.unit}`;
  });

  el.summaryMovements.textContent = "";
  Object.keys(summary).forEach((name) => {
    const card = document.createElement("div");
    card.className = "card";

    const strong = document.createElement("strong");
    strong.textContent = name;
    card.appendChild(strong);

    const l1 = document.createElement("div");
    l1.className = "muted";
    l1.textContent = `reps: ${summary[name].reps} | seconds: ${summary[name].seconds} | meters: ${summary[name].meters}`;
    card.appendChild(l1);

    const l2 = document.createElement("div");
    l2.className = "muted";
    l2.textContent = `last weight: ${summary[name].lastWeight}`;
    card.appendChild(l2);

    el.summaryMovements.appendChild(card);
  });
}

function tdText(text) { const td = document.createElement("td"); td.textContent = text; return td; }
function option(value, text, selected) { const o = document.createElement("option"); o.value = value; o.textContent = text; o.selected = !!selected; return o; }

function handleMovementEdit(event) {
  const row = event.target.closest(".movement-row");
  if (!row) return;
  const idx = Number(row.dataset.index);
  const field = event.target.dataset.field;
  if (!Number.isInteger(idx) || !field) return;
  state.movements[idx][field] = event.target.value;
  saveState();
}

function handleMovementAction(event) {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  const row = btn.closest(".movement-row");
  if (!row) return;
  const idx = Number(row.dataset.index);
  if (!Number.isInteger(idx)) return;
  const action = btn.dataset.action;

  if (action === "remove") {
    if (state.movements.length === 1) return alert("At least one movement is required.");
    state.movements.splice(idx, 1);
    if (state.progress.currentMovementIndex >= state.movements.length) state.progress.currentMovementIndex = state.movements.length - 1;
  }
  if (action === "up" && idx > 0) [state.movements[idx - 1], state.movements[idx]] = [state.movements[idx], state.movements[idx - 1]];
  if (action === "down" && idx < state.movements.length - 1) [state.movements[idx + 1], state.movements[idx]] = [state.movements[idx], state.movements[idx + 1]];

  saveAndRender();
}

function handleLogInlineEdit(event) {
  const tr = event.target.closest("tr");
  if (!tr) return;
  const log = state.logs.find((x) => x.id === tr.dataset.id);
  if (!log) return;
  const field = event.target.dataset.field;

  if (field === "weight") {
    const v = event.target.value.trim();
    log.weight = v === "" ? "" : Number(v);
  }
  if (field === "value") {
    const v = Number(event.target.value);
    if (Number.isFinite(v)) log.value = v;
  }
  if (field === "notes") log.notes = event.target.value;
  if (field === "unit") log.unit = event.target.value;

  saveAndRender();
}

function handleLogDelete(event) {
  const btn = event.target.closest("button[data-action='delete']");
  if (!btn) return;
  const tr = btn.closest("tr");
  if (!tr) return;
  state.logs = state.logs.filter((x) => x.id !== tr.dataset.id);
  saveAndRender();
}

function clearWorkout() {
  if (!confirm("Clear all settings, progress, and logs?")) return;
  stopRestTimer();
  state = structuredClone(defaultState);
  saveAndRender();
}

function exportCsv() {
  const headers = ["timestamp", "round", "movement", "weight", "unit", "repType", "value", "notes"];
  const rows = state.logs.map((log) => [new Date(log.timestamp).toISOString(), log.round, log.movement, log.weight, log.unit, log.repType, log.value, log.notes || ""]);
  const csv = [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  downloadFile(`abf-middle-day-${dateStamp()}.csv`, "text/csv;charset=utf-8", csv);
}

function exportJson() {
  downloadFile(`abf-middle-day-${dateStamp()}.json`, "application/json", JSON.stringify({ exportedAt: new Date().toISOString(), state }, null, 2));
}

function downloadFile(filename, type, content) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function resetSetInputs() {
  el.weightInput.value = "";
  el.unitInput.value = state.settings.defaultUnit;
  el.repTypeInput.value = "reps";
  el.valueInput.value = "";
  el.notesInput.value = "";
}

function playBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.start(t);
    osc.stop(t + 0.21);
    osc.onended = () => ctx.close();
  } catch {
    // fail silently
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
    } catch {
      // fail silently
    }
  });
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function formatMs(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function cryptoRandomId() {
  if (window.crypto && window.crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function csvCell(v) {
  const s = String(v ?? "");
  return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
}

function dateStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
