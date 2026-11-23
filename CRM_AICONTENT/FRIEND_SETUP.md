# AiInstaReels — Friend handoff (run it yourself)

This package is the **full AiInstaReels web app** (`CRM_AICONTENT`).  
It does **not** include anyone else’s private API keys (kie.ai, Cloudflare tokens, Supabase service role, Telegram bot token, Instagram session cookies).

You will create **your own** accounts and paste **your own** keys.

---

## What you get

| Area | Included |
|------|----------|
| Next.js 16 App Router + TypeScript + Tailwind | Yes |
| Auth (email/password + Telegram deep-link) | Yes |
| Dashboard + Jobs | Yes |
| My Models (identity refs) | Yes |
| Image generation dock (Seedream / Nano / etc. via kie.ai) | Yes |
| Video generation dock (Wan 3.0, motion control, etc.) | Yes |
| Prompt from video (recreate scripts) | Yes |
| Instagram Reel import (+ FastDL-assisted fallback) | Yes |
| Outputs gallery (3-day retention) | Yes |
| Cloudflare Workers deploy (OpenNext) | Yes — config + docs |
| **Private API keys** | **No — use your own** |

---

## 0. Prerequisites (install once)

| Tool | Why |
|------|-----|
| **Node.js 20+** (LTS) | Run / build the app — https://nodejs.org |
| **npm** | Comes with Node |
| **Git** (optional) | If you clone instead of unzip |
| **Cloudflare account** | Deploy to Workers + custom domain |
| **Supabase account** | Auth + Postgres + Storage |
| **Telegram BotFather bot** | Signup / login via Telegram |
| **kie.ai account + API key** | All AI generation billing — paste in **Settings** inside the app |

Optional:

| Tool | Why |
|------|-----|
| `INSTAGRAM_SESSIONID` cookie | Makes automatic Reel import more reliable when public scrapers fail |
| Custom domain on Cloudflare | e.g. `yourdomain.com` instead of `*.workers.dev` |

---

## 1. Unpack and install

```bash
# Unzip the handoff zip, then:
cd CRM_AICONTENT
npm install
```

`node_modules` is **not** in the zip (too large). `npm install` pulls everything from `package.json`.

---

## 2. Create your own Supabase project

1. Go to https://supabase.com → **New project**
2. Copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` / publishable key → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (and publishable if shown)
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (**server only — never put in frontend code**)

### 2a. Run SQL migrations (in order)

Supabase Dashboard → **SQL Editor** → run each file from `supabase/migrations/` **in this order**:

1. `20250801_profiles_and_jobs.sql`
2. `20260830_telegram_auth.sql`
3. `20260830_telegram_deep_link_codes.sql` (optional but recommended)
4. `20261024_provider_keys.sql`
5. `20261025_creator_models.sql`
6. `20261106_generation_outputs.sql`

### 2b. Storage buckets

The app auto-creates some buckets at runtime when possible. Safer to create publicly readable buckets once:

| Bucket | Public | Used for |
|--------|--------|----------|
| `creator-models` | Yes | My Model stills / refs |
| `generation-outputs` | Yes | Generated images/videos + Instagram imports |

Dashboard → **Storage** → New bucket → enable **Public**.

### 2c. Auth URL config

Authentication → URL Configuration:

**Local**

- Site URL: `http://localhost:3000`
- Redirect: `http://localhost:3000/**`

**Production** (after you have a domain)

- Site URL: `https://YOURDOMAIN.com`
- Redirects:
  - `https://YOURDOMAIN.com/**`
  - `https://www.YOURDOMAIN.com/**`
  - keep localhost for dev

Enable Email provider. For local testing you can disable “Confirm email” temporarily.

---

## 3. Telegram bot

Follow `docs/TELEGRAM_AUTH_SETUP.md`.

Short version:

1. BotFather → create bot → copy token  
2. Put token + username (without `@`) into `.env.local`  
3. Deep-link auth works on localhost (no `/setdomain` required)

---

## 4. Environment file (local)

```bash
cp .env.example .env.local
```

Fill **your** values (placeholders only in the zip):

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key

SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PROVIDER_SECRETS_KEY=generate-a-long-random-string

TELEGRAM_BOT_TOKEN=123456:ABC...
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=YourBotUsername

# Optional — Instagram auto-import when scrapers fail
# INSTAGRAM_SESSIONID=
# INSTAGRAM_DS_USER_ID=
# INSTAGRAM_CSRFTOKEN=
```

Generate `PROVIDER_SECRETS_KEY` with any long random string (encrypts each user’s kie.ai key in the DB).

**Do not** copy anyone else’s kie.ai key. After the app runs, open **System → Settings** and paste **your** kie.ai API key.

---

## 5. Run locally

```bash
cd CRM_AICONTENT
npm run dev
```

Open http://localhost:3000

Checklist:

1. Sign up (Telegram verify + email/password)  
2. Settings → save **your** kie.ai API key  
3. My Models → add a model + face refs  
4. Image / Video generation  
5. Tools → Instagram import (or FastDL-assisted upload)

---

## 6. Deploy to Cloudflare Workers (OpenNext)

Full detail: `docs/DEPLOY_CLOUDFLARE.md`

### 6a. One-time Cloudflare setup

1. Account at https://dash.cloudflare.com  
2. Add your domain as an **Active** zone (nameservers at Cloudflare) **or** use `*.workers.dev` first  
3. Create an API token with:
   - Account → Workers Scripts → Edit  
   - Account → Account Settings → Read  
   - Zone → Workers Routes → Edit (your zone)  
   - Zone → DNS → Edit (for custom domain)

### 6b. Edit Worker name / domain

Open `wrangler.jsonc`:

- `"name": "aiinstareels"` → change if you want  
- `routes` → replace `ainstareel.com` / `www.ainstareel.com` with **your** domain  
  - Or remove `routes` temporarily and use only `workers_dev` URL  

See also `wrangler.friend.example.jsonc`.

### 6c. Secrets (runtime)

```bash
cd CRM_AICONTENT
export CLOUDFLARE_API_TOKEN=your_cloudflare_token
# optional:
# export CLOUDFLARE_ACCOUNT_ID=your_account_id

npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put PROVIDER_SECRETS_KEY
# optional Instagram session:
# npx wrangler secret put INSTAGRAM_SESSIONID
```

### 6d. Build-time public env (required)

`NEXT_PUBLIC_*` is **inlined at build time**. Export before deploy:

```bash
export NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY=...
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
export NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=YourBotUsername
export CLOUDFLARE_API_TOKEN=...
# export CLOUDFLARE_ACCOUNT_ID=...

npm run deploy
```

That runs: `opennextjs-cloudflare build && opennextjs-cloudflare deploy`.

### 6e. After go-live

1. Update Supabase Auth Site URL / Redirect URLs to your HTTPS domain  
2. Open the site → create user → Settings → kie.ai key  
3. Test one image + one video generation  

### 6f. Notes / gotchas

- Workers use `nodejs_compat` (see `wrangler.jsonc`)  
- Some Node APIs (e.g. local `ffmpeg` for audio extract) may be limited on Workers — if extract-audio fails, upload voice MP3 manually as `@Audio1`  
- Instagram auto-download often fails when Instagram blocks scrapers → use **Continue with FastDL** + upload MP4 on `/tools/instagram-import`  
- Never commit `.env.local` or Cloudflare tokens to git  

---

## 7. kie.ai (generation)

| Item | Where |
|------|--------|
| Account / credits | https://kie.ai |
| API key | App → **System → Settings** (encrypted in `provider_keys`) |
| Models used | Wan 3.0, Seedream, Nano Banana, Kling motion, etc. — see `src/lib/kie/models.ts` |

Without a kie.ai key, auth/dashboard still work; Generate will ask you to add a key.

---

## 8. Feature map (where things live)

```
/login /signup              Auth
/                           Dashboard + jobs
/models                     My Models
/image/generate             Image dock
/video/single               Video dock
/video/prompt-from-clip     Prompt from video
/tools/instagram-import     Reel import + FastDL handoff
/content/outputs            Outputs gallery
/system/settings            kie.ai key + Telegram status
/jobs                       Job history
```

Code roots:

```
src/app/                 routes
src/components/          UI (generation docks, tools, auth)
src/lib/kie/             kie.ai client + model catalog
src/lib/generation/      prompts, recreate, keyframes, uploads
src/lib/instagram/       Reel resolvers
supabase/migrations/     SQL
docs/                    Cloudflare + Telegram deep docs
wrangler.jsonc           Cloudflare Worker config
open-next.config.ts      OpenNext Cloudflare adapter
```

---

## 9. What was intentionally NOT shared

- Anyone’s **kie.ai API key**  
- Cloudflare **API tokens** / account IDs used by the original deploy  
- Live **Supabase service_role** / production secrets  
- Instagram **session cookies**  
- Real `.env.local` files  

Rotate any key that was ever pasted into a chat.

---

## 10. Quick trouble guide

| Symptom | Fix |
|---------|-----|
| Login fails | Check Supabase URL/anon key; Auth redirect URLs |
| “Add kie.ai key” | Settings → paste your key |
| Telegram signup stuck | Bot token + username; re-run telegram SQL |
| Instagram Download fails | Normal when IG blocks scrapers → FastDL → Upload MP4 |
| Deploy fails custom domain | Domain must be Active on Cloudflare; edit `wrangler.jsonc` routes |
| Empty Outputs | Ensure `generation-outputs` bucket exists and is public |

---

## Start order (cheat sheet)

1. `npm install`  
2. New Supabase + run all migrations + buckets  
3. `.env.local` from `.env.example`  
4. Telegram bot env  
5. `npm run dev`  
6. Settings → **your** kie.ai key  
7. (Later) Cloudflare secrets + `npm run deploy`  

You’re set.
