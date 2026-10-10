import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anonKey);

// La session (jeton d'accès + jeton de renouvellement) est conservée dans le
// stockage du navigateur et renouvelée automatiquement : une seule connexion
// par appareil. Même origine pour toutes les pages du site = session partagée.
export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true, // récupère la session au retour du lien magique
        // Flux par défaut (implicit) volontairement conservé : le lien magique
        // fonctionne même s'il s'ouvre dans un autre navigateur que celui où il a
        // été demandé (cas fréquent sur iPhone entre Mail, Safari et la PWA).
        // Le code à 6 chiffres reste disponible en secours (voir sorties.js).
      },
    })
  : null;
