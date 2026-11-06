-- Telegram identity fields on profiles (anti-scam verification)
alter table public.profiles
  add column if not exists telegram_id bigint unique,
  add column if not exists telegram_username text,
  add column if not exists telegram_first_name text,
  add column if not exists telegram_photo_url text,
  add column if not exists telegram_linked_at timestamptz,
  add column if not exists telegram_verified boolean not null default false;

create index if not exists profiles_telegram_id_idx
  on public.profiles (telegram_id)
  where telegram_id is not null;

-- Allow users to update their own Telegram link fields
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
