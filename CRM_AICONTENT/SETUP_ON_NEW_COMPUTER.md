# SETUP ON NEW COMPUTER — READ THIS FIRST

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

Unzip `AiInstaReels_transfer.zip`.  
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
- radix UI helpers, etc.

**You do not need to install these separately.**

---

## 4. Env file

`.env.local` is already in the zip (Supabase keys).  
If login fails, open `.env.local` and confirm these three exist:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## 5. Run the app

```bash
npm run dev
```

Open: http://localhost:3000

---

## Then read

1. `HANDOFF.md` — what was built and where we stopped  
2. `CHAT_CONTEXT.md` — decisions from the previous chat  

**Last stop:** Email + password + Telegram verification auth is in the code.

Also do:

1. Copy `.env.example` → fill `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`
2. Run SQL in `supabase/migrations/20260830_telegram_auth.sql`
3. Follow `docs/TELEGRAM_AUTH_SETUP.md`
