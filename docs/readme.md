# rip-assist

A personal AI scheduler and planning hub. It surfaces the next best action, tracks momentum and habits, runs check-ins, and re-plans when the day stops fitting.

- **Live app:** https://datadatasteve.github.io/rip-assist/ (after first deploy)
- **First-time setup:** [startup.md](startup.md)
- **What was built:** [build-overview.md](build-overview.md)
- **Test checklist:** [initial-build-test.md](initial-build-test.md)

---

## Tech stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 19 + Vite, PWA | `frontend/`. HashRouter (GitHub Pages has no SPA rewrites). Hand-written `public/sw.js`. |
| Backend | Python 3.12 + FastAPI | `backend/`. AI, momentum engine, scheduler, calendar, push, cron jobs. |
| DB / Auth / Realtime | Supabase | Postgres + RLS on every table. Realtime keeps devices in sync. Vault stores the Google refresh token. |
| Backend hosting | Fly.io | Scales to zero. Joins your tailnet via Tailscale userspace networking to reach Ollama. |
| Frontend hosting | GitHub Pages | Deployed by `.github/workflows/deploy-frontend.yml`. |
| Scheduled jobs | Supabase `pg_cron` + `pg_net` | Hourly momentum decay, 30-min calendar sync, 15-min check-in dispatch. These wake the Fly machine. |
| Local AI | Ollama on the Mac (`100.87.209.56:11434`) | Default model `qwen2.5:14b`. All local models are registered; change the default in Dev → Model registry. |
| Cloud AI fallback | Groq → Gemini → OpenRouter → Cloudflare → Claude → OpenAI | All use the OpenAI-compatible chat format. |
| Voice | Web Speech API | Runs in the browser. Mic button on text inputs. |
| Push | Web Push (VAPID, `pywebpush`) | Plus an in-app notification feed. |

### How data flows

```
Browser (any device) ──supabase-js──▶ Supabase (CRUD, RLS)  ◀──Realtime── every other device
        │
        └──fetch + JWT──▶ FastAPI on Fly ──service key──▶ Supabase
                              ├──▶ Ollama (tailnet) / cloud providers
                              ├──▶ Google Calendar API
                              └──▶ Web Push
Supabase pg_cron ──HTTP + X-Cron-Secret──▶ FastAPI /api/jobs/*
```

Plain CRUD goes straight from the browser to Supabase, so it's instant and syncs live. Anything that needs secrets or server logic goes through FastAPI.

---

## Run the backend locally

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp ../.env.example .env        # then fill in values (see table below)
.venv/bin/uvicorn main:app --reload --port 8000
```

- Health: http://localhost:8000/health
- API docs: http://localhost:8000/docs
- Running jobs by hand: `curl -X POST -H "X-Cron-Secret: $CRON_SECRET" localhost:8000/api/jobs/momentum-decay` (also `calendar-sync`, `checkin-dispatch`)

### Optional: full local Supabase

Needs Docker. Migrations apply automatically.

```bash
npx supabase start            # from repo root
npx supabase status -o env    # prints API_URL, ANON_KEY, SERVICE_ROLE_KEY
```

Use `http://127.0.0.1:54421` as `SUPABASE_URL`. The API port was moved from the default 54321 because macOS `rapportd` (AirDrop/Continuity) holds that port. Mailpit, which catches confirmation emails, runs at http://127.0.0.1:54324. To reset the database: `npx supabase db reset`. To stop it: `npx supabase stop`.

## Run the frontend locally

```bash
cd frontend
npm install
cp .env.example .env           # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL
npm run dev                    # → http://localhost:5173/rip-assist/
```

`npm run build` writes `frontend/dist`. `npm run preview` serves the production build at http://localhost:4173/rip-assist/.

---

## Environment variable reference

### Backend (`backend/.env` locally, `fly secrets set` on Fly)

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | yes | Project URL |
| `SUPABASE_ANON_KEY` | yes | Used to validate user JWTs via Supabase Auth |
| `SUPABASE_SERVICE_KEY` | yes | Server-side DB access. **Never** put this in the frontend. |
| `OLLAMA_ENDPOINT` | – | Primary Ollama URL (default `http://localhost:11434`; set to the Tailscale IP) |
| `OLLAMA_FALLBACK_ENDPOINT` | – | Tried second (default `http://localhost:11434`) |
| `OLLAMA_DEFAULT_MODEL` | – | Model enabled first when a user's registry is seeded (`qwen2.5:14b`) |
| `TS_AUTHKEY` | Fly only | Tailscale auth key. When set, the container joins your tailnet. |
| `TS_HOSTNAME` | – | Tailnet node name (default `rip-assist-api`) |
| `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `CLOUDFLARE_AI_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | – | Cloud providers. Each is used only when it's set and enabled in the registry. |
| `CLAUDE_INPUT_PER_MTOK` … `OPENAI_OUTPUT_PER_MTOK` | – | Paid-provider pricing (USD per 1M tokens) for cost tracking |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for calendar | OAuth client |
| `GOOGLE_REDIRECT_URI` | for calendar | **Backend** callback: `https://<fly-app>.fly.dev/api/calendar/callback` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` | for push | Generate with `backend/scripts/gen_vapid.py` |
| `SECRET_KEY` | yes (prod) | Signs the OAuth `state` parameter |
| `CRON_SECRET` | yes (prod) | Shared secret that pg_cron sends to `/api/jobs/*` |
| `FRONTEND_URL` | yes (prod) | Where OAuth redirects back to (`https://datadatasteve.github.io/rip-assist/`) |
| `CORS_ORIGINS` | – | Comma-separated allowed origins |
| `ENVIRONMENT` | – | `development` / `production` |

### Frontend (`frontend/.env` locally, GitHub Actions **Variables** in CI)

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Public anon key. It's safe in the browser because RLS protects the data. |
| `VITE_API_URL` | Backend base URL (`http://localhost:8000` or `https://<fly-app>.fly.dev`) |

---

## Starting Tailscale on the Mac

Ollama runs on this Mac. Your phone and the Fly backend reach it over Tailscale.

```bash
open -a Tailscale              # menu-bar app; or: sudo tailscale up
tailscale status               # this Mac should show 100.87.209.56
tailscale ip -4
```

Ollama listens on localhost only by default. Make it listen on all interfaces so tailnet peers can reach it:

```bash
launchctl setenv OLLAMA_HOST 0.0.0.0:11434
# then quit Ollama from the menu bar and reopen it
curl http://100.87.209.56:11434/api/tags      # should list your models
```

If you run Ollama with `ollama serve`, use `OLLAMA_HOST=0.0.0.0:11434 ollama serve` instead. Port 11434 is not exposed to the internet. Only tailnet devices can reach it.

---

## Troubleshooting

### Ollama not reachable
- Dev → Model registry shows **Ollama unreachable**. AI calls then fall back to cloud providers, and the interaction log records a failed `ollama` attempt.
- On the Mac, run `curl localhost:11434/api/tags`. If that fails, Ollama isn't running.
- If `curl http://100.87.209.56:11434/api/tags` fails while localhost works, Ollama is bound to localhost. Set `OLLAMA_HOST=0.0.0.0:11434` (see above).
- From Fly: `fly logs` should show `tailscale up` succeeding, and `/health` should report `"tailnet_proxy": true`. If not, check `TS_AUTHKEY` (it can expire) and that your tailnet ACLs let the `rip-assist-api` node reach the Mac on port 11434.
- The Mac being asleep counts as unreachable. Ollama reachability is cached for 30 seconds.
- The first call to a 14B model can take 10–30 seconds while the model loads. Ollama requests time out after 180 seconds.

### Supabase auth errors
- **"Invalid login credentials"**: wrong password, or the email isn't confirmed yet. Check your inbox, or turn off "Confirm email" under Supabase → Authentication → Providers → Email.
- **Confirmation or reset link lands on localhost**: set Supabase → Authentication → URL Configuration → Site URL to `https://datadatasteve.github.io/rip-assist/` and add it to Redirect URLs.
- **Backend returns 401 "Invalid or expired session"**: the backend's `SUPABASE_URL` / `SUPABASE_ANON_KEY` must belong to the same project as the frontend.
- **The app loads but lists are empty after sign-in**: migrations haven't been run, or RLS blocks you. Run `0001_schema.sql` again on a fresh project.
- **Realtime doesn't sync between devices**: confirm the tables are in the `supabase_realtime` publication (Database → Publications). The migration adds them.

### Push not working
- **iPhone/iPad**: push only works after **Add to Home Screen**, on iOS 16.4 or later, opened from the home-screen icon.
- Settings → Notifications says "VAPID keys not configured": set all three `VAPID_*` secrets on Fly.
- Permission is "denied": reset it in the browser's site settings, because the app can't ask again.
- A subscription stops working after you change VAPID keys: Disable push, then Enable it again on each device. Stale subscriptions are pruned automatically when the push service returns 404/410.
- Scheduled reminders never arrive: check that `0002_cron.sql` ran and that the Vault secrets `rip_backend_url` / `rip_cron_secret` are set. `select * from cron.job_run_details order by start_time desc limit 10;` shows each run.
