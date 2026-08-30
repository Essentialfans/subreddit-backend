# Telegram + password auth setup

AiInstaReels uses:

1. **Email + password** (Supabase Auth)
2. **Forgot password** email reset
3. **Telegram bot deep link** (works on localhost — no public domain needed)
4. Stores `telegram_id` + `@username` on `profiles` for anti-scam review

> BotFather **rejects `localhost`** for the Login Widget `/setdomain`.  
> So we use: app → open `@yourbot?start=CODE` → bot captures your Telegram identity → app finishes link/login.

## 1. SQL (profiles telegram columns)

Already done if you ran `20260830_telegram_auth.sql`.

Optional durable codes table (not required for local single-server):

`supabase/migrations/20260830_telegram_deep_link_codes.sql`

## 2. BotFather

1. Create bot → copy token  
2. **You do NOT need `/setdomain` for this deep-link flow**  
3. Put in `.env.local`:

```env
TELEGRAM_BOT_TOKEN=...
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=ainstareelsbot
SUPABASE_SERVICE_ROLE_KEY=...
```

## 3. User flow

| Step | What happens |
|------|----------------|
| Sign up | Email + password |
| Settings | Click **Link Telegram via bot** → Start the bot in Telegram |
| Jobs | Requires `telegram_verified` |
| Sign in later | Email+password **or** **Continue with Telegram bot** |
| Forgot password | `/forgot-password` |

## Production later

When you have a real domain, you can optionally add the Login Widget again with `/setdomain yourdomain.com`. Deep-link bot auth can stay as the primary method.
