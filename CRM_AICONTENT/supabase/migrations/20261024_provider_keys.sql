-- Per-user AI provider API keys (encrypted at application layer).
create table if not exists public.provider_keys (
  user_id uuid primary key references auth.users on delete cascade,
  provider text not null default 'kie',
  ciphertext text not null,
  iv text not null,
  key_hint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_keys_provider_check check (provider in ('kie'))
);

alter table public.provider_keys enable row level security;

drop policy if exists "Users can read own provider keys" on public.provider_keys;
create policy "Users can read own provider keys"
  on public.provider_keys for select
  using (auth.uid() = user_id);

-- Writes go through service role only (server encrypts).
drop policy if exists "Users cannot write provider keys" on public.provider_keys;
