-- Partage en lecture seule (famille) : un "propriétaire" autorise des comptes invités
-- à LIRE ses repères CartoPy et son journal de sorties. Aucune écriture possible pour eux.
-- À coller dans Supabase > SQL Editor > New query, puis "Run". Rejouable sans risque.

create table if not exists public.shares (
  owner_id   uuid not null references auth.users (id) on delete cascade,
  viewer_id  uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, viewer_id),
  check (owner_id <> viewer_id)
);

alter table public.shares enable row level security;
alter table public.shares force row level security;
drop policy if exists "see own shares" on public.shares;
-- Lecture seule côté site : chacun voit les partages qui le concernent. Les partages se
-- créent/suppriment uniquement depuis le SQL Editor (aucune règle d'écriture).
create policy "see own shares" on public.shares for select to authenticated
  using (owner_id = (select auth.uid()) or viewer_id = (select auth.uid()));
revoke all on public.shares from anon;

do $$
declare t text;
begin
  foreach t in array array['places', 'place_segments', 'outings', 'routes', 'friends', 'gear',
                           'outing_friends', 'outing_gear'] loop
    execute format('drop policy if exists "shared read" on public.%I', t);
    execute format(
      'create policy "shared read" on public.%I for select to authenticated
         using (exists (select 1 from public.shares s
                        where s.owner_id = %I.user_id and s.viewer_id = (select auth.uid())))', t, t);
  end loop;
end $$;
