-- Donner l'accès en lecture à un membre de la famille.
-- 1) Supabase > Authentication > Users > "Invite user" avec son adresse email.
-- 2) Remplacer les deux adresses ci-dessous puis "Run".
insert into public.shares (owner_id, viewer_id)
select o.id, v.id
from auth.users o, auth.users v
where o.email = 'MON_ADRESSE@exemple.fr'
  and v.email = 'ADRESSE_DU_PROCHE@exemple.fr'
on conflict do nothing;

-- Retirer l'accès :
-- delete from public.shares where viewer_id = (select id from auth.users where email = 'ADRESSE_DU_PROCHE@exemple.fr');
-- Voir les partages :
-- select o.email as proprietaire, v.email as invite from public.shares s
--   join auth.users o on o.id = s.owner_id join auth.users v on v.id = s.viewer_id;
