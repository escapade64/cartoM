import { defineConfig } from 'vite';
import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = import.meta.dirname;

// Pages historiques (CartoM, CartoPy, hub, édition, 3D) : elles n'ont pas de
// dépendance npm et fonctionnent telles quelles. On ne les fait pas passer par
// Vite (aucun risque de régression, le service worker les référence par leur
// chemin exact) : on les recopie à l'identique dans dist/ après le build.
// Quand une page migre vers Vite, la retirer de cette liste et l'ajouter aux
// "input" ci-dessous.
const LEGACY_STATIC = [
  'index.html',
  'planning.html',
  'hub.html',
  'cartopy.html',
  'cartopy-edit.html',
  'edit.html',
  'oscar3d.html',
  'rocheren8-3d.html',
  'tahiti3d.html',
  'manifest.json',
  'service-worker.js',
  'css',
  'js',
  'data',
  'icons',
  'tiles',
  'vendor',
];

let outDir; // renseigné par configResolved (respecte --outDir)

export default defineConfig({
  // Chemins relatifs : le site vit sous /cartoM/ sur GitHub Pages.
  base: './',
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sorties: resolve(root, 'sorties.html'),
      },
    },
  },
  plugins: [
    {
      name: 'copy-legacy-static',
      apply: 'build',
      configResolved(config) {
        outDir = resolve(config.root, config.build.outDir);
      },
      closeBundle() {
        for (const entry of LEGACY_STATIC) {
          const from = resolve(root, entry);
          if (!existsSync(from)) throw new Error(`Fichier statique manquant : ${entry}`);
          cpSync(from, resolve(outDir, entry), { recursive: true });
        }
      },
    },
  ],
});
