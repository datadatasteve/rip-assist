# rip-assist: First-time setup

Do these steps in order. Allow about 45 minutes. Every secret goes into Fly secrets or local `.env` files, never the repo.

Values you'll collect along the way (keep them in a password manager):

| Value | From step |
|---|---|
| Supabase URL, anon key, service_role key | 1 |
| Fly app URL (`https://<app>.fly.dev`) | 3 |
| `SECRET_KEY`, `CRON_SECRET` | 4 |
| Tailscale auth key | 5 |
| Google client ID / secret | 6 |
| VAPID public / private key | 7 |

---

## 1. Create the Supabase project

1. Go to https://supabase.com/dashboard → **New project**. Pick a region near you (e.g. `us-east-1`, close to Fly `iad`).
2. In **Project Settings → API**, copy:
   - Project URL → `SUPABASE_URL` / `VITE_SUPABASE_URL`
   - `anon` public key → `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_KEY` (backend only)
3. In **Authentication → URL Configuration**:
   - Site URL: `https://datadatasteve.github.io/rip-assist/`
   - Redirect URLs: add `https://datadatasteve.github.io/rip-assist/` and `http://localhost:5173/rip-assist/`
4. Optional: under **Authentication → Providers → Email**, turn off "Confirm email" so sign-up works instantly while you're the only user.

## 2. Run the migrations

In the Supabase dashboard **SQL Editor**:

1. Paste and run `supabase/migrations/0001_schema.sql`. This creates the tables, RLS, the Realtime publication and the Vault helpers.
2. Leave `0002_cron.sql` for step 8, because it needs the Fly URL.

Check: **Table Editor** should list `lanes`, `goals`, `tasks`, `chunks`, `habits`, etc., each with an RLS badge. **Database → Publications → supabase_realtime** should include them.

> CLI alternative: `npx supabase link --project-ref <ref>` then `npx supabase db push`. This runs both migrations, so do step 8's Vault secrets first.

## 3. Install flyctl and launch the backend

flyctl is already installed on this Mac (`/opt/homebrew/bin/fly`). On another machine run `brew install flyctl`, then `fly auth login`.

```bash
cd backend
fly launch --no-deploy --copy-config --name rip-assist-api --region iad
```

- If `rip-assist-api` is taken, choose another name. Then update `app` in `fly.toml` and use the new URL everywhere below.
- Say **no** to Postgres/Redis (Supabase is the database).
- Your backend URL is `https://rip-assist-api.fly.dev`.

`fly.toml` is already set up for scale-to-zero (`auto_stop_machines = "stop"`, `min_machines_running = 0`), a shared-cpu-1x 512 MB VM, and the non-secret env vars (`FRONTEND_URL`, `OLLAMA_ENDPOINT`, `OLLAMA_DEFAULT_MODEL`).

## 4. Generate app secrets

```bash
python3 -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(48))"
python3 -c "import secrets; print('CRON_SECRET=' + secrets.token_urlsafe(32))"
```

## 5. Configure Tailscale (Mac + Fly)

**On the Mac (Ollama host):**

1. Make sure Tailscale is running and logged in: `tailscale status` should show `100.87.209.56`.
2. Make Ollama listen on the tailnet:
   ```bash
   launchctl setenv OLLAMA_HOST 0.0.0.0:11434
   ```
   Then quit and reopen Ollama. `launchctl setenv` does not survive a reboot, so re-run it after restarting, or add it to a login item.
3. Check: `curl http://100.87.209.56:11434/api/tags` lists your models.
4. Pull any missing models so all registry entries work: `ollama pull qwen2.5:14b` (already present).

**Auth key for Fly:**

1. Open https://login.tailscale.com/admin/settings/keys → **Generate auth key**.
2. Set it to **Reusable** and **Ephemeral** (each Fly cold start registers a short-lived node that is removed automatically). A tag such as `tag:rip-assist` is optional.
3. If you use ACLs, allow that node or tag to reach `100.87.209.56:11434`.

## 6. Google OAuth credentials (Calendar, read-only)

1. Open https://console.cloud.google.com/ → create or select a project.
2. Go to **APIs & Services → Library**, find **Google Calendar API**, and click **Enable**.
3. Go to **OAuth consent screen**: choose External, app name `rip-assist`, add your email as a **test user**, and add the scope `.../auth/calendar.readonly`.
4. Go to **Credentials → Create credentials → OAuth client ID**, type **Web application**.
   - Authorized redirect URIs:
     - `https://rip-assist-api.fly.dev/api/calendar/callback`
     - `http://localhost:8000/api/calendar/callback` (local dev)
5. Copy the Client ID and secret.

> While the consent screen is in "Testing" mode, Google refresh tokens expire after 7 days, and you'll need to reconnect. Publish the app (no verification is needed for personal use with your own account) to avoid this.

## 7. Generate VAPID keys (Web Push)

```bash
cd backend
.venv/bin/python scripts/gen_vapid.py        # after creating the venv (see readme.md)
```

`VAPID_EMAIL` is a contact address the push services can see.

## 8. Set Fly secrets and deploy

```bash
cd backend
fly secrets set \
  SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_KEY=... \
  SECRET_KEY=... CRON_SECRET=... \
  TS_AUTHKEY=tskey-auth-... \
  GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... \
  GOOGLE_REDIRECT_URI=https://rip-assist-api.fly.dev/api/calendar/callback \
  VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_EMAIL=you@example.com \
  GROQ_API_KEY=...          # plus any other cloud provider keys you have

fly deploy
curl https://rip-assist-api.fly.dev/health
# → {"ok":true,"supabase_configured":true,"tailnet_proxy":true,...}
```

`fly logs` shows tailscaled joining. If `tailnet_proxy` is false, `TS_AUTHKEY` is missing or invalid.

**Now schedule the cron jobs.** In the Supabase SQL Editor:

```sql
select vault.create_secret('https://rip-assist-api.fly.dev', 'rip_backend_url');
select vault.create_secret('<your CRON_SECRET>', 'rip_cron_secret');
```

Then paste and run `supabase/migrations/0002_cron.sql`. Check: `select jobname, schedule from cron.job;` lists 3 jobs. After about 15 minutes, `select status, return_message from cron.job_run_details order by start_time desc limit 5;` shows `succeeded`, and `select status_code from net._http_response order by created desc limit 5;` shows `200`.

## 9. Frontend: GitHub Pages

1. Push the repo to GitHub (`datadatasteve/rip-assist`).
2. In **Settings → Pages → Build and deployment**, set Source to **GitHub Actions**.
3. In **Settings → Secrets and variables → Actions → Variables** tab (not Secrets, because these values are public), add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_URL` = `https://rip-assist-api.fly.dev`
4. Push to `main` or run the **Deploy frontend to GitHub Pages** workflow manually.
5. Open https://datadatasteve.github.io/rip-assist/

## 10. Local development env files

```bash
cp .env.example backend/.env          # fill in; ENVIRONMENT=development, FRONTEND_URL=http://localhost:5173/rip-assist/
cp frontend/.env.example frontend/.env
```

For local Google OAuth, set `GOOGLE_REDIRECT_URI=http://localhost:8000/api/calendar/callback` in `backend/.env`.

---

## First-run checklist

- [ ] `https://rip-assist-api.fly.dev/health` → `ok: true`, `supabase_configured: true`, `tailnet_proxy: true`
- [ ] Sign up at https://datadatasteve.github.io/rip-assist/ and sign in
- [ ] Settings → **Check backend** shows health JSON, with Ollama endpoint `http://100.87.209.56:11434`
- [ ] Settings → Developer → enable **Show Dev dashboard**
- [ ] Dev → Model registry: `qwen2.5:14b` is ★ default and **Test** returns `pong`; test one cloud provider
- [ ] Create lanes (e.g. Work, Health, Home, plus one project lane)
- [ ] Settings → Google Calendar → **Connect**, then map each calendar to a lane
- [ ] Settings → Check-ins: add scheduled times; allow notifications when asked
- [ ] Settings → Notifications → **Send** test, and a push arrives
- [ ] Install the PWA on your phone (iPhone: Safari → Share → Add to Home Screen), sign in, enable push there too
- [ ] After 1 hour: `select * from cron.job_run_details order by start_time desc limit 5;` shows successes
- [ ] Work through [initial-build-test.md](initial-build-test.md)
