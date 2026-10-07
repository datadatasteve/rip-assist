# rip-assist V1: Initial build test checklist

**Setup before testing**

- **Desktop (D):** Chrome or Edge on the Mac at https://datadatasteve.github.io/rip-assist/
- **Mobile (M):** iPhone Safari. Install it in section 15 *before* the push tests in section 14.
- Sign in with the **same account** on both. Keep both open side by side for the **⇄ sync** items.
- **"Both"** means do the item on desktop, then repeat it on mobile.
- Mark each item ✅ / ❌ and note anything odd in the Notes column.
- **Prerequisites:** startup.md's first-run checklist is complete, the Mac is awake with Ollama listening on the tailnet, and at least one cloud key is set.

> ⇄ = cross-device sync check. Do the action on one device and confirm the result appears on the **other device within about 2 s, without reloading**.

---

## 1. Auth

| # | Device | Action | Expected | ✅/❌ | Notes |
|---|---|---|---|---|---|
| 1.1 | D | Open the app signed out → **Sign up** with a new email + password (8+ chars) | Either signed straight in to "Good morning/afternoon/evening", or told to confirm by email (if confirmations are on) | | |
| 1.2 | D | If asked to confirm: click the link in the email | It opens the GitHub Pages app (not localhost) and you're signed in | | |
| 1.3 | D | Settings → **Sign out** | Back on the sign-in screen | | |
| 1.4 | D | Sign in with a wrong password | Error "Invalid login credentials"; stays on the form | | |
| 1.5 | D | Sign in with the right password | Dashboard loads | | |
| 1.6 | M | Sign in on the phone with the same account | Dashboard loads; bottom tab bar visible | | |
| 1.7 | D | Reload the page | Still signed in (session persisted) | | |
| 1.8 | D | **Forgot password?** → enter your email | "Password reset email sent" message; the email arrives | | |

## 2. Lanes (all three types)

| # | Device | Action | Expected | ✅/❌ | Notes |
|---|---|---|---|---|---|
| 2.1 | D | Lanes → **+ Lane** → name "Work", type Persistent, icon 💼, pick a color → Save | "Work" row appears with a colored left border | | |
| 2.2 | D ⇄ M | Look at the phone's Lanes tab | "Work" is already there without a reload | | |
| 2.3 | M | **+ Lane** → "Website launch", type **Project** → Save | Row appears on the phone | | |
| 2.4 | M ⇄ D | Look at desktop | "Website launch" appears live | | |
| 2.5 | D | **+ Lane** → "Trip prep", type **Temporary**, leave End date blank → Save | Error "Temporary lanes need an end date" | | |
| 2.6 | D | Set an end date → Save | Lane created | | |
| 2.7 | D | Tap the lane name "Trip prep" → **Archive** | It leaves the grid and shows under "Archived lanes (1)" | | |
| 2.8 | D | Archived lanes → open it → **Unarchive** | Back in the grid | | |
| 2.9 | Both | Today page → Lanes section | One card per lane: icon, name, colored momentum dot, momentum number, active chunks, last activity | | |

## 3. Goals and tasks

| # | Device | Action | Expected | ✅/❌ | Notes |
|---|---|---|---|---|---|
| 3.1 | D | Tasks → **+ Goal** → "Ship v1", lane Website launch, priority 8 → Save | Goal listed with a yellow dot (flat) and momentum 50 | | |
| 3.2 | D | **+ Task** → "Write landing copy", lane Website launch, goal Ship v1, priority 7, due **today** → Save | Task listed; shows "due <today>" | | |
| 3.3 | M | **+ Task** → "Email accountant", lane Work, priority 4 → Save | Listed on the phone | | |
| 3.4 | M ⇄ D | Look at desktop Tasks | "Email accountant" appears live | | |
| 3.5 | D | Open "Write landing copy" | Detail shows status pills, momentum bar, "Last interaction …" | | |
| 3.6 | D | **+ Log progress** | Momentum goes 50 → 65 within about 3 s; label reads "rising" and turns green | | |
| 3.7 | D ⇄ M | Phone: Tasks list | The same task shows a green dot and 65 without a reload | | |
| 3.8 | D | **✎ Edit** → change the title → Save | New title in the modal and the list on both devices | | |
| 3.9 | D | Open "Email accountant" → **⏸ Waiting on…** → type "Accountant" | Yellow "waiting on Accountant" pill; status "waiting on" | | |
| 3.10 | D | **▶ Unblocked** | Back to active; momentum +10 | | |
| 3.11 | D | Open goal "Ship v1" | Tasks section lists "Write landing copy" | | |
| 3.12 | D | Status filter → "Complete" | Empty; then open a task → **✓ Complete** → it moves to this filter | | |
| 3.13 | D | Lane filter / Sort dropdowns | The list filters and re-orders correctly | | |
| 3.14 | D | Voice: tap 🎙 in a task title field → speak a phrase | The text is appended to the field; nothing is submitted until you press Save | | |
| 3.15 | M | Voice on the phone (Safari tab) | Same as 3.14. If it fails inside the installed PWA, note it (known iOS limitation). | | |

## 4. Chunks: creation and scheduling

| # | Device | Action | Expected | ✅/❌ | Notes |
|---|---|---|---|---|---|
| 4.1 | D | Open "Write landing copy" → **+ Chunk** → 45 min, start = today, 1 hour from now → Save | Chunk listed with its time; task momentum +5 ("scheduled soon") | | |
| 4.2 | D | Add a 2nd chunk overlapping the first (same start, 30 min) | Both are listed | | |
| 4.3 | D | Lanes → Day view, scroll to that time | Website launch row shows a **"2 chunks" badge** | | |
| 4.4 | D | Tap the badge | It expands into 2 stacked filled blocks and a "collapse" button | | |
| 4.5 | D | Add a chunk with **no** start time | No block on the timeline; the task still appears in the lane | | |
| 4.6 | D | Create a task with no chunks in Work | It shows as a **pill** in the Work lane header (unscheduled) | | |
| 4.7 | D | Click a chunk block → **✓ Complete** | The block turns faded with a strike-through; task +20 and goal +10 (check the momentum bars) | | |
| 4.8 | D ⇄ M | Phone: Lanes → Day | The completed chunk is shown as done on the phone too | | |
| 4.9 | M | Phone: tap the other chunk → **Skip** | It shows as skipped (hatched); task −10 | | |
| 4.10 | M ⇄ D | Desktop | The skip appears live | | |
| 4.11 | D | Chunk → **Edit / reschedule** → move it to tomorrow 10:00 | The block moves; it's visible after **›** (next day) | | |
| 4.12 | D | Week view | Colored mini-blocks on the correct days; today's column is highlighted | | |
| 4.13 | D | Month view | Dots on days with items; dot size grows with count | | |
| 4.14 | D | Goal "Ship v1" → **✨ AI break down** → Total minutes 300, days 7 → **Suggest chunks** | A proposed list summing to about 300 min, with rationale and a rating control | | |
| 4.15 | D | **Add N chunks** | The chunks are created under the goal and appear on the timeline | | |
| 4.16 | D | Today → **Upcoming** | Shows the next 3 scheduled, unfinished chunks in order | | |

## 5. Habits: creation and logging

| # | Device | Action | Expected | ✅/❌ | Notes |
|---|---|---|---|---|---|
| 5.1 | D | Habits → **+ Habit** "Walk", Daily → Save | Card with a 7-day grid and 🔥 0 | | |
| 5.2 | D | **+ Habit** "Gym", **Specific days**: Mon/Wed/Fri | Non-scheduled days are dimmed in the grid | | |
| 5.3 | D | **+ Habit** "Review finances", Weekly | Card created | | |
| 5.4 | D | Tap today's box for "Walk" | It fills in; 🔥 1; the ring at the top updates | | |
| 5.5 | D ⇄ M | Phone: Habits | "Walk" today is checked and the ring matches | | |
| 5.6 | M | Tap yesterday's and the day before's boxes for "Walk" | 🔥 3 | | |
| 5.7 | M ⇄ D | Desktop | 🔥 3 live | | |
| 5.8 | D | Untick today | 🔥 2 (today still counts as open, so the streak holds from yesterday) | | |
| 5.9 | D | Today page → Habits card | Ring shows done/due; list shows ✓/○ and streaks | | |
| 5.10 | D | Edit "Gym" → **Archive** | It disappears on both devices | | |

## 6. Check-ins: all three trigger modes

| # | Device | Action | Expected | ✅/❌ | Notes |
|---|---|---|---|---|---|
| **On-demand** | | | | | |
| 6.1 | D | Tap the **♥ Check-in** floating button | Check-in opens; subtitle "on demand" | | |
| 6.2 | D | Tap **A bit behind** → energy **2** → tap chips "Meetings", "Email / admin" + type text → Next → notes → **Submit** | "Checked in" screen with mood/energy pills and "Since last check-in: X done · Y missed · Z skipped" | | |
| 6.3 | D | Wait | An AI reply appears (≤ 3 sentences, one concrete action, one question, no "you got this"). Provider/model is shown. | | |
| 6.4 | D | Rate it: tap **3** → **high** | Shows "high 3" | | |
| 6.5 | D ⇄ M | Phone: Today page | The mood pill reflects the new check-in | | |
| 6.6 | M | Phone: do an on-demand check-in using voice 🎙 for the reflection | Submits; the AI reply shows | | |
| **Scheduled** | | | | | |
| 6.7 | D | Settings → Check-ins → add a scheduled time **2 minutes from now** → Add time | Pill appears; if push wasn't set up you're asked to enable it (see 14.1) | | |
| 6.8 | D | Wait until that time passes (app open) | Banner "Scheduled check-in — how's it going?" | | |
| 6.9 | D | Click **Check in** in the banner | Check-in opens with "scheduled"; after submitting, the banner is gone | | |
| 6.10 | M | Within 15 min of the scheduled time (cron grid), with the app closed | Push notification "Quick check-in?"; tapping it opens the check-in with trigger "scheduled" | | |
| **Random** | | | | | |
| 6.11 | D | Settings → Random check-ins per day = **3**, window = now−1h … now+3h | "Today's random times: …" lists 3 times spread across the window | | |
| 6.12 | Both | After the first random time passes | In-app "Random check-in" banner, plus push within 15 min | | |
| 6.13 | D | Answer it from the banner | Saved with triggered_by = random (Dev → Interactions shows the check-in reply; Supabase `checkins` row shows `random`) | | |
| **Behavioral signals** | | | | | |
| 6.14 | D | Leave a chunk scheduled in the past (not done) → new check-in | "missed" count includes it | | |

## 7. Plan re-suggestion and infeasibility

| # | Device | Action | Expected | ✅/❌ | Notes |
|---|---|---|---|---|---|
| 7.1 | D | Today → **Re-plan today** → **✨ Suggest a new plan** | Time-blocked list, deferred items, reasoning, rating | | |
| 7.2 | D | **Apply to my chunks** | Chunks move to the suggested times (check Lanes) | | |
| 7.3 | D | Schedule chunks totalling far more than your remaining free time today (e.g. a 600-min chunk) → reload Today | Yellow **"Today's plan doesn't fit"** card shown once | | |
| 7.4 | D/M | Within 15 min | One "Today's plan doesn't fit" push/in-app notification | | |
| 7.5 | D | **Dismiss** → reload | Not offered again today | | |

## 8. Google Calendar connect and display

| # | Device | Action | Expected | ✅/❌ | Notes |
|---|---|---|---|---|---|
| 8.1 | D | Settings → **Connect Google Calendar** → pick your account → allow (read-only) | Returns to Settings with "Google Calendar connected", your email, and a list of calendars | | |
| 8.2 | D | Calendar → lane dropdown: map your work calendar → Work | Saved | | |
| 8.3 | D | Lanes → Day | Today's events show as **bordered** blocks in the mapped lane; unmapped ones in a "📅 Calendar" row | | |
| 8.4 | D ⇄ M | Phone Lanes → Day | The same events are visible | | |
| 8.5 | D | Create an event in Google Calendar → Settings → **Sync now** | Appears in the lane view | | |
| 8.6 | D | Delete it in Google → Sync now | Disappears | | |
| 8.7 | D | Untick a calendar | Its events are removed after sync | | |
| 8.8 | D | Ask AI (Today) **without** the calendar box ticked → Dev → Interactions → open it | The prompt shows free slot *times* only, no event titles | | |
| 8.9 | D | Ask AI **with** "include calendar event details" ticked | The prompt includes event titles | | |
| 8.10 | – | Wait 30+ min with the app closed, then add an event and check after the next :00/:30 | Event shows without a manual sync (cron) | | |
| 8.11 | D | **Disconnect** | Calendar events removed; Connect button is back | | |

## 9. AI suggestions: Ollama and a cloud provider

| # | Device | Action | Expected | ✅/❌ | Notes |
|---|---|---|---|---|---|
| 9.1 | D | Today → **Next best action** card | The top suggestion shows with reasons and score; "Other candidates" expands | | |
| 9.2 | D | Mac awake + Ollama on tailnet → **✨ Ask AI** | Result shows "ollama · qwen2.5:14b"; first call may take 10–30 s | | |
| 9.3 | D | Rate it **low 4**, "Did you act on it?" → **Yes** | Saved (visible in Dev → Interactions) | | |
| 9.4 | M | Phone on cellular (Wi-Fi off) → Ask AI | Still works through Fly → tailnet → Ollama | | |
| 9.5 | D | Quit Ollama on the Mac → Ask AI | Answer comes from the next provider (e.g. groq); "fell back after 1" is shown | | |
| 9.6 | D | Dev → Interactions → failures only | A failed `ollama` attempt ("Ollama not reachable") is logged | | |
| 9.7 | D | Restart Ollama → Dev → Model registry → ★ on another Ollama model (e.g. qwen2.5:7b) → Ask AI | The new default answers | | |
| 9.8 | D | ★ qwen2.5:14b again | Default restored | | |
| 9.9 | D | Today → "AI $… today" pill | Updates live after each call ($0.0000 for free providers) | | |

## 10. Momentum display

| # | Device | Action | Expected | ✅/❌ | Notes |
|---|---|---|---|---|---|
| 10.1 | Both | Tasks list | Each item has a **colored dot** (overview: green rising / yellow flat / red falling) and a small bar | | |
| 10.2 | Both | Open an item | **Detail bar** 0–100 with number, arrow and trend word | | |
| 10.3 | D | Lane header and lane cards | Aggregate momentum dot per lane | | |
| 10.4 | D | Dev → Momentum → set an item's last interaction 5+ days back (Supabase table editor) → **Run decay pass** | Momentum −5 and "Decayed on" = today; running again doesn't decay twice | | |
| 10.5 | D | Set a due date in the past → Run decay pass | −20 once | | |
| 10.6 | D | Item trend turns falling | One "Momentum dropping" notification | | |
| 10.7 | D | Item stays below 10 for 3 days, or hits 0 | Status "dead" with a red banner on Tasks; **Revive** restores it | | |

## 11. Dev dashboard

| # | Device | Action | Expected | ✅/❌ | Notes |
|---|---|---|---|---|---|
| 11.1 | D | Settings → Developer → tick **Show Dev dashboard** | "Dev" appears in the nav on **both** devices (synced setting) | | |
| **Model registry** | | | | | |
| 11.2 | D | Dev → Model registry | Pills: Ollama endpoint (green), "via tailnet" (on Fly), provider-key pills | | |
| 11.3 | D | **Test** on qwen2.5:14b | "✓ …ms 'pong'" | | |
| 11.4 | D | **Test** on a cloud provider with a key | ✓ | | |
| 11.5 | D | **Test** on a provider without a key | Error "env var … not set" | | |
| 11.6 | D | Toggle a config off/on; change priority and tab away | Persists after reload | | |
| 11.7 | D | ✎ → set a per-feature override (e.g. checkin: 0 for groq) → Save | Overrides column shows it; the next check-in reply uses groq | | |
| 11.8 | D | Give two configs the same priority (A/B) → Ask AI several times | Both providers appear in the log | | |
| 11.9 | D | **Import Ollama models** | Reports the endpoint and any newly added models | | |
| **Interaction log** | | | | | |
| 11.10 | D | Dev → Interactions | Rows with feature, provider/model, ms, tokens, $, version, rating, acted | | |
| 11.11 | D | Search a word from a response; filter by feature and provider | Filters correctly | | |
| 11.12 | D | Click a row | Shows system/user prompt + response, with inline rating | | |
| 11.13 | D ⇄ M | Ask AI on the phone while the log is open on desktop | The new row appears at the top live | | |
| **Benchmarks** | | | | | |
| 11.14 | D | Benchmarks → select 2 scenarios + qwen2.5:14b and one cloud model → **Run 4 benchmarks** | Progress counter; 4 result cards (Agent Consistency counts ×3) | | |
| 11.15 | D | Mark Pass/Fail per criterion + add notes | "Score x/y · saved" | | |
| 11.16 | D | History tab | Scored summary per scenario × model; all runs list | | |
| **Trends / agents / cost** | | | | | |
| 11.17 | D | Trends | Rating-by-provider line chart with tooltip + legend, model×feature table, follow-through bar chart, rubric history | | |
| 11.18 | D | Agent editor → feature "checkin" → edit prompt → minor → **Deploy** | "Deployed checkin@1.1.0"; history shows it as live | | |
| 11.19 | D | Do a check-in → Interactions | New row tagged version 1.1.0; Trends → version table shows the before/after delta once rated | | |
| 11.20 | D | Roll back to the earlier version / **Reset to default** | The live version changes accordingly | | |
| 11.21 | D | Cost tab → switch 7d/30d and day/week/month | Totals and bar chart update; free calls counted | | |

## 12. Notifications: in-app feed

| # | Device | Action | Expected | ✅/❌ | Notes |
|---|---|---|---|---|---|
| 12.1 | D | Settings → Notifications → Send "Test notification" | 🔔 badge count +1 on **both** devices | | |
| 12.2 | M | Open 🔔 → tap the item | Navigates to its link; marked read; desktop badge drops too | | |
| 12.3 | D | **Mark all read** | Badge clears on both | | |

## 13. Offline / resilience

| # | Device | Action | Expected | ✅/❌ | Notes |
|---|---|---|---|---|---|
| 13.1 | M | Lock the phone 2+ min while you change data on desktop → unlock and open the app | The phone catches up within a couple of seconds (resync on visible) | | |
| 13.2 | M | Airplane mode → open the installed app | App shell loads (offline cache); data calls fail gracefully | | |
| 13.3 | M | Turn the network back on | Lists refresh automatically | | |
| 13.4 | D | First action after the backend has been idle 10+ min (e.g. Ask AI) | Works after a short cold-start delay (2–5 s) | | |

## 14. Push notifications

| # | Device | Action | Expected | ✅/❌ | Notes |
|---|---|---|---|---|---|
| 14.1 | D | Settings → Notifications → label "Mac · Chrome" → **Enable push here** → Allow | "subscribed"; device appears in "Subscribed devices" | | |
| 14.2 | M | Installed PWA → Settings → **Enable push here** → Allow | "iPhone · Safari" listed on **both** devices' device lists | | |
| 14.3 | D | Send → **Test notification** | "Sent to 2 device(s) + in-app"; a system notification appears on the Mac **and** the phone | | |
| 14.4 | M | Tap the notification with the app closed | App opens to the linked page | | |
| 14.5 | D | Send each type: Check-in reminder, Momentum alert, Waiting-on, Plan infeasible | Each arrives; tapping deep-links (check-in / tasks / today with re-plan) | | |
| 14.6 | D | **Disable push on this device** → Send test | Only the phone receives it | | |
| 14.7 | D | Waiting-on item older than 7 days (backdate `waiting_since` in Supabase) → wait for the hourly job | "Still blocked on …?" push | | |

## 15. PWA install

| # | Device | Action | Expected | ✅/❌ | Notes |
|---|---|---|---|---|---|
| 15.1 | D | Chrome/Edge: install banner or Settings → App → **Install rip-assist** | Installs; opens in its own window with the rip-assist icon | | |
| 15.2 | M | Safari → Share → **Add to Home Screen** | Icon on the home screen; opens full-screen without Safari chrome | | |
| 15.3 | M | Open from the icon | Already signed in, or sign in once; Settings → App says "Running as an installed app ✓" | | |
| 15.4 | D | DevTools → Application → Manifest / Service Workers | Manifest valid (192, 512, maskable icons); `sw.js` activated with scope `/rip-assist/` | | |

## 16. Mobile layout (390 px viewport)

Run on the iPhone, or in desktop Chrome DevTools → device toolbar → 390 × 844.

| # | Device | Action | Expected | ✅/❌ | Notes |
|---|---|---|---|---|---|
| 16.1 | M | Every page | No horizontal page scroll; 16 px side gutters; bottom tab bar (Today, Lanes, Tasks, Habits, [Dev], Settings) | | |
| 16.2 | M | ♥ Check-in FAB | Sits above the tab bar; doesn't cover content you need | | |
| 16.3 | M | Lanes → Day | The timeline scrolls horizontally *inside* its box; lane names stay pinned left | | |
| 16.4 | M | Open a task | The modal is a bottom sheet; scrolls; ✕ and Escape/backdrop close it | | |
| 16.5 | M | Check-in | Mood buttons fit 3 across; energy 5 across; buttons are thumb-sized | | |
| 16.6 | M | Dev dashboard tabs + tables | Tabs scroll sideways; tables scroll inside their cards | | |
| 16.7 | M | Light and dark mode (iOS setting, or Settings → Theme) | Both readable; charts legible | | |
| 16.8 | M | iPhone notch / home indicator | Tab bar respects the safe area | | |

## 17. Multi-user isolation (optional, quick)

| # | Device | Action | Expected | ✅/❌ | Notes |
|---|---|---|---|---|---|
| 17.1 | D | Private window → sign up a second account | Empty app: no lanes, tasks or notifications from account 1 | | |
| 17.2 | D | Create a lane in account 2 | It does **not** appear in account 1 on any device | | |

---

**Sign-off:** all sections pass on desktop ☐ and on mobile ☐, and cross-device sync (⇄ items) passes ☐.
