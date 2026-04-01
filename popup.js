// ================================================================
//  ScrollMirror v2 — popup.js
//  CSP-safe: external script only, no eval, no inline handlers
// ================================================================

"use strict";

// ── Helpers ───────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const toMin    = s => (s / 60).toFixed(1);
const toMinInt = s => Math.floor(s / 60);

function getTodayStr() {
  const n = new Date();
  const p = v => String(v).padStart(2, "0");
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

function fmtShortDate(str) {
  const [y, m, d] = str.split("-");
  return new Date(y, m - 1, d)
    .toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getDayLabel(str) {
  const [y, m, d] = str.split("-");
  return new Date(y, m - 1, d)
    .toLocaleDateString("en-US", { weekday: "narrow" });
}

// ── State ─────────────────────────────────────────────────────
let chartInstance = null;
let historyData   = [];
let currentPrefs  = {};

// ── Tab Switching ─────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll(".sm-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      // Update tab styles
      document.querySelectorAll(".sm-tab").forEach(b => {
        b.classList.remove("sm-tab-active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("sm-tab-active");
      btn.setAttribute("aria-selected", "true");

      // Show correct panel
      const target = btn.dataset.tab;
      ["stats", "chart", "settings"].forEach(t => {
        const panel = $(`panel-${t}`);
        if (t === target) {
          panel.classList.remove("sm-panel-hidden");
          panel.classList.add("sm-panel");
        } else {
          panel.classList.add("sm-panel-hidden");
          panel.classList.remove("sm-panel");
        }
      });

      if (target === "chart") renderChart();
    });
  });
}

// ── Render hero ring ──────────────────────────────────────────
function renderRing(totalSeconds, budgetSeconds) {
  const pct  = Math.min(100, (totalSeconds / budgetSeconds) * 100);
  const ring = $("ring-fill");
  // circumference = 2π×34 ≈ 213.6
  ring.style.strokeDashoffset = String(213.6 - (213.6 * pct / 100));
  if      (pct > 80) ring.style.stroke = "#ef4444";
  else if (pct > 50) ring.style.stroke = "#f97316";
  else               ring.style.stroke = "url(#rg)";
}

// ── Render budget bar ─────────────────────────────────────────
function renderBudgetBar(totalSeconds, budgetSeconds, budgetMinutes) {
  const pct  = Math.min(100, (totalSeconds / budgetSeconds) * 100);
  const fill = $("budget-bar");
  fill.style.width = `${pct}%`;
  if      (pct > 80) fill.style.background = "#ef4444";
  else if (pct > 50) fill.style.background = "#f97316";
  else               fill.style.background = "#c084fc";

  $("budget-label").textContent     = `of ${budgetMinutes}m budget`;
  const track = fill.closest(".sm-budget-track");
  if (track) track.setAttribute("aria-valuenow", String(Math.round(pct)));
}

// ── Render per-site bars ──────────────────────────────────────
function renderSiteBars(sites) {
  const container = $("site-bars");
  container.innerHTML = "";

  const siteDefs = [
    { key: "instagram", label: "📸 Instagram", fillClass: "sm-fill-ig" },
    { key: "tiktok",    label: "🎵 TikTok",    fillClass: "sm-fill-tt" },
    { key: "youtube",   label: "▶ YouTube",    fillClass: "sm-fill-yt" },
  ];

  const maxSecs = Math.max(1, ...siteDefs.map(s => sites[s.key] || 0));

  siteDefs.forEach(({ key, label, fillClass }) => {
    const secs   = sites[key] || 0;
    const barPct = Math.round((secs / maxSecs) * 100);

    const row = document.createElement("div");
    row.className = "sm-site-row";
    row.innerHTML = `
      <div class="sm-site-header">
        <span class="sm-site-name">${label}</span>
        <span class="sm-site-mins">${toMin(secs)}m</span>
      </div>
      <div class="sm-site-track" role="progressbar"
           aria-valuenow="${barPct}" aria-valuemin="0" aria-valuemax="100"
           aria-label="${label} scroll time">
        <div class="sm-site-fill ${fillClass}" style="width:0%"
             data-target="${barPct}"></div>
      </div>
    `;
    container.appendChild(row);
  });

  // Animate after paint
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      container.querySelectorAll(".sm-site-fill").forEach(el => {
        el.style.width = el.dataset.target + "%";
      });
    });
  });
}

// ── Render week mini bars ─────────────────────────────────────
function renderWeekMini(history) {
  const container = $("week-mini");
  container.innerHTML = "";
  const today  = getTodayStr();
  const maxSec = Math.max(1, ...history.map(d => d.totalSeconds));

  history.forEach(d => {
    const isToday = d.date === today;
    const heightPx = Math.max(3, Math.round((d.totalSeconds / maxSec) * 40));

    const col = document.createElement("div");
    col.className = "sm-week-col";

    const barWrap = document.createElement("div");
    barWrap.className = "sm-week-bar-wrap";

    const bar = document.createElement("div");
    bar.className = `sm-week-bar${isToday ? " today" : ""}`;
    bar.style.height = `${heightPx}px`;
    bar.title = `${fmtShortDate(d.date)}: ${toMin(d.totalSeconds)}m`;

    const lbl = document.createElement("div");
    lbl.className = `sm-week-label${isToday ? " today" : ""}`;
    lbl.textContent = getDayLabel(d.date);

    barWrap.appendChild(bar);
    col.appendChild(barWrap);
    col.appendChild(lbl);
    container.appendChild(col);
  });
}

// ── Render Chart.js ───────────────────────────────────────────
function renderChart() {
  if (!historyData.length || typeof Chart === "undefined") return;

  const labels = historyData.map(d => fmtShortDate(d.date));
  const ig  = historyData.map(d => parseFloat(toMin(d.sites?.instagram || 0)));
  const tt  = historyData.map(d => parseFloat(toMin(d.sites?.tiktok    || 0)));
  const yt  = historyData.map(d => parseFloat(toMin(d.sites?.youtube   || 0)));

  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

  chartInstance = new Chart($("weekly-chart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Instagram", data: ig, backgroundColor: "rgba(244,114,182,0.75)", borderRadius: 4 },
        { label: "TikTok",    data: tt, backgroundColor: "rgba(34,211,238,0.75)",  borderRadius: 4 },
        { label: "YouTube",   data: yt, backgroundColor: "rgba(248,113,113,0.75)", borderRadius: 4 },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(15,8,30,0.92)",
          titleColor: "#c084fc",
          bodyColor: "rgba(200,180,255,0.75)",
          borderColor: "rgba(180,140,255,0.2)",
          borderWidth: 1,
          callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.raw}m` }
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: { color: "rgba(180,140,255,0.05)" },
          ticks: { color: "rgba(200,180,255,0.5)", font: { size: 9 } }
        },
        y: {
          stacked: true,
          grid: { color: "rgba(180,140,255,0.05)" },
          ticks: { color: "rgba(200,180,255,0.5)", font: { size: 9 },
                   callback: v => `${v}m` }
        }
      }
    }
  });
}

// ── Settings ──────────────────────────────────────────────────
function initSettings() {
  const slider = $("budget-slider");
  const display = $("budget-display");

  slider.addEventListener("input", () => {
    display.textContent = `${slider.value} min`;
    slider.setAttribute("aria-valuenow", slider.value);
  });

  $("save-prefs-btn").addEventListener("click", async () => {
    const prefs = {
      budgetMinutes:  parseInt(slider.value, 10),
      pomodoroActive: $("toggle-pomodoro").checked,
      soundEnabled:   $("toggle-sound").checked,
    };

    await chrome.runtime.sendMessage({ type: "SET_PREFS", prefs });
    currentPrefs = prefs;

    // Broadcast to content scripts so they pick up changes live
    try {
      const tabs = await chrome.tabs.query({});
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { type: "PREFS_UPDATED", prefs })
          .catch(() => {}); // tabs without content script will reject — ignore
      });
    } catch (_) {}

    // Show toast
    const toast = $("save-toast");
    toast.classList.remove("sm-toast-hidden");
    setTimeout(() => toast.classList.add("sm-toast-hidden"), 2200);
  });
}

// ── Export CSV ────────────────────────────────────────────────
function initExport() {
  $("export-btn").addEventListener("click", async () => {
    const res = await chrome.runtime.sendMessage({ type: "EXPORT_CSV" });
    if (!res?.success) return;

    const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `scrollmirror-${getTodayStr()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

// ── Boot ──────────────────────────────────────────────────────
async function load() {
  $("header-date").textContent = fmtShortDate(getTodayStr());

  const res = await chrome.runtime.sendMessage({ type: "GET_HISTORY" });
  if (!res?.success) return;

  historyData  = res.history;
  currentPrefs = res.prefs;
  const today  = res.today;
  const streak = res.streak;
  const budgetMins    = currentPrefs.budgetMinutes || 60;
  const budgetSeconds = budgetMins * 60;

  // ── Streak ──────────────────────────────────────────────────
  if (streak.count > 0) {
    const badge = $("streak-badge");
    badge.classList.remove("hidden");
    $("streak-count").textContent = streak.count;
  }

  // ── Big number ───────────────────────────────────────────────
  $("total-mins").innerHTML = `${toMinInt(today.totalSeconds)}<span class="sm-total-unit">m</span>`;
  renderRing(today.totalSeconds, budgetSeconds);
  renderBudgetBar(today.totalSeconds, budgetSeconds, budgetMins);

  // ── Site bars ────────────────────────────────────────────────
  renderSiteBars(today.sites);

  // ── Week mini ────────────────────────────────────────────────
  renderWeekMini(historyData);

  // ── Populate settings ────────────────────────────────────────
  $("budget-slider").value          = budgetMins;
  $("budget-display").textContent   = `${budgetMins} min`;
  $("toggle-pomodoro").checked      = currentPrefs.pomodoroActive ?? true;
  $("toggle-sound").checked         = currentPrefs.soundEnabled   ?? true;
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initSettings();
  initExport();
  load();
});
