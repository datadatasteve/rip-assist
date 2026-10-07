# rip-assist V1: Build overview

**Built:** 2026-10-06 · single pass · nothing committed, pushed or deployed (scope agreed before the build).

## Pre-build decisions (confirmed with you)

| Question | Decision |
|---|---|
| How Fly reaches Ollama on the tailnet | Tailscale runs **inside the Fly container** (userspace mode, `TS_AUTHKEY`). Only Ollama traffic goes through its proxy. |
| Data path / cross-device sync | **Hybrid.** The browser does CRUD directly on Supabase (RLS) and gets live sync through Supabase Realtime. FastAPI handles AI, momentum, scheduler, calendar, push and jobs. |
| Auth | Email + password (Supabase Auth) |
| Background jobs | **Fly scales to zero**, and Supabase `pg_cron` + `pg_net` wake it: decay hourly, calendar sync every 30 min, check-in dispatch every 15 min. |
| Default model | `qwen2.5:14b`. All 6 local Ollama models are registered, and the default can be changed with ★ in Dev → Model registry. |
| Session scope | Build plus local verification. No cloud resources created, no git commits. |

---

## What was built, feature by feature

**Database** (`supabase/migrations/0001_schema.sql`)
- All 12 spec tables, plus 5 supporting tables (see decisions below).
- RLS owner-only policy on every table. `user_id` defaults to `auth.uid()`.
- `updated_at` triggers and indexes.
- 15 tables in the Realtime publication.
- Vault-backed functions to store, read and delete the Google refresh token. Only `service_role` can execute them.

**Cron** (`0002_cron.sql`)
- 3 `pg_cron` jobs. They call `/api/jobs/*` with an `X-Cron-Secret` header.
- The backend URL and secret are read from Vault at run time.

**Backend** (FastAPI, 35 routes)
- **AI provider abstraction** (`services/ai_provider.py`)
  - One `complete()` entry point. Every provider uses the OpenAI-compatible format.
  - Ollama is tried at the Tailscale IP, then localhost, with a 30-second reachability cache.
  - Fallback follows priority order. Per-feature priority overrides are supported.
  - A/B testing: configs that share a priority are picked at random.
  - Every attempt is logged to `ai_interactions`, including failures, with latency, tokens, cost and agent version.
  - Claude and OpenAI costs come from env-configurable per-MTok rates. All other providers cost $0.
- **Momentum engine** (`services/momentum.py`)
  - All spec deltas are implemented.
  - Chunk completion gives the parent task +20 and that task's goal +10.
  - View +2 has a 1-hour cooldown.
  - Hourly decay: −5 per overdue day (once per day), a one-time −20 when the due date passes, and a pause while `waiting_on`.
  - After 7 days `waiting_on`, a "still blocked?" push is sent.
  - Items become `dead` at 0, or after 3 days below 10.
  - The trend compares against 72 hours ago, falling back to 24 hours. A push alert fires when an item turns red.
- **Suggestion engine** (`services/scheduler.py`)
  - Ranks by suggestion score, plus fit to the next free slot, due dates, a lane-balance bonus and flag, and follow-ups on waiting-on items.
  - Feasibility = remaining chunk minutes vs free calendar time. A plan over by more than 30 minutes is "infeasible".
  - The re-plan offer is made once per day and never repeated.
- **AI features**
  - Next-action suggestion, re-plan (with "apply to my chunks"), chunk decomposition (accept to create chunks), check-in reply, momentum review.
  - Calendar *details* are only sent when you tick the box on that request.
- **Agent configs**: default prompts at v1.0.0, semver bumps, rollback, reset to default.
- **Benchmarks**: the 10 starter scenarios as static JSON. The runner stores responses, and rubric P/F scoring happens in the UI.
- **Google Calendar (read-only)**
  - OAuth with a signed state, and the refresh token kept in Vault.
  - Syncs today through +7 days and stores only id, title, start, end and calendar id. Deleted events are pruned.
  - Calendar-to-lane mapping. The write method is stubbed and returns 501.
- **Notifications**
  - `notify()` writes an in-app notification row (synced live) and sends Web Push via `pywebpush`.
  - Dead subscriptions are auto-pruned. The Telegram channel is stubbed.
- **Habits**: streak recompute (daily, weekly, specific days) runs in the hourly job, so missed days reset streaks.
- **Check-ins**
  - Submission snapshots behavioral signals: missed, completed and skipped chunks since the last check-in, AI interaction gap, unanswered reminders, feasibility.
  - Scheduled and random reminders are dispatched with dedup. Random times are spread one per equal segment of your window.

**Frontend** (React/Vite PWA, HashRouter)
- **Auth**: sign up, sign in, password reset, sign out.
- **Realtime data layer** (`hooks/useTable.js`): live merge, plus a resync on reconnect, on tab-visible after more than 15 s, and on `online`. This is what keeps phone and desktop consistent.
- **Dashboard**: lane cards (aggregate momentum dot, last activity, active chunk count), next best action with Ask AI, upcoming 3 chunks, habit ring, live AI cost today, quick check-in, re-plan card.
- **Lane view**
  - Day / week / month zoom.
  - Day view: Google events are bordered fixed blocks, chunks are filled blocks, overlapping chunks collapse into a badge that expands on tap, unscheduled tasks show as pills on the lane header, and a now-line is drawn.
  - Week view shows colored blocks. Month view shows dots per lane per day.
  - Unmapped calendar events get a "Calendar" row, and lane-less items a "No lane" row.
- **Tasks / goals**
  - Create and edit with lane, goal, priority, due date and decay threshold.
  - Detail modal: momentum bar, log progress, in progress, waiting on, unblock, complete, archive, revive, delete.
  - Chunks: add, edit, schedule, complete, skip, AI break-down.
  - Filters for status and lane. Sorting by score, momentum, due date or newest. A dead-items banner.
- **Habits**: daily, weekly or specific-days habits, a tappable 7-day grid, streak and best streak, today's ring.
- **Check-in**: 4-step flow (mood → energy → reflection chips + text → notes). Trigger from `?trigger=`. Shows the AI reply with rating, the re-plan card, and the push-permission prompt on first check-in.
- **Check-in reminders**: in-app banner when a scheduled or random slot has passed. ♥ FAB on every page.
- **Voice**: 🎙 push-to-talk on text fields (Web Speech API). It appends to the field and never auto-submits.
- **Rating control**: 0, 1, low/mid/high 2–4, 5, in at most two taps, plus "did you act on it?".
- **Notification bell**: in-app feed, unread count, deep links.
- **Settings**: timezone, workday, theme, check-in schedule and random count/window, push per device (device list, test sends of each type), Google Calendar connect/sync/map, install app, dev mode, backend health.
- **Dev dashboard** (`/dev`, lazy-loaded): model registry (toggle, priority, per-feature overrides, endpoint/env edit, test, ★ default, import Ollama models), searchable interaction log with inline rating, benchmark runner + history, trends (rating by provider over time, model×feature matrix, version deltas, rubric history, follow-through), agent editor, cost tracker, momentum inspector (+ manual decay pass, AI review).
- **PWA**: manifest, 192/512/maskable/apple icons, `sw.js` (offline shell, cache-first assets, push, notification click → deep link), install banner (Android/desktop prompt, iOS instructions).

**Ops**
- `Dockerfile` + `start.sh` (tailscaled + uvicorn), `fly.toml` (scale to zero), `.github/workflows/deploy-frontend.yml` (Pages).
- `scripts/gen_vapid.py`, and a local Supabase config.
- Docs: `readme.md`, `startup.md`, this file, `initial-build-test.md`.

---

## Verified locally

Tested against a full local Supabase stack (Docker), the real backend and your real Ollama.

- **Migrations**: both apply cleanly on a fresh Postgres.
- **Auth and RLS (API tests with 2 users)**:
  - User B can't read, update or insert as user A.
  - The backend rejects missing tokens and cross-user IDs.
  - The Vault functions are blocked for users (403).
- **Momentum**: +20/+10 propagation, decay −5, due −20, idempotent within a day, waiting-on prompt, dead detection, cooldown, unblock.
- **Scheduling and check-ins**: infeasible offered once; check-in signals; random-time distribution; reminder dispatch without duplicates; cron secret enforced.
- **Data**: habit streak recompute, unique habit log per day, rating constraints, agent semver bumps.
- **AI**: Ollama connectivity test and a check-in reply via **qwen2.5:14b**; a benchmark run stored.
- **Browser UI**: sign-up, lane creation, live cross-session sync (data written by a second session appeared without a reload), overlap badge expand/collapse, live momentum change after "Log progress", the full check-in flow with an AI reply, every dev tab, settings, and the 390px mobile layout.
- **Builds**: the frontend production build passes; the backend Docker image builds and boots; pyflakes is clean.

## Not verified (needs real accounts, devices or deployment)

- Fly deploy and the in-container Tailscale join.
- Google OAuth and real calendar sync.
- Real Web Push delivery and PWA install. Service workers are disabled in the embedded test browser, so `sw.js` was syntax-checked only.
- pg_cron → Fly HTTP calls; locally they fire but have no Vault URL.
- Any cloud AI provider (no keys present).
- Voice on real devices.

---

## Decisions made where the spec was ambiguous

1. **Suggestion score scaling.** `priority × 0.6 + momentum × 0.4` would let momentum (0–100) swamp priority (1–10), so priority is scaled ×10 first. `priority_app` is seeded equal to `priority_user` at creation. Nothing adjusts it yet.
2. **Momentum "color"** is the trend (rising = green, flat = yellow, falling = red), per "same green/yellow/red system as task momentum trend". The detail bar shows the 0–100 score. "Gone red" means the trend turned falling, which triggers one alert until it recovers.
3. **Provider order.** The spec's "Ollama first, then cloud" is the seeded default (Ollama priority 1). Because the registry allows reordering, the effective order follows the configured priority, and an unreachable Ollama is skipped fast.
4. **"Log every attempt"** includes failed fallbacks. `ai_interactions` gained `success`, `error` and `model_config_id`.
5. **Tables added beyond spec:**
   - `user_settings`: timezone, workday, check-in schedule and state, dev mode.
   - `momentum_history`: needed to compute the 24h/72h trend.
   - `notifications`: in-app feed and push log.
   - `gcal_events` and `calendar_connections`: Google sync and lane mapping.
   - `agent_configs`: versioned prompts.
6. **Columns added beyond spec:**
   - goals/tasks: `decay_applied_on`, `due_penalty_applied`, `low_since`, `waiting_prompted_at`, `red_alerted_at`
   - tasks: `waiting_since`, `dead_at`
   - chunks: `lane_id` (lane override)
   - lanes: `sort_order`
   - habits: `archived_at`
   - benchmark_runs: `latency_ms`, `run_group`
7. **Revive.** A positive interaction revives a `dead` item. There is also an explicit "Revive" button that sets momentum to at least 30.
8. **"In progress"** is a +10 momentum event, not a separate status, because the schema's status list has no in-progress value.
9. **Check-in "mood labeled relative to today's schedule"** became On track / A bit behind / Off the rails.
10. **Calendar data and AI.** Free-time *minutes and slot times* (no titles) go into AI scheduling prompts by default. Event titles are only sent when "include calendar event details" is ticked on that request.
11. **Google redirect** goes to the **backend** (`/api/calendar/callback`), not the Pages URL. The client secret must stay server-side, so `GOOGLE_REDIRECT_URI` in `.env.example` was changed.
12. **Push prompt.** You're asked on first check-in setup (saving a check-in schedule) and again after your first check-in, once, tracked by `push_prompted`.
13. **Weekly habits** count one completion per Sunday-to-Saturday week. Custom habits use `custom_days` with 0 = Sunday.
14. **Dockerfile** is the spec's, plus the Tailscale binaries and `start.sh` as the entry point instead of plain uvicorn.
15. **Pydantic models** live inline in each router. `backend/models/` exists but is empty.
16. **A Tasks page** was added because the spec's page list had no home for goal/task/chunk management.
17. **Benchmarks** run one scenario×model pair per request (UI loops with progress), so no long-held HTTP request hits Fly's proxy.

## Issues encountered

- **`.gitignore` contained `lib/`**, which would have silently excluded `frontend/src/lib/`. It's now anchored as `/lib/`. `.venv/` was also added.
- **Ollama isn't reachable at the Tailscale IP.** It answers on localhost only (default bind). You need to set `OLLAMA_HOST=0.0.0.0:11434` (readme → Tailscale). Locally the app fell back to localhost automatically.
- **Port 54321 is held by macOS `rapportd`.** The local Supabase API was moved to 54421 in `supabase/config.toml`.
- **First-event trend bug.** A brand-new item's first momentum event showed "flat" because there was no baseline. Fixed by writing a baseline history point.
- **Push setup could hang** where a service worker can't register (`serviceWorker.ready` never resolves). Fixed to fail fast with a clear message.
- **Embedded test browser blocks service workers**, so PWA install and push couldn't be exercised there. They are covered in the manual checklist.
- **Docker Desktop was started** for the local Supabase stack and is still running.

## Known limitations

- **Scale-to-zero cold starts.** The first backend call after idle takes about 2–5 s (AI buttons, check-in submit). CRUD is unaffected because it goes straight to Supabase. Check-in reminders run on a 15-minute grid. Moving the backend to your friend's always-on AI server removes both issues; set `OLLAMA_ENDPOINT` and skip pg_cron in favor of a local scheduler.
- **iOS.** Push needs the installed PWA on iOS 16.4+. The Web Speech API in iOS standalone mode can be unreliable; use it in Safari, or iOS keyboard dictation as a fallback.
- **Google consent screen in "Testing" mode** expires refresh tokens after 7 days. Publish the consent screen to avoid this.
- **`launchctl setenv OLLAMA_HOST` doesn't persist across reboots.**
- **Calendar sync is per-user, sequential.** Fine for one user. Batch it before adding many users.
- **Dates use the user's stored timezone** (auto-detected on first load). Changing timezone mid-day can shift that day's decay and streak boundary once.
- **Cron isn't tied to a user's local hour**, so random check-ins can land up to 15 minutes after their chosen time.
- **No automated test suite was committed.** The verification scripts were ad-hoc. A pytest suite against local Supabase is a good next step.
- **Bundle size.** The main bundle is 565 kB (162 kB gzipped). The dev dashboard and recharts are split out.

## Recommended next steps

1. Follow `startup.md`: Supabase project → Fly launch/secrets/deploy → Vault secrets + `0002_cron.sql` → GitHub Pages variables → push.
2. Make Ollama listen on the tailnet (`OLLAMA_HOST`) and persist it, e.g. with a LaunchAgent.
3. Run `initial-build-test.md` on desktop and phone.
4. Add at least one cloud key (Groq is free and fast) so AI works when the Mac sleeps.
5. Turn the ad-hoc API checks into a pytest suite and a CI job against `supabase start`.
6. Have the engine set `priority_app` (e.g. from deadline proximity or AI priority suggestion). It's currently seeded only.
7. V2: Calendar write (stub in place), Telegram channel (stub in place), inferred mood from the `behavioral_signals` already being collected, and moving to the always-on AI server.
