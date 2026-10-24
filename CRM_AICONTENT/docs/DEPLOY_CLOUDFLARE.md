# Deploy AiInstaReels to ainstareel.com (Cloudflare Workers + OpenNext)

## Prerequisites

1. Domain **ainstareel.com** is an **Active** zone in Cloudflare (nameservers at Cloudflare).
2. Cloudflare API token with at least:
   - Account → Workers Scripts → Edit
   - Account → Account Settings → Read
   - Zone → Workers Routes → Edit (zone `ainstareel.com`)
   - Zone → DNS → Edit (zone `ainstareel.com`) — for custom domain attachment
3. Same secrets as local `.env.local` available at deploy time:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (and/or publishable key)
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `TELEGRAM_BOT_TOKEN`
   - `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`

## One-time project setup (already in repo)

- `@opennextjs/cloudflare` + `wrangler`
- `wrangler.jsonc` with custom domains:
  - `ainstareel.com`
  - `www.ainstareel.com`
- Scripts: `npm run deploy`

## Deploy commands

```bash
cd CRM_AICONTENT

# Put secrets for the Worker (runtime)
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put TELEGRAM_BOT_TOKEN
# NEXT_PUBLIC_* must also be present at BUILD time (inlined by Next.js)
export NEXT_PUBLIC_SUPABASE_URL=...
export NEXT_PUBLIC_SUPABASE_ANON_KEY=...
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
export NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=ainstareelsbot
export CLOUDFLARE_API_TOKEN=...
# optional if multiple accounts:
# export CLOUDFLARE_ACCOUNT_ID=...

npm run deploy
```

After deploy, Cloudflare attaches the Worker to `ainstareel.com` / `www`.

## After go-live — Supabase

Authentication → URL Configuration:

- Site URL: `https://ainstareel.com`
- Redirect URLs:
  - `https://ainstareel.com/**`
  - `https://www.ainstareel.com/**`
  - keep `http://localhost:3000/**` for local dev

## Notes

- Telegram bot deep-link auth does **not** need BotFather `/setdomain`.
- `NEXT_PUBLIC_*` values are baked in at **build** time — rebuild after changing them.
- Prefer rotating any API tokens that were pasted into chat.
