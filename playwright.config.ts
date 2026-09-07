import { defineConfig, devices } from '@playwright/test';
import { definePwaPlaywrightConfig } from '@mister-guiiug/dev-pwa-config/playwright-base';

/**
 * La fabrique du socle fournit la matrice de navigateurs, les reporters, le
 * gabarit de captures, `reducedMotion` et le serveur de test.
 *
 * `preview: true` : les e2e passent sur un BUILD de production, jamais sur le
 * serveur de développement. C'est le seul moyen d'exercer ce qui n'existe qu'à
 * la fin — service worker, minification, manifeste, repli 404.
 *
 * `VITE_BASE_PATH=/` neutralise le chemin GitHub Pages le temps du test, et le
 * port 4173 évite la collision avec un serveur de développement.
 */
const base = definePwaPlaywrightConfig({
  devices,
  testMatch: /.*\.spec\.ts$/,
  preview: true,
  port: 4173,
  command:
    'cross-env VITE_BASE_PATH=/ vite build && cross-env VITE_BASE_PATH=/ vite preview --port 4173 --strictPort',
});

/**
 * LA LANGUE DU NAVIGATEUR EST FIXÉE, sans quoi la suite est instable par
 * construction.
 *
 * `createI18n` choisit la locale initiale d'après `navigator.language` quand
 * rien n'est stocké. Playwright démarre en `en-US` : l'application s'ouvre donc
 * en anglais, et un test qui cherche « Nouvelle note » attend trente secondes
 * un champ nommé « New note ». Le diagnostic est trompeur, parce que le seul
 * test qui passait était celui qui ne lit qu'un titre identique dans les deux
 * langues.
 *
 * LE `use` EST FUSIONNÉ À LA MAIN, et pas passé par l'option `overrides` de la
 * fabrique : celle-ci REMPLACE la clé au lieu de la compléter, ce qui efface
 * le `baseURL` qu'elle vient de calculer — `page.goto('/')` sort alors en
 * « Cannot navigate to invalid URL ».
 */
export default defineConfig({
  ...base,
  use: { ...(base.use as Record<string, unknown>), locale: 'fr-FR' },
});
