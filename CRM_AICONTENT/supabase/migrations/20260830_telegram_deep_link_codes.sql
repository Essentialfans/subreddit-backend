-- Optional durable store for Telegram deep-link codes (local can use in-memory).
create table if not exists public.telegram_auth_codes (
  code text primary key,
  mode text not null check (mode in ('link', 'login', 'signup')),
  user_id uuid references auth.users on delete cascade,
  telegram_id bigint,
  telegram_username text,
  telegram_first_name text,
  telegram_photo_url text,
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'consumed', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  consumed_at timestamptz
);

create index if not exists telegram_auth_codes_status_idx
  on public.telegram_auth_codes (status, expires_at);

alter table public.telegram_auth_codes enable row level security;
-- No public policies: only service role / server uses this table.
