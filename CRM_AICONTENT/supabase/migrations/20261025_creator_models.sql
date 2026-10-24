-- Reusable identity models + reference images for generation.
create table if not exists public.creator_models (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  slug text not null,
  niche text,
  status text not null default 'ready'
    check (status in ('ready', 'in_progress', 'draft')),
  cover_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

create table if not exists public.creator_model_refs (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.creator_models on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  public_url text not null,
  storage_path text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists creator_models_user_idx
  on public.creator_models (user_id, updated_at desc);

create index if not exists creator_model_refs_model_idx
  on public.creator_model_refs (model_id, sort_order);

alter table public.creator_models enable row level security;
alter table public.creator_model_refs enable row level security;

drop policy if exists "Users manage own creator models" on public.creator_models;
create policy "Users manage own creator models"
  on public.creator_models for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own model refs" on public.creator_model_refs;
create policy "Users manage own model refs"
  on public.creator_model_refs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
