# AiInstaReels

AI content generation and viral Instagram reels tracking dashboard.

## Getting started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up with email and password to create a real account.

## Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS v4
- Supabase (Auth + Postgres)
- Recharts
- next-themes (dark/light mode)

## Supabase setup

1. Copy `.env.example` to `.env.local` and add your Supabase project URL and keys.
2. In Supabase Dashboard → **Authentication → Providers**, enable Email.
3. In **Authentication → URL Configuration**, set Site URL to `http://localhost:3000` and add redirect URL `http://localhost:3000/**`.
4. Database tables (`profiles`, `jobs`) are created via Supabase migrations with Row Level Security enabled.

## Project structure

- `src/app/(auth)/` — Login and signup pages
- `src/app/(dashboard)/` — Protected dashboard and feature pages
- `src/app/auth/confirm/` — Email confirmation handler
- `src/lib/supabase/` — Supabase browser, server, and session clients
- `src/lib/auth/` — Auth context and guard
- `src/lib/mock-data.ts` — Mock dashboard data (replace with API calls next)
- `src/proxy.ts` — Session refresh and route protection

## Connect APIs (checklist)

1. **Dashboard stats** — Implement `GET /api/dashboard/stats` and update `useDashboardStats()`
2. **Activity chart** — Implement `GET /api/dashboard/activity?period=30`
3. **Daily breakdown** — Implement `GET /api/dashboard/daily-breakdown`
4. **Recent jobs** — Query `jobs` table and update `useRecentJobs()`
5. **Feature pages** — Replace placeholder pages with real forms and API integrations

## Auth

- Email + password (Supabase)
- Forgot password: `/forgot-password`
- Telegram Login Widget: link in **Settings**, then optional Telegram sign-in
- Setup guide: [`docs/TELEGRAM_AUTH_SETUP.md`](docs/TELEGRAM_AUTH_SETUP.md)

## Environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
TELEGRAM_BOT_TOKEN=your-bot-token
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=YourBotUsernameWithoutAt
```

## Scripts

- `npm run dev` — Start development server
- `npm run build` — Production build
- `npm run start` — Start production server
- `npm run lint` — Run ESLint
