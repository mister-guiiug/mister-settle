import { defineConfig, type PluginOption } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import { pwaBaseOptions } from '@mister-guiiug/dev-pwa-config/vite-pwa';
import {
  pwaSeoPlugin,
  spaFallbackPlugin,
} from '@mister-guiiug/dev-pwa-config/vite-pwa-base';
import { cspPlugin } from '@mister-guiiug/dev-pwa-config/vite-csp';
import { versionPlugin } from '@mister-guiiug/dev-pwa-config/vite-version';
import { devPortOf } from '@mister-guiiug/dev-pwa-config/apps-catalog';

/**
 * LE MANIFESTE NE S'ÉCRIT PAS À LA MAIN.
 *
 * `pwaBaseOptions({ id })` engendre le manifeste complet — `id`, `lang`, scope,
 * `start_url`, icônes `any` ET `maskable`, couleurs lues dans la palette de
 * l'app — et les options Workbox qui vont avec. C'est le module que le socle
 * publie depuis longtemps et que **zéro application n'importait** : les vingt
 * `vite.config.ts` du parc font de 83 à 380 lignes, dont une centaine à
 * recopier ce que cette fonction rend. Les défauts qui en découlaient se
 * mesuraient en production le 02/09/2026 : `lang: en` sur trois apps
 * françaises, `id` absent six fois, `maskable` absent trois fois.
 *
 * Ce fichier est court exprès. Tout ce qui n'y est pas est une décision que le
 * socle a déjà prise, et qu'une app n'a pas à reprendre.
 */
const analyze = process.env.ANALYZE === '1';
const APP_ID = 'mister-settle';

export default defineConfig(({ command }) => {
  // `VITE_BASE_PATH` est prioritaire : le déploiement famille le pose, et la
  // CI Lighthouse le met à `/` pour servir le build à la racine. Sans cette
  // priorité, l'audit part sur un chemin qui n'existe pas et rend NO_FCP.
  let basePath = '/';
  if (process.env.VITE_BASE_PATH) {
    basePath = process.env.VITE_BASE_PATH;
  } else if (command === 'build') {
    basePath = `/${APP_ID}/`;
  }

  return {
    base: basePath,
    // LE PORT VIENT DU CATALOGUE. Chaque application du parc a le sien
    // (`DEV_PORTS`), le squelette a 5240, et une application engendrée reçoit
    // un port libre à sa naissance — le générateur récrit ce repli.
    // `strictPort` : un port pris fait échouer le démarrage, au lieu de glisser
    // en silence vers un autre que `.claude/launch.json` ne connaît pas.
    server: { port: devPortOf(APP_ID, 5209), strictPort: true },
    build: { sourcemap: true },
    plugins: [
      react(),
      tailwindcss(),

      // AVANT `cspPlugin` : il pose un script inline dans le `<head>`, que la
      // CSP doit hacher après coup.
      versionPlugin({ manifest: true }),

      pwaSeoPlugin({
        basePath,
        logoPath: '/icon-512.png',
        themeColor: { light: '#f7f8fa', dark: '#0f1115' },
      }),

      // `frame-ancestors` est volontairement absent : la spécification
      // l'ignore dans une balise `<meta>`, et GitHub Pages ne pose aucun
      // en-tête. Le greffon refuse la directive plutôt que d'en donner
      // l'illusion.
      // LES HÔTES DE LA BASE PARTAGÉE : les appels et le temps réel (connect),
      // et les URL signées des justificatifs (img). Les options REMPLACENT
      // les défauts du greffon : on les redonne en entier.
      cspPlugin({
        dev: command === 'serve',
        connectSrc: ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://*.supabase.co'],
      }),

      // Repli SPA : sans `404.html`, rafraîchir un lien profond sert la page
      // d'erreur de GitHub. Quatre apps en souffraient en production.
      spaFallbackPlugin(),

      // Le manifeste sort entier de `pwaBaseOptions({ id })`. Depuis le socle
      // 4.3.0, il n'y a plus rien à lui redire ici :
      //   - `theme_color` et `background_color` sont lus dans `src/index.css`
      //     (`--dwc-primary`, `--dwc-bg`) quand l'app n'est pas au catalogue ;
      //     le build AVERTIT si aucun chemin ne donne de couleur, car sans
      //     `theme_color` l'application ne s'installe pas ;
      //   - les captures sont lues dans `public/screenshots` (`narrow.png`,
      //     `wide.png`), dimensions comprises. Elles décident de l'interface
      //     d'installation — une fiche au lieu d'une ligne et un bouton — et
      //     `npm run screenshots` les régénère depuis un build.
      VitePWA(
        pwaBaseOptions({
          id: APP_ID,
          // SANS `name`, LE MANIFESTE PREND L'IDENTIFIANT : le socle retombe
          // sur `id` (`name ?? shortName ?? id`), et l'écran d'accueil
          // affichait « mister-settle ». Le catalogue connaît pourtant le vrai
          // nom — c'est une amélioration à porter au socle, pas ici.
          name: 'Mister Settle',
        })
      ),

      ...(analyze
        ? [
            visualizer({
              filename: 'dist/stats.html',
              gzipSize: true,
              brotliSize: true,
              open: !process.env.CI,
            }) as PluginOption,
          ]
        : []),
    ],
  };
});
