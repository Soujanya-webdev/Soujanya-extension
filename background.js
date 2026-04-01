// ================================================================
//  ScrollMirror v2 — background.js (Manifest V3 Service Worker)
//  Handles: daily reset, per-site storage, 7-day history,
//           streak calculation, Pomodoro budget enforcement.
// ================================================================

const TAG = "[ScrollMirror BG]";

// ── Date Helpers ────────────────────────────────────────────────

function getTodayString() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;
}

function getPastDates(days) {
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);
  }
  return dates;
}

// ── Storage Schema ──────────────────────────────────────────────
//
//  chrome.storage.local keys:
//
//  "today"   → { date, totalSeconds, sites: { instagram, tiktok, youtube } }
//  "history" → { "2026-03-22": { totalSeconds, sites:{…} }, … }  (7 days)
//  "streak"  → { count, lastLowScrollDate }
//  "prefs"   → { budgetMinutes: 60, pomodoroActive: false, soundEnabled: true }
//
// ────────────────────────────────────────────────────────────────

const DEFAULT_TODAY = (date) => ({
  date,
  totalSeconds: 0,
  sites: { instagram: 0, tiktok: 0, youtube: 0 }
});

const DEFAULT_PREFS = {
  budgetMinutes: 60,
  pomodoroActive: true,
  soundEnabled: true
};

async function getStorage(...keys) {
  return chrome.storage.local.get(keys);
}

async function setStorage(obj) {
  return chrome.storage.local.set(obj);
}

// ── Daily Reset Logic ───────────────────────────────────────────

async function getTodayData() {
  const today = getTodayString();
  const { today: stored, history, streak } = await getStorage("today", "history", "streak");

  if (stored?.date === today) {
    return stored;
  }

  // ── It's a new day: archive yesterday, update streak ──────────
  const prevData = stored || DEFAULT_TODAY(today);
  const hist = history || {};

  if (stored?.date) {
    hist[stored.date] = {
      totalSeconds: stored.totalSeconds,
      sites: stored.sites
    };
  }

  // Keep only last 7 days
  const keys = Object.keys(hist).sort();
  while (keys.length > 7) {
    delete hist[keys.shift()];
  }

  // Streak: "low scroll day" = under 30 min (1800s)
  const LOW_THRESHOLD = 1800;
  let streakData = streak || { count: 0, lastLowScrollDate: null };
  if (stored?.totalSeconds !== undefined) {
    const wasLow = stored.totalSeconds < LOW_THRESHOLD;
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,"0")}-${String(yesterday.getDate()).padStart(2,"0")}`;
    if (wasLow && streakData.lastLowScrollDate === yStr) {
      streakData.count++;  
    } else if (wasLow) {
      streakData.count = 1;
    } else {
      streakData.count = 0;
    }
    if (wasLow) streakData.lastLowScrollDate = stored.date;
  }

  const fresh = DEFAULT_TODAY(today);
  await setStorage({ today: fresh, history: hist, streak: streakData });
  console.log(`${TAG} New day → reset. Streak=${streakData.count}`);  
  return fresh;
}

// ── Message Handler ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log(`${TAG} Message: ${msg.type}`);

  (async () => {
    try {
      switch (msg.type) {

        // ── GET_STATE: content script boots, needs full state ──
        case "GET_STATE": {
          const todayData  = await getTodayData();
          const { history, streak, prefs } = await getStorage("history", "streak", "prefs");
          sendResponse({
            success: true,
            today: todayData,
            history: history || {},
            streak: streak || { count: 0, lastLowScrollDate: null },
            prefs: { ...DEFAULT_PREFS, ...(prefs || {}) }
          });
          break;
        }

        // ── ADD_SECONDS: content script reports N new seconds ──
        case "ADD_SECONDS": {
          const { seconds, site } = msg;
          const todayData = await getTodayData();
          todayData.totalSeconds += seconds;
          if (site && todayData.sites[site] !== undefined) {
            todayData.sites[site] += seconds;
          }
          await setStorage({ today: todayData });
          sendResponse({ success: true, today: todayData });
          break;
        }

        // ── GET_PREFS: popup reads user preferences ────────────
        case "GET_PREFS": {
          const { prefs } = await getStorage("prefs");
          sendResponse({ success: true, prefs: { ...DEFAULT_PREFS, ...(prefs || {}) } });
          break;
        }

        // ── SET_PREFS: popup writes user preferences ───────────
        case "SET_PREFS": {
          const { prefs: existing } = await getStorage("prefs");
          const merged = { ...DEFAULT_PREFS, ...(existing || {}), ...msg.prefs };
          await setStorage({ prefs: merged });
          sendResponse({ success: true, prefs: merged });
          break;
        }

        // ── GET_HISTORY: popup requests 7-day data ─────────────
        case "GET_HISTORY": {
          const todayData  = await getTodayData();
          const { history, streak, prefs } = await getStorage("history", "streak", "prefs");
          const dates      = getPastDates(7);
          const hist       = history || {};
          // Inject today into history view
          hist[todayData.date] = { totalSeconds: todayData.totalSeconds, sites: todayData.sites };
          const ordered = dates.map(d => ({
            date: d,
            totalSeconds: hist[d]?.totalSeconds || 0,
            sites: hist[d]?.sites || { instagram: 0, tiktok: 0, youtube: 0 }
          }));
          sendResponse({
            success: true,
            history: ordered,
            streak: streak || { count: 0 },
            prefs: { ...DEFAULT_PREFS, ...(prefs || {}) },
            today: todayData
          });
          break;
        }

        // ── EXPORT_CSV: popup requests downloadable CSV ────────
        case "EXPORT_CSV": {
          const todayData  = await getTodayData();
          const { history } = await getStorage("history");
          const dates       = getPastDates(7);
          const hist        = history || {};
          hist[todayData.date] = { totalSeconds: todayData.totalSeconds, sites: todayData.sites };

          let csv = "Date,Total Minutes,Instagram Minutes,TikTok Minutes,YouTube Minutes\n";
          dates.forEach(d => {
            const row = hist[d] || { totalSeconds: 0, sites: { instagram:0, tiktok:0, youtube:0 } };
            const toMin = s => (s/60).toFixed(1);
            csv += `${d},${toMin(row.totalSeconds)},${toMin(row.sites.instagram||0)},${toMin(row.sites.tiktok||0)},${toMin(row.sites.youtube||0)}\n`;
          });
          sendResponse({ success: true, csv });
          break;
        }

        default:
          sendResponse({ success: false, error: `Unknown type: ${msg.type}` });
      }
    } catch (err) {
      console.error(`${TAG} Error:`, err);
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true; // async response
});

// ── Alarm: midnight daily reset trigger ────────────────────────

chrome.alarms.create("dailyReset", { when: getNextMidnight(), periodInMinutes: 1440 });

function getNextMidnight() {
  const t = new Date();
  t.setHours(24, 0, 0, 0);
  return t.getTime();
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "dailyReset") {
    await getTodayData(); // triggers the reset logic
    console.log(`${TAG} Midnight reset triggered.`);
  }
});

console.log(`${TAG} Service worker v2 started.`);
