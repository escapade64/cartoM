-- Lieux CartoPy (parkings, cols, sommets, refuges…) et segments, dans Supabase.
-- À coller dans Supabase > SQL Editor > New query, puis "Run" (après schema.sql).
-- Rejouable sans risque.

create table if not exists public.places (
  id        text not null,                 -- id stable (ex. 'point-20'), repris de cartopy-data.js
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category  text not null check (category in ('parking','col','sommet','refuge','cabane','bivouac','priere')),
  name      text not null check (length(btrim(name)) > 0),
  altitude  numeric(7, 1),
  lat       double precision not null check (lat between -90 and 90),
  lon       double precision not null check (lon between -180 and 180),
  notes     text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (id, user_id)
);

create table if not exists public.place_segments (
  id          text not null,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null default '',
  from_id     text not null,
  to_id       text not null,
  distance_km numeric(7, 2),
  d_plus      integer,
  d_minus     integer,
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (from_id, user_id) references public.places (id, user_id) on delete cascade,
  foreign key (to_id, user_id)   references public.places (id, user_id) on delete cascade
);

-- Lien sortie -> lieu de départ (le texte libre start_point reste possible).
alter table public.outings add column if not exists start_place_id text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'outings_start_place_fk') then
    alter table public.outings
      add constraint outings_start_place_fk
      foreign key (start_place_id, user_id) references public.places (id, user_id)
      on delete set null (start_place_id);
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['places', 'place_segments'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
