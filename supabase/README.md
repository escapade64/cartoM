# Mise en route de « Mes sorties » (Supabase)

La page `sorties.html` enregistre tes sorties dans une base Supabase protégée par
connexion (lien magique par email). Rien de personnel n'est stocké dans ce dépôt public.

## 1. Côté Supabase (une seule fois)

1. Créer un projet sur <https://supabase.com> (offre gratuite, région UE).
2. **SQL Editor → New query** : coller le contenu de `supabase/schema.sql` → **Run**.
   Le script est rejouable sans risque.
3. **Authentication → Users → Add user** : ton email, case « Auto Confirm User » cochée.
4. **Authentication → Sign In / Providers** : désactiver **Allow new users to sign up**.
   Sans ça, n'importe qui pourrait se créer un compte sur ton site public (il ne verrait
   pas tes données grâce à la RLS, mais il consommerait ton quota d'emails).
5. **Authentication → URL Configuration** :
   - Site URL : `https://escapade64.github.io/cartoM/`
   - Redirect URLs : `https://escapade64.github.io/cartoM/sorties.html`
     (et `http://localhost:5173/sorties.html` pour le développement local)
6. *(Recommandé)* **Authentication → Emails → Magic Link** : ajouter dans le modèle la ligne
   `Code : {{ .Token }}`. Ça permet de se connecter avec un code à 6 chiffres quand le lien
   s'ouvre dans le mauvais navigateur (fréquent entre l'appli Mail, Safari et la PWA sur iPhone).
7. **Project Settings → API** : noter *Project URL* et la clé *anon public*.
   Ne jamais utiliser ni commiter la clé `service_role`.

## 2. Côté GitHub

1. **Settings → Secrets and variables → Actions → Variables** : créer
   `SUPABASE_URL` et `SUPABASE_ANON_KEY` (ce sont des variables, pas des secrets : ces
   deux valeurs sont publiques par conception).
2. **Settings → Pages → Build and deployment → Source : GitHub Actions**.
3. Fusionner la branche : chaque push sur `main` lance `npm run build` et publie `dist/`.
   Les pages historiques sont recopiées à l'identique ; seule `sorties.html` passe par Vite.

> Les pages d'édition (`edit.html`, `cartopy-edit.html`) publient en committant sur `main` :
> chaque publication déclenche désormais un build (environ une minute avant d'être en ligne).

## 3. Développement local

```bash
cp .env.example .env.local   # renseigner URL et clé anon
npm install
npm run dev                  # http://localhost:5173/sorties.html
npm run build && npm run preview
```

## Points d'attention

- **Mails de connexion** : l'envoi intégré de Supabase est très limité (quelques mails par
  heure). Suffisant pour un usage perso ; au-delà, brancher un SMTP personnel.
- **Projet gratuit en pause** : Supabase met en pause les projets gratuits restés inactifs
  environ une semaine (à vérifier dans les conditions actuelles). La reprise se fait depuis
  le tableau de bord.
- **Sauvegarde / migration** : la base est du Postgres standard (`pg_dump`) ; on peut la
  rapatrier sur un autre serveur plus tard.
- **Sécurité** : toutes les tables ont la RLS activée avec la règle `user_id = auth.uid()`.
  Si tu ajoutes une table, copier ce schéma de règle.
