 # ScrollMirror v2 — Chrome Extension

Gentle real-time scroll-time awareness for Instagram, TikTok & YouTube.  
Built for teens. No tracking. No accounts. All data stays on your device.

---

## WHAT IS SCROLLMIRROR

ScrollMirror is a Manifest V3 Chrome extension that quietly counts how many seconds you've been actively scrolling today — not just how long a tab was open, but real interaction.

It surfaces this as a soft glowing badge on Instagram, TikTok, and YouTube.  
You can tap the badge anytime to trigger a 30-second guided breathing break.  
The popup dashboard provides a 7-day history, per-site breakdown, streak counter, and Pomodoro-based usage budgeting.

There is no backend, no tracking, and no data leaves your device.

---

## CORE PRINCIPLES

Awareness over restriction  
Privacy-first architecture (100% local storage)  
Zero network requests  
Designed for real teen attention behavior patterns  

---

## PROJECT STATS

| Field        | Value |
|--------------|------|
| Version      | 2.0 |
| Manifest     | V3 (Service Worker) |
| Target Sites | Instagram · TikTok · YouTube |
| Permissions  | activeTab · scripting · storage · alarms |
| Dependencies | Chart.js (bundled locally, no CDN) |
| Storage      | chrome.storage.local (device-only) |

---

## FEATURES

### LIVE FLOATING BADGE

A glassmorphism-style UI element that updates every second and reflects real scroll activity.

Color escalation thresholds:
- 15 minutes → subtle green
- 30 minutes → teal
- 60 minutes → amber/red

---

### PER-SITE TRACKING

Scroll time is tracked independently across:
- Instagram  
- TikTok  
- YouTube  

Each platform contributes to both individual and total daily metrics.

---

### STREAK COUNTER

Tracks consecutive low-scroll days (under 30 minutes).  
Displayed in both the floating badge and popup dashboard.

---

### 7-DAY ANALYTICS

A stacked bar chart visualizes usage patterns over the past 7 days.  
Data is broken down per platform and rendered using a locally bundled Chart.js instance.

---

### POMODORO MODE

When the daily scroll budget is exceeded, a full-screen break overlay is triggered.  
This enforces intentional disengagement without hard blocking.

---

### BREATHING MODAL

A 30-second guided breathing session initiated via badge click.  
Includes an SVG-based animated breathing ring for pacing.

---

### AUDIO FEEDBACK

A bowl chime is generated using the Web Audio API.  
Frequencies used: 432 Hz, 864 Hz, 1296 Hz with exponential decay.

---

### CSV EXPORT

Users can download their 7-day scroll history instantly as a CSV file.  
The file is generated locally using browser Blob APIs.

---

### SETTINGS PANEL

Customizable preferences include:
- Daily scroll budget (15 minutes to 3 hours)
- Pomodoro mode toggle
- Sound enable/disable toggle

---
## HOW TO LOAD (UNPACKED)

1. Open `chrome://extensions`  
2. Enable **Developer Mode** (top-right toggle)  
3. Click **Load unpacked**  
4. Select the `ScrollMirrorV2` directory  

### Once loaded

- Visit Instagram, TikTok, or YouTube  
- The floating badge appears in the bottom-right  
- Click the extension icon to open the dashboard  

---

## TESTING GUIDE

### SCROLL TRACKING

- Open YouTube (or any supported platform)  
- Scroll for approximately 30 seconds  
- Observe the floating badge updating in real time  

---

## PRIVACY

All data is stored exclusively in `chrome.storage.local` on the user's device.

There are:

- No network requests  
- No analytics scripts  
- No user accounts  
- No external data transmission  

---

## PHILOSOPHY

ScrollMirror does not attempt to block behavior or enforce discipline through restriction.

Instead, it provides visibility into actual usage patterns, enabling self-regulation through awareness.

**Awareness precedes control.**
