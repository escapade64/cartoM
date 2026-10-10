-- Schéma Supabase — journal de sorties outdoor (CartoM / CartoPy / futur shell).
-- À coller dans Supabase > SQL Editor > New query, puis "Run". Rejouable sans risque
-- (create ... if not exists / create or replace).
--
-- Principe de sécurité : chaque ligne porte un user_id (= le compte connecté) et
-- la Row Level Security n'autorise QUE les lignes dont user_id = auth.uid().
-- Le site étant public, la clé "anon" est visible dans le code : c'est normal, c'est
-- la RLS qui protège les données. Ne jamais mettre la clé "service_role" dans le dépôt.
--
-- Les clés étrangères sont composites (id, user_id) : impossible de rattacher, par
-- exemple, une sortie à l'itinéraire ou à l'ami d'un autre compte.

-- ---------------------------------------------------------------- itinéraires
create table if not exists public.routes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  activity    text,                      -- activité principale (rando, ski, escalade…)
  area        text,                      -- massif / zone
  start_point text,                      -- parking, port, point de départ habituel
  difficulty  text,
  track       jsonb,                     -- tracé GeoJSON (LineString), optionnel
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);

-- --------------------------------------------------------------------- amis
create table if not exists public.friends (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);

-- ------------------------------------------------------------------- sorties
create table if not exists public.outings (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  outing_date      date not null,
  title            text not null check (length(btrim(title)) > 0),
  activities       text[] not null default '{}',
  route_id         uuid,
  distance_km      numeric(7, 2) check (distance_km is null or distance_km >= 0),
  elevation_gain_m integer       check (elevation_gain_m is null or elevation_gain_m >= 0),
  elevation_loss_m integer       check (elevation_loss_m is null or elevation_loss_m >= 0),
  duration_min     integer       check (duration_min is null or duration_min >= 0),
  start_point      text,
  notes            text,
  extra            jsonb not null default '{}'::jsonb,   -- champs propres à une activité (hauteur de vague, chaussures…)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, user_id),
  -- si l'itinéraire est supprimé, la sortie reste (route_id repasse à null)
  foreign key (route_id, user_id) references public.routes (id, user_id) on delete set null (route_id)
);

-- Amis présents à une sortie (plusieurs par sortie, un ami dans plusieurs sorties).
create table if not exists public.outing_friends (
  outing_id uuid not null,
  friend_id uuid not null,
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (outing_id, friend_id),
  foreign key (outing_id, user_id) references public.outings (id, user_id) on delete cascade,
  foreign key (friend_id, user_id) references public.friends (id, user_id) on delete cascade
);

-- ------------------------------------------------------------------ matériel
create table if not exists public.gear (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  brand       text,
  category    text,
  weight_g    integer check (weight_g is null or weight_g >= 0),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);

-- Matériel emporté lors d'une sortie.
create table if not exists public.outing_gear (
  outing_id uuid not null,
  gear_id   uuid not null,
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (outing_id, gear_id),
  foreign key (outing_id, user_id) references public.outings (id, user_id) on delete cascade,
  foreign key (gear_id, user_id) references public.gear (id, user_id) on delete cascade
);

-- ------------------------------------------------------------------ index
create index if not exists outings_user_date_idx on public.outings (user_id, outing_date desc);
create index if not exists outings_route_idx     on public.outings (route_id);
create index if not exists outing_friends_friend_idx on public.outing_friends (friend_id);
create index if not exists outing_gear_gear_idx      on public.outing_gear (gear_id);

-- ------------------------------------------------- updated_at automatique
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['routes', 'friends', 'outings', 'gear'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ------------------------------------------------------ Row Level Security
do $$
declare t text;
begin
  foreach t in array array['routes', 'friends', 'outings', 'outing_friends', 'gear', 'outing_gear'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
    -- aucun accès pour les visiteurs non connectés
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
