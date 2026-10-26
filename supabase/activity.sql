-- Journal : une activité principale par sortie + spots de surf / windsurf dans les lieux.
-- À coller dans Supabase > SQL Editor > New query, puis "Run". Rejouable sans risque.

-- 1) Nouvelles catégories de lieux
alter table public.places drop constraint if exists places_category_check;
alter table public.places add constraint places_category_check
  check (category in ('parking','col','sommet','refuge','cabane','bivouac','priere','surf','windsurf'));

-- 2) Activité principale (une seule par sortie)
alter table public.outings add column if not exists activity text;

-- Reprise des sorties existantes : première activité cochée ; Alpinisme -> Randonnée,
-- Voile -> Autre. Les autres activités cochées sont recopiées dans les notes.
update public.outings o set
  activity = case coalesce(o.activities[1], 'Autre')
               when 'Alpinisme' then 'Randonnée'
               when 'Voile' then 'Autre'
               else coalesce(o.activities[1], 'Autre') end,
  notes = nullif(concat_ws(E'\n',
            nullif(o.notes, ''),
            case when o.activities[1] = 'Voile' then 'Activité d''origine : Voile' end,
            case when cardinality(o.activities) > 1
                 then 'Autres activités : ' || array_to_string(o.activities[2:], ', ') end), '')
where o.activity is null;
