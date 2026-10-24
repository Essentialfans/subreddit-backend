# AiInstaReels ? Project Handoff

**Transfer date:** 2026-08-29  
**Brand:** AiInstaReels (was temporarily AIInstaReels; user renamed to AiInstaReels)  
**Workspace folder:** `CRM_AICONTENT`  
**Goal:** AI content generation + viral Instagram Reels tracking dashboard

This package continues work from a Cursor chat that built the UI, wired Supabase auth, and connected a real Jobs system.

**Start here:** open **`SETUP_ON_NEW_COMPUTER.md`** first (install steps).  
Then read this file, then `CHAT_CONTEXT.md`.

---

## Quick start on the new computer

**Only extra install on the PC:** [Node.js LTS](https://nodejs.org) (includes npm).

Then:

```bash
# 1. Unzip ? open CRM_AICONTENT
cd CRM_AICONTENT

# 2. Install ALL app packages listed in package.json (node_modules was left out of the zip)
npm install

# 3. Env: .env.local is already included (Supabase URL + keys)

# 4. Run
npm run dev
```

Open http://localhost:3000 ? login/signup ? dashboard.

Details: **`SETUP_ON_NEW_COMPUTER.md`**.

---

## What was built (status)

### Done

| Area | Status |
|------|--------|
| Next.js 16 App Router + TypeScript + Tailwind v4 | Done |
| Dark SaaS UI matching reference (sidebar, stats, chart, table, recent jobs) | Done |
| Brand: **AiInstaReels** | Done |
| Login / Signup UI | Done |
| Check-email page after signup (`/signup/check-email`) with Gmail link | Done |
| Supabase Auth (email/password) replacing mock localStorage auth | Done |
| Middleware/proxy session protection (`src/proxy.ts`) | Done |
| DB: `profiles` + `jobs` tables with RLS | Done (on remote Supabase) |
| Jobs = log of every generation run (video/image/tools) with status + cost | Done |
| Dashboard wired to real jobs (not mock for stats/recent jobs) | Done |
| `/jobs` page: search, status filter, cost, New Job | Done |
| Stub job simulator (creates job ? running ? completed/failed + cost) | Done |
| Configurable default pricing in `src/lib/jobs/job-types.ts` | Done (user will customize later) |
| Email HTML template draft for Confirm signup button | Draft only (needs custom SMTP in Supabase to edit templates) |

### Auth (email + Telegram) — added 2026-08-30

| Area | Status |
|------|--------|
| Forgot password (`/forgot-password`) + reset (`/reset-password`) | Done in code |
| Telegram Login Widget link + login API | Done in code |
| Settings page to link Telegram + show @username | Done |
| Jobs gated until Telegram verified | Done |
| SQL migration for telegram_* profile columns | File ready — **run in Supabase SQL Editor** |
| BotFather bot + env tokens | **You must configure** — see `docs/TELEGRAM_AUTH_SETUP.md` |

### Not done / deferred

| Area | Notes |
|------|--------|
| Custom SMTP + professional confirm-email button in Supabase | User said do that later |
| Real AI generation APIs | Stub only |
| Instagram / Reels API | Not started |
| Trend Finder product feature | Planned next after jobs |
| Single Video Generation real UI/API | Placeholder routes only |
| Deploy to Vercel / public multi-user URL | Local only so far |
| Mobile sidebar polish | Deferred |

---

## Supabase project (already connected)

| Field | Value |
|-------|--------|
| Project ref | `xrcgrkbducqqxrvozamp` |
| URL | `https://xrcgrkbducqqxrvozamp.supabase.co` |
| Region | `eu-west-1` (Ireland) |
| Org | EssentialFans |
| Cursor OAuth | Authorized on org (for MCP) ? do **not** confuse with app signup confirmation emails |

### Dashboard settings already done (verify if needed)

- Email provider enabled  
- Site URL: `http://localhost:3000`  
- Redirect URLs: `http://localhost:3000/**`  
- Free-tier email has rate limits (~few confirm emails/hour). For local testing, **Confirm email** can be turned OFF under Auth ? Providers ? Email.

### Schema (remote)

**profiles**
- `id` (uuid ? auth.users)
- `full_name`, `email`, timestamps
- RLS: user owns own row  
- Trigger `handle_new_user` creates profile on signup

**jobs**
- `id` (bigint identity)
- `user_id`, `type`, `type_label`, `status` (running | awaiting_review | completed | failed)
- `progress` 0?100, `cost` numeric, `created_at`
- RLS: user owns own jobs

---

## Product decisions (user intent)

1. **Jobs = every generation run** (video, image, batch, tools) ? not a separate task manager. Track running + history + cost per job.  
2. User will **customize pricing** later (`job-types.ts` `defaultCost`).  
3. Multi-user site is the goal (Supabase Auth + RLS). Deploy later.  
4. Brand spelling: **AiInstaReels**.  
5. After signup needing confirmation ? dedicated check-email page with blue Gmail link (not inline green text).  
6. Reference UI was ?Pipeline Content Studio? style dark purple dashboard ? adapted for AiInstaReels.

---

## Where we stopped

**Last completed work:** Email/password + forgot password + Telegram Login Widget linking/login (anti-scam @username). Jobs require Telegram verification.

**You still need to:**

1. Run `supabase/migrations/20260830_telegram_auth.sql` in Supabase  
2. Create bot via BotFather and set `.env.local` tokens (see `docs/TELEGRAM_AUTH_SETUP.md`)  
3. Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` (server-only)

**Suggested next product steps:**

1. Customize costs in `src/lib/jobs/job-types.ts`  
2. Build real **Single Video Generation** or **Trend Finder**  
3. Later: custom SMTP; deploy to Vercel; production Telegram domain

---

## Important file map

```
src/app/(auth)/          login, signup, check-email
src/app/(dashboard)/     dashboard, jobs, catch-all stubs
src/app/auth/confirm/    email confirmation route
src/proxy.ts             session refresh + route guard
src/lib/supabase/        client, server, middleware helpers
src/lib/auth/            AuthProvider (Supabase)
src/lib/jobs/            job-types (PRICING), queries, aggregations, mappers
src/lib/hooks/use-jobs.tsx  JobsProvider + dashboard hooks
src/components/          UI, layout, dashboard, jobs
supabase/email-templates/confirm-signup.html  paste into Supabase after SMTP
.env.local               keys for this project
CHAT_CONTEXT.md          chat narrative for the next agent/human
CHAT_TRANSCRIPT.jsonl    raw Cursor transcript (this conversation)
```

---

## Security note

`.env.local` contains publishable/anon keys (safe for client apps with RLS). Do **not** put `service_role` / secret keys in the frontend. If this zip is shared beyond your machines, rotate keys in Supabase.

---

## Extra docs in this transfer (added after audit)

- `docs/chat/aiinstareels_ui_build.plan.md` ? original UI build plan
- `docs/reference-screenshots/` ? reference UI + screenshots from the chat (Supabase, errors, signup, etc.)
- `docs/chat/*.jsonl` ? all related Cursor agent transcripts
- `CHAT_TRANSCRIPT.jsonl` ? primary conversation transcript at project root

