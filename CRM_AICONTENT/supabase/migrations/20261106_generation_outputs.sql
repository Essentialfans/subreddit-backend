-- Generated images/videos kept for 3 days so users can reopen & send to recreate/video.
create table if not exists public.generation_outputs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('image', 'video')),
  public_url text not null,
  storage_path text not null,
  source_url text,
  prompt text,
  model_id text,
  model_label text,
  creator_model_id uuid references public.creator_models on delete set null,
  aspect text,
  resolution text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists generation_outputs_user_created_idx
  on public.generation_outputs (user_id, created_at desc);

create index if not exists generation_outputs_expires_idx
  on public.generation_outputs (expires_at);

alter table public.generation_outputs enable row level security;

drop policy if exists "Users manage own generation outputs" on public.generation_outputs;
create policy "Users manage own generation outputs"
  on public.generation_outputs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
