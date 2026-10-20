-- Fonction minimale appelée par le ping hebdomadaire (.github/workflows/keepalive.yml)
-- pour que Supabase voie de l'activité et ne mette pas le projet gratuit en pause.
-- Ne lit aucune donnée : renvoie seulement l'heure du serveur. Rejouable.
create or replace function public.ping() returns timestamptz
language sql stable as $$ select now() $$;

revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
