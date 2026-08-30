# Telegram + password auth setup

AiInstaReels uses:

1. **Email + password** (Supabase Auth) as the account
2. **Forgot password** email reset
3. **Telegram Login Widget** for one-time link + optional Telegram login
4. **Telegram id + @username** stored on `profiles` for anti-scam review

## 1. Run the SQL migration

In Supabase → **SQL Editor**, run:

`supabase/migrations/20260830_telegram_auth.sql`

This adds `telegram_id`, `telegram_username`, `telegram_verified`, etc. on `profiles`.

## 2. Create a Telegram bot

1. Open [@BotFather](https://t.me/BotFather) in Telegram
2. `/newbot` → pick a name and username (e.g. `AiInstaReelsBot`)
3. Copy the **bot token**
4. Run `/setdomain` for that bot and set:
   - Dev: `localhost` (Telegram Login Widget supports localhost for testing)
   - Prod: your real domain later (e.g. `app.example.com`)

## 3. Env vars

Add to `.env.local` (never commit secrets):

```env
SUPABASE_SERVICE_ROLE_KEY=...   # Project Settings → API → service_role
TELEGRAM_BOT_TOKEN=...          # from BotFather
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=YourBotUsernameWithoutAt
```

Restart `npm run dev` after changing env.

## 4. Auth redirect URLs

Supabase → Authentication → URL Configuration:

- Site URL: `http://localhost:3000`
- Redirect URLs include:
  - `http://localhost:3000/**`
  - `http://localhost:3000/auth/confirm`

## 5. User flow

| Step | What happens |
|------|----------------|
| Sign up | Email + password |
| Settings | Click Telegram Login Widget → link once |
| Jobs | Requires `telegram_verified` |
| Sign in later | Email+password **or** Telegram (if linked) |
| Forgot password | `/forgot-password` → email link → `/reset-password` |

## Security notes

- Trust **Telegram id**, not username alone (usernames can change or be empty)
- Bot token and service role key are **server-only**
- Telegram proves account ownership; it does not prove someone is trustworthy — use @username for manual review
