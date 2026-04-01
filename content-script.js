// ================================================================
//  ScrollMirror v2 — content-script.js
//  Features: per-site tracking, escalating badge colors,
//            Pomodoro budget enforcement, bowl chime, breathing modal
// ================================================================

(() => {
  const TAG = "[ScrollMirror]";
  if (window.__scrollMirrorV2) return;
  window.__scrollMirrorV2 = true;

  // ── Site Detection ────────────────────────────────────────────
  const hostname = location.hostname;
  const SITE =
    hostname.includes("instagram") ? "instagram" :
    hostname.includes("tiktok")    ? "tiktok"    :
    hostname.includes("youtube")   ? "youtube"   : "unknown";

  if (SITE === "unknown") return;
  console.log(`${TAG} Active on site: ${SITE}`);

  // ── State ─────────────────────────────────────────────────────
  let totalSeconds   = 0;   // today's total (all sites, from BG)
  let siteSeconds    = 0;   // today's seconds on this site
  let budgetSeconds  = 3600; // default 60min budget
  let pomodoroActive = true;
  let soundEnabled   = true;
  let budgetHit      = false;
  let lastActiveTime = 0;
  let localAccum     = 0;   // unsync'd seconds
  let syncCounter    = 0;

  const ACTIVE_GAP_MS   = 2000;
  const SYNC_EVERY_SECS = 10;

  // ── Passive Activity Listeners ────────────────────────────────
  function markActive() { lastActiveTime = Date.now(); }
  const pOpts = { passive: true };
  window.addEventListener("scroll",    markActive, pOpts);
  window.addEventListener("wheel",     markActive, pOpts);
  window.addEventListener("touchmove", markActive, pOpts);
  window.addEventListener("mousemove", markActive, pOpts);

  // ── Web Audio: Bowl Chime ─────────────────────────────────────
  function playBowlChime() {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;

      // Fundamental + two harmonics for a singing-bowl feel
      const freqs = [432, 864, 1296];
      freqs.forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now);
        // Each harmonic decays faster
        gain.gain.setValueAtTime(i === 0 ? 0.35 : 0.15 / (i + 1), now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.5 - i * 0.8);
        osc.start(now);
        osc.stop(now + 3.5);
      });

      // Gentle attack
      setTimeout(() => ctx.close(), 4000);
    } catch (e) {
      console.warn(`${TAG} Audio failed:`, e.message);
    }
  }

  // ── Badge Color by Time ───────────────────────────────────────
  //   green <15min | teal <30min | amber <60min | red ≥60min
  function getBadgeTheme(seconds) {
    const min = seconds / 60;
    if (min < 15)  return { bg: "rgba(10,25,20,0.6)",  border: "rgba(80,220,140,0.4)",  glow: "rgba(60,200,120,0.3)",  text: "#7fefb2", dot: "#52e890" };
    if (min < 30)  return { bg: "rgba(10,20,30,0.6)",  border: "rgba(80,180,255,0.4)",  glow: "rgba(60,160,255,0.3)",  text: "#90d4ff", dot: "#52b8ff" };
    if (min < 60)  return { bg: "rgba(30,18,5,0.65)",  border: "rgba(255,170,50,0.45)", glow: "rgba(255,150,30,0.3)",  text: "#ffd080", dot: "#ffa820" };
    return           { bg: "rgba(30,8,8,0.65)",  border: "rgba(255,80,80,0.5)",  glow: "rgba(255,60,60,0.35)", text: "#ffaaaa", dot: "#ff5555" };
  }

  function getBadgeEmoji(seconds) {
    const min = seconds / 60;
    if (min < 5)  return "✨";
    if (min < 15) return "🌀";
    if (min < 30) return "😮";
    if (min < 60) return "🔥";
    return "🚨";
  }

  // ── Inject Styles ─────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("sm-styles-v2")) return;
    const s = document.createElement("style");
    s.id = "sm-styles-v2";
    s.textContent = `
      /* ── Badge ── */
      #sm-badge {
        position: fixed; bottom: 24px; right: 20px;
        z-index: 2147483647;
        display: flex; align-items: center; gap: 8px;
        padding: 10px 16px; border-radius: 999px;
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        border: 1.5px solid transparent;
        color: #e8d8ff;
        font-family: 'SF Pro Rounded','Nunito','Segoe UI',system-ui,sans-serif;
        font-size: 13.5px; font-weight: 700; letter-spacing: 0.02em;
        cursor: pointer; user-select: none;
        transition: all 0.5s ease;
        animation: sm-float 4s ease-in-out infinite;
      }
      #sm-badge:hover { transform: scale(1.08) translateY(-2px) !important; animation: none !important; }
      .sm-dot {
        width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
        animation: sm-blink 2s ease-in-out infinite;
      }
      .sm-streak-pill {
        font-size: 11px; padding: 2px 7px; border-radius: 999px;
        background: rgba(255,200,80,0.18); border: 1px solid rgba(255,200,80,0.35);
        color: #ffd060; font-weight: 800; letter-spacing: 0.03em;
      }
      @keyframes sm-float {
        0%,100% { transform: translateY(0); }
        50%      { transform: translateY(-3px); }
      }
      @keyframes sm-blink {
        0%,100% { opacity:1; }
        50%      { opacity:0.3; }
      }
      /* ── Budget bar ── */
      #sm-budget-bar {
        position: fixed; bottom: 0; left: 0; right: 0;
        height: 3px; z-index: 2147483646;
        background: rgba(255,255,255,0.05);
        transition: opacity 0.5s;
      }
      #sm-budget-fill {
        height: 100%; border-radius: 0 3px 3px 0;
        transition: width 1s linear, background 0.5s ease;
      }
      /* ── Pomodoro break overlay ── */
      #sm-pomodoro-overlay {
        position: fixed; inset: 0; z-index: 2147483647;
        background: rgba(5,2,15,0.95);
        backdrop-filter: blur(20px);
        display: flex; align-items: center; justify-content: center;
        font-family: 'SF Pro Rounded','Nunito','Segoe UI',system-ui,sans-serif;
        animation: sm-fade-in 0.4s ease;
      }
      #sm-pomodoro-card {
        text-align: center; padding: 48px 40px;
        background: rgba(18,10,38,0.9);
        border: 1.5px solid rgba(255,100,100,0.25);
        border-radius: 32px;
        box-shadow: 0 0 80px rgba(255,80,80,0.15), 0 24px 64px rgba(0,0,0,0.6);
        max-width: 360px; width: 90vw;
        animation: sm-card-in 0.45s cubic-bezier(0.34,1.56,0.64,1);
      }
      #sm-pom-title { font-size: 22px; font-weight: 900; color: #ffaaaa; margin-bottom: 8px; }
      #sm-pom-sub   { font-size: 13px; color: rgba(255,180,180,0.55); margin-bottom: 28px; font-weight: 500; }
      #sm-pom-timer {
        font-size: 64px; font-weight: 900; color: #ff8a8a;
        letter-spacing: -0.04em; line-height: 1;
        text-shadow: 0 0 30px rgba(255,100,100,0.5);
        margin-bottom: 8px;
      }
      #sm-pom-timer-label { font-size: 11px; color: rgba(255,180,180,0.4); letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 32px; }
      #sm-pom-btn {
        padding: 13px 36px; border-radius: 999px; border: none;
        background: linear-gradient(135deg, #ff6b6b, #c0392b);
        color: #fff; font-size: 15px; font-weight: 800; font-family: inherit;
        cursor: pointer; box-shadow: 0 4px 24px rgba(255,80,80,0.4);
        transition: transform 0.2s, box-shadow 0.2s;
        letter-spacing: 0.01em;
      }
      #sm-pom-btn:hover { transform: scale(1.05) translateY(-1px); box-shadow: 0 6px 32px rgba(255,80,80,0.6); }
      /* ── Breathing modal ── */
      #sm-modal {
        position: fixed; inset: 0; z-index: 2147483647;
        display: flex; align-items: center; justify-content: center;
        background: rgba(8,4,20,0.88);
        backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
        font-family: 'SF Pro Rounded','Nunito','Segoe UI',system-ui,sans-serif;
        animation: sm-fade-in 0.35s ease;
      }
      #sm-modal-card {
        display: flex; flex-direction: column; align-items: center; gap: 18px;
        padding: 40px 36px; border-radius: 28px;
        background: rgba(22,14,44,0.85);
        border: 1.5px solid rgba(180,140,255,0.2);
        box-shadow: 0 0 60px rgba(140,80,255,0.2), 0 20px 60px rgba(0,0,0,0.5);
        max-width: 340px; width: 90vw; text-align: center;
        animation: sm-card-in 0.4s cubic-bezier(0.34,1.56,0.64,1);
      }
      #sm-modal-title { font-size: 18px; font-weight: 800; color: #e8d8ff; }
      #sm-modal-sub   { font-size: 13px; color: rgba(200,180,255,0.55); margin-top: -10px; font-weight: 500; }
      #sm-breath-ring {
        stroke: url(#sm-grad); stroke-width: 5; fill: none; stroke-linecap: round;
        animation: sm-breathe 4s ease-in-out infinite;
        transform-origin: center; transform-box: fill-box;
      }
      #sm-breath-glow {
        stroke: rgba(180,130,255,0.12); stroke-width: 20; fill: none; stroke-linecap: round;
        animation: sm-breathe-glow 4s ease-in-out infinite;
        transform-origin: center; transform-box: fill-box;
      }
      @keyframes sm-breathe {
        0%,100% { stroke-dashoffset: 502; opacity: 0.5; }
        50%      { stroke-dashoffset: 0;   opacity: 1; }
      }
      @keyframes sm-breathe-glow {
        0%,100% { opacity:0; transform: scale(0.9); }
        50%      { opacity:1; transform: scale(1.05); }
      }
      #sm-breath-label   { font-size: 13px; font-weight: 700; color: rgba(200,180,255,0.7); letter-spacing: 0.12em; text-transform: uppercase; animation: sm-breath-text 4s ease-in-out infinite; }
      #sm-countdown      { font-size: 38px; font-weight: 900; color: #c9a8ff; line-height: 1; letter-spacing: -0.03em; text-shadow: 0 0 20px rgba(180,130,255,0.5); }
      #sm-countdown-lbl  { font-size: 11px; color: rgba(200,180,255,0.45); letter-spacing: 0.1em; text-transform: uppercase; margin-top: -10px; }
      @keyframes sm-breath-text { 0%,100%{opacity:0.5;} 50%{opacity:1;} }
      #sm-close-btn {
        padding: 12px 32px; border-radius: 999px; border: none;
        background: linear-gradient(135deg, #a855f7, #7c3aed);
        color: #fff; font-size: 15px; font-weight: 800; font-family: inherit;
        cursor: pointer; box-shadow: 0 4px 20px rgba(140,80,255,0.45);
        transition: transform 0.2s, box-shadow 0.2s;
      }
      #sm-close-btn:hover { transform: scale(1.05) translateY(-1px); box-shadow: 0 6px 28px rgba(140,80,255,0.65); }
      @keyframes sm-fade-in { from{opacity:0;} to{opacity:1;} }
      @keyframes sm-card-in { from{transform:scale(0.85) translateY(20px);opacity:0;} to{transform:scale(1) translateY(0);opacity:1;} }
    `;
    document.head.appendChild(s);
  }

  // ── Badge ─────────────────────────────────────────────────────
  let badgeEl = null;

  function createBadge() {
    if (badgeEl) return;
    injectStyles();
    badgeEl = document.createElement("div");
    badgeEl.id = "sm-badge";
    badgeEl.setAttribute("role", "button");
    badgeEl.setAttribute("tabindex", "0");
    badgeEl.setAttribute("aria-label", "ScrollMirror: tap to see scroll stats and take a breathing break");
    document.body.appendChild(badgeEl);
    badgeEl.addEventListener("click", openBreathModal);
    badgeEl.addEventListener("keydown", e => { if (e.key==="Enter"||e.key===" ") openBreathModal(); });

    // Budget bar
    const bar  = document.createElement("div"); bar.id = "sm-budget-bar";
    const fill = document.createElement("div"); fill.id = "sm-budget-fill";
    bar.appendChild(fill);
    document.body.appendChild(bar);

    updateBadge();
  }

  function updateBadge() {
    if (!badgeEl) return;
    const theme = getBadgeTheme(totalSeconds);
    const emoji = getBadgeEmoji(totalSeconds);
    const mins  = Math.floor(totalSeconds / 60);

    badgeEl.style.cssText = `
      position:fixed; bottom:24px; right:20px; z-index:2147483647;
      display:flex; align-items:center; gap:8px; padding:10px 16px;
      border-radius:999px; cursor:pointer; user-select:none;
      font-family:'SF Pro Rounded','Nunito','Segoe UI',system-ui,sans-serif;
      font-size:13.5px; font-weight:700; letter-spacing:0.02em;
      transition: all 0.5s ease;
      backdrop-filter:blur(20px) saturate(180%);
      -webkit-backdrop-filter:blur(20px) saturate(180%);
      background:${theme.bg};
      border:1.5px solid ${theme.border};
      box-shadow: 0 0 22px ${theme.glow}, 0 4px 24px rgba(0,0,0,0.4);
      color:${theme.text};
      animation: sm-float 4s ease-in-out infinite;
    `;

    // Streak pill
    const streakHTML = window.__smStreak > 0
      ? `<span class="sm-streak-pill">🔥 ${window.__smStreak}</span>`
      : "";

    badgeEl.innerHTML = `
      <span class="sm-dot" style="background:${theme.dot};box-shadow:0 0 8px ${theme.dot};width:8px;height:8px;border-radius:50%;flex-shrink:0;animation:sm-blink 2s ease-in-out infinite;"></span>
      <span>${emoji} ${mins}m</span>
      ${streakHTML}
    `;

    // Budget progress bar
    const fill = document.getElementById("sm-budget-fill");
    if (fill && pomodoroActive) {
      const pct = Math.min(100, (totalSeconds / budgetSeconds) * 100);
      const barColor = pct < 50 ? "#52e890" : pct < 80 ? "#ffa820" : "#ff5555";
      fill.style.width = `${pct}%`;
      fill.style.background = barColor;
    }
  }

  // ── Pomodoro Break Overlay ────────────────────────────────────
  let pomodoroEl = null;
  let pomTimer   = null;

  function showPomodoroBreak() {
    if (pomodoroEl) return;
    injectStyles();
    budgetHit = true;

    let remaining = 300; // 5 minutes

    pomodoroEl = document.createElement("div");
    pomodoroEl.id = "sm-pomodoro-overlay";
    pomodoroEl.setAttribute("role", "alertdialog");
    pomodoroEl.setAttribute("aria-modal", "true");
    pomodoroEl.setAttribute("aria-label", "Scroll budget reached — take a 5 minute break");

    pomodoroEl.innerHTML = `
      <div id="sm-pomodoro-card">
        <div id="sm-pom-title">Budget Reached 🚨</div>
        <div id="sm-pom-sub">You've hit your ${Math.floor(budgetSeconds/60)}-min scroll goal.<br>Time for a short break!</div>
        <div id="sm-pom-timer">${fmtCountdown(remaining)}</div>
        <div id="sm-pom-timer-label">break time remaining</div>
        <button id="sm-pom-btn" aria-label="Skip break and continue browsing">Skip break</button>
      </div>
    `;
    document.body.appendChild(pomodoroEl);

    pomTimer = setInterval(() => {
      remaining--;
      const el = document.getElementById("sm-pom-timer");
      if (el) el.textContent = fmtCountdown(remaining);
      if (remaining <= 0) closePomodoroBreak(true);
    }, 1000);

    document.getElementById("sm-pom-btn").addEventListener("click", () => closePomodoroBreak(false));
    playBowlChime();
  }

  function fmtCountdown(s) {
    return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  }

  function closePomodoroBreak(natural) {
    clearInterval(pomTimer);
    if (pomodoroEl) { pomodoroEl.remove(); pomodoroEl = null; }
    if (natural) {
      // Reset budget window — allow another full budget
      budgetHit = false;
      console.log(`${TAG} Break complete, resetting budget window.`);
    }
  }

  // ── Breathing Modal ───────────────────────────────────────────
  let modalEl        = null;
  let breathInterval = null;
  let countdownTimer = null;

  function openBreathModal() {
    if (modalEl) return;
    injectStyles();
    let remaining = 30;

    modalEl = document.createElement("div");
    modalEl.id = "sm-modal";
    modalEl.setAttribute("role", "dialog");
    modalEl.setAttribute("aria-modal", "true");
    modalEl.setAttribute("aria-label", "ScrollMirror breathing break");

    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;

    modalEl.innerHTML = `
      <div id="sm-modal-card">
        <p id="sm-modal-title">Take a breath 🌬️</p>
        <p id="sm-modal-sub">You've scrolled ${mins}m ${secs}s today on ${SITE}</p>
        <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden="true">
          <defs>
            <linearGradient id="sm-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#c084fc"/>
              <stop offset="100%" stop-color="#818cf8"/>
            </linearGradient>
          </defs>
          <circle cx="70" cy="70" r="60" stroke="rgba(180,140,255,0.08)" stroke-width="5" fill="none"/>
          <circle id="sm-breath-glow" cx="70" cy="70" r="60"
                  stroke-dasharray="502" stroke-dashoffset="0"
                  transform="rotate(-90 70 70)"/>
          <circle id="sm-breath-ring" cx="70" cy="70" r="60"
                  stroke-dasharray="502" stroke-dashoffset="502"
                  transform="rotate(-90 70 70)"/>
        </svg>
        <p id="sm-breath-label" aria-live="polite">breathe in…</p>
        <p id="sm-countdown" aria-live="polite" aria-label="seconds remaining">${remaining}</p>
        <p id="sm-countdown-lbl">seconds left</p>
        <button id="sm-close-btn" aria-label="End breathing session">I'm good ✓</button>
      </div>
    `;
    document.body.appendChild(modalEl);

    let phase = 0;
    const phases = ["breathe in…","hold…","breathe out…","hold…"];
    breathInterval = setInterval(() => {
      phase = (phase + 1) % phases.length;
      const el = document.getElementById("sm-breath-label");
      if (el) el.textContent = phases[phase];
    }, 2000);

    countdownTimer = setInterval(() => {
      remaining--;
      const cd = document.getElementById("sm-countdown");
      if (cd) cd.textContent = remaining;
      if (remaining <= 0) closeBreathModal();
    }, 1000);

    document.getElementById("sm-close-btn").addEventListener("click", closeBreathModal);
    modalEl.addEventListener("click", e => { if (e.target === modalEl) closeBreathModal(); });
    document.addEventListener("keydown", escListener);
  }

  function escListener(e) { if (e.key === "Escape") closeBreathModal(); }

  function closeBreathModal() {
    clearInterval(breathInterval);
    clearInterval(countdownTimer);
    breathInterval = countdownTimer = null;
    if (modalEl) { modalEl.remove(); modalEl = null; }
    document.removeEventListener("keydown", escListener);
    playBowlChime();
  }

  // ── Main Tick ─────────────────────────────────────────────────
  const tickInterval = setInterval(() => {
    const active = (Date.now() - lastActiveTime) < ACTIVE_GAP_MS;
    if (active) {
      totalSeconds++;
      siteSeconds++;
      localAccum++;
      syncCounter++;
      updateBadge();

      // Check Pomodoro budget
      if (pomodoroActive && !budgetHit && totalSeconds >= budgetSeconds) {
        showPomodoroBreak();
      }
    }

    if (syncCounter >= SYNC_EVERY_SECS) {
      syncToBackground(localAccum);
      localAccum   = 0;
      syncCounter  = 0;
    }
  }, 1000);

  // ── Background Sync ───────────────────────────────────────────
  async function syncToBackground(seconds) {
    if (seconds <= 0) return;
    try {
      const res = await chrome.runtime.sendMessage({ type: "ADD_SECONDS", seconds, site: SITE });
      if (res?.success) {
        totalSeconds = res.today.totalSeconds;
        siteSeconds  = res.today.sites[SITE] || 0;
      }
    } catch (e) { console.warn(`${TAG} Sync error:`, e.message); }
  }

  async function init() {
    console.log(`${TAG} v2 init on ${SITE}`);
    try {
      const res = await chrome.runtime.sendMessage({ type: "GET_STATE" });
      if (res?.success) {
        totalSeconds   = res.today.totalSeconds;
        siteSeconds    = res.today.sites[SITE] || 0;
        budgetSeconds  = (res.prefs.budgetMinutes || 60) * 60;
        pomodoroActive = res.prefs.pomodoroActive ?? true;
        soundEnabled   = res.prefs.soundEnabled  ?? true;
        window.__smStreak = res.streak?.count || 0;
      }
    } catch (e) { console.warn(`${TAG} Init error:`, e.message); }
    createBadge();
  }

  // Listen for prefs updates from popup
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "PREFS_UPDATED") {
      budgetSeconds  = (msg.prefs.budgetMinutes || 60) * 60;
      pomodoroActive = msg.prefs.pomodoroActive ?? true;
      soundEnabled   = msg.prefs.soundEnabled   ?? true;
    }
  });

  if (document.body) { init(); }
  else { document.addEventListener("DOMContentLoaded", init); }

})();
