
-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Status enum
create type public.perfume_status as enum ('owned', 'wishlist');

-- Perfumes
create table public.perfumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  house text,
  house_origin text,
  year integer,
  perfumer text,
  description text,
  top_notes text[] default '{}',
  middle_notes text[] default '{}',
  base_notes text[] default '{}',
  similar_perfumes text[] default '{}',
  rating numeric(2,1) check (rating >= 0 and rating <= 5),
  status public.perfume_status not null default 'owned',
  image_url text,
  ai_enriched boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index perfumes_user_status_idx on public.perfumes(user_id, status);
alter table public.perfumes enable row level security;
create policy "perfumes_select_own" on public.perfumes for select using (auth.uid() = user_id);
create policy "perfumes_insert_own" on public.perfumes for insert with check (auth.uid() = user_id);
create policy "perfumes_update_own" on public.perfumes for update using (auth.uid() = user_id);
create policy "perfumes_delete_own" on public.perfumes for delete using (auth.uid() = user_id);

-- Scent memory diary entries
create table public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  perfume_id uuid not null references public.perfumes(id) on delete cascade,
  worn_on date not null default current_date,
  occasion text,
  memory text,
  created_at timestamptz not null default now()
);
create index diary_entries_perfume_idx on public.diary_entries(perfume_id, worn_on desc);
alter table public.diary_entries enable row level security;
create policy "diary_select_own" on public.diary_entries for select using (auth.uid() = user_id);
create policy "diary_insert_own" on public.diary_entries for insert with check (auth.uid() = user_id);
create policy "diary_update_own" on public.diary_entries for update using (auth.uid() = user_id);
create policy "diary_delete_own" on public.diary_entries for delete using (auth.uid() = user_id);

-- updated_at trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger perfumes_touch before update on public.perfumes
  for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
