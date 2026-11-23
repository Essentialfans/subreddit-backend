# SETUP ON NEW COMPUTER — READ THIS FIRST

**Self-hosting the full site (your own Supabase / Cloudflare / kie.ai)?**  
→ Start with **`FRIEND_SETUP.md`** (complete guide including Cloudflare Workers).

You do **not** need to manually install Next.js, React, Supabase, etc. one by one.  
Everything the app needs is listed in `package.json`. One command installs it all.

---

## 1. Install on your system (once)

| What | Why | Where |
|------|-----|--------|
| **Node.js 20 or newer** (includes **npm**) | Required to run the app | https://nodejs.org (LTS) |

Optional check in a terminal:

```bash
node -v
npm -v
```

You should see version numbers (e.g. `v20.x` and `10.x`).

---

## 2. Unzip and open the project folder

Unzip the handoff zip.  
Go into the folder named **`CRM_AICONTENT`**.

---

## 3. Install project dependencies (one command)

```bash
cd CRM_AICONTENT
npm install
```

This downloads into `node_modules` (not in the zip on purpose — too large).

It installs everything used by this project, including:

- next, react, react-dom  
- @supabase/supabase-js, @supabase/ssr  
- recharts, lucide-react, next-themes  
- tailwind, typescript, eslint  
- radix UI helpers, `@opennextjs/cloudflare`, wrangler, etc.

**You do not need to install these separately.**

---

## 4. Env file (create your own — no secrets in the zip)

```bash
cp .env.example .env.local
```

Fill **your** values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PROVIDER_SECRETS_KEY`
- `TELEGRAM_BOT_TOKEN`
- `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`

Then run **all** SQL files in `supabase/migrations/` (see `FRIEND_SETUP.md` for order).

**kie.ai API key:** do not put it in `.env.local`. Paste it in the app under **System → Settings** after login.

---

## 5. Run the app

```bash
npm run dev
```

Open: http://localhost:3000

---

## Then read

1. **`FRIEND_SETUP.md`** — full self-host + Cloudflare deploy  
2. `docs/DEPLOY_CLOUDFLARE.md` — Workers / OpenNext details  
3. `docs/TELEGRAM_AUTH_SETUP.md` — BotFather  
4. `HANDOFF.md` — early project history (partially outdated; product has grown a lot since)

Also do:

1. Copy `.env.example` → fill server + Telegram env  
2. Run SQL migrations under `supabase/migrations/`  
3. Create public storage buckets `creator-models` and `generation-outputs`  
4. Follow `docs/TELEGRAM_AUTH_SETUP.md`
