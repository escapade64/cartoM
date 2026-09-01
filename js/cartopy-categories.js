// Catégories d'objets CartoPy, partagées entre cartopy.js (affichage) et
// cartopy-edit.js (édition), pour garder une seule source de vérité sur les
// libellés, couleurs et badges utilisés pour chaque type de repère.

const CATEGORIES = {
  parking: { label: 'Parking', color: '#1a73e8', badge: 'P' },
  col: { label: 'Col', color: '#f4511e', badge: 'C' },
  sommet: { label: 'Sommet', color: '#6d4c00', badge: 'S' },
  refuge: { label: 'Refuge', color: '#1e8e3e', badge: 'R' },
  cabane: { label: 'Cabane', color: '#8d5524', badge: 'Ca' },
  priere: { label: 'Lieu de prière', color: '#7b1fa2', badge: '+' },
};

const CATEGORY_ORDER = ['parking', 'col', 'sommet', 'refuge', 'cabane', 'priere'];

export { CATEGORIES, CATEGORY_ORDER };
