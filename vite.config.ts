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

  /*
   * LE BLOC `workbox` DU SOCLE EST ÉTENDU, JAMAIS REMPLACÉ. Jusqu'au
   * 24/09/2026, `workbox: { … }` posé à côté de `...pwaBaseOptions()`
   * écrasait tout l'objet du socle. Le service worker publié n'avait ni le
   * cache d'images, ni les exclusions de précache du socle, ni son repli de
   * navigation : il tournait sur les défauts nus de vite-plugin-pwa.
   *
   * `basePath` suit la base réelle du build. Sans lui, le repli du socle vise
   * `/mister-settle/index.html` même quand la CI construit à la racine : une
   * URL absente du précache, et un worker qui échoue à l'installation.
   */
  const pwa = pwaBaseOptions({
    id: APP_ID,
    basePath,
    // SANS `name`, LE MANIFESTE PREND L'IDENTIFIANT : le socle retombe sur
    // `id` (`name ?? shortName ?? id`), et l'écran d'accueil affichait
    // « mister-settle ». Le catalogue connaît pourtant le vrai nom — c'est
    // une amélioration à porter au socle, pas ici.
    name: 'Mister Settle',
  });

  return {
    base: basePath,
    // LE PORT VIENT DU CATALOGUE. Chaque application du parc a le sien
    // (`DEV_PORTS`), le squelette a 5240, et une application engendrée reçoit
    // un port libre à sa naissance — le générateur récrit ce repli.
    // `strictPort` : un port pris fait échouer le démarrage, au lieu de glisser
    // en silence vers un autre que `.claude/launch.json` ne connaît pas.
    server: { port: devPortOf(APP_ID, 5209), strictPort: true },
    build: {
      sourcemap: true,
      /*
       * NOMMER N'EST PAS PRÉCHARGER, et il faut les deux options pour les
       * séparer.
       *
       * `manualChunks` donne au morceau Sentry un NOM stable — sans règle,
       * Rollup le nomme d'après le module (`esm-*`), instable d'une version à
       * l'autre et partagé avec d'autres paquets : le `globIgnores` du service
       * worker n'aurait pas de cible fiable.
       *
       * Mais nommer un morceau le fait entrer dans la liste de `modulepreload`
       * de l'entrée — mesuré le 16/09/2026 sur miss-ticket-pwa, 435,4 kB
       * préchargés au lieu de 280,1, l'`import()` paresseux défait par le fait
       * même de nommer. `resolveDependencies` l'en retire.
       *
       * ET IL FAUT UNE TROISIÈME OPTION, parce que les deux premières
       * fabriquaient une URL QUI MEURT À CHAQUE DÉPLOIEMENT.
       *
       * Le morceau Sentry est le SEUL que l'entrée référence sans qu'il soit
       * précaché — c'était le but. Mais son nom portait une empreinte de
       * contenu. Le service worker sert la coquille précachée jusqu'à ce que
       * l'utilisateur accepte la mise à jour ; cette coquille demande l'ANCIENNE
       * empreinte, que le déploiement suivant a supprimée de `assets/`. Mesuré
       * en production sur mister-qowa le 22/09/2026 : HTTP 404, et « Échec du
       * chargement pour le module » dans la console. `initSentry` avale l'échec
       * (son `try/catch`), donc l'application ne casse pas — elle rapporte
       * simplement ses erreurs à personne, sans le dire.
       *
       * Un nom SANS empreinte supprime la cause : l'URL ne change plus, le
       * déploiement écrase le fichier, et la coquille périmée charge la version
       * courante. Rien n'est perdu au cache, parce qu'il n'y avait rien à
       * gagner : GitHub Pages répond `Cache-Control: max-age=600` sur TOUS les
       * fichiers, empreinte ou pas — mesuré, pas supposé.
       *
       * Les trois options se lisent ensemble ou pas du tout : le filtre
       * ci-dessous et le `globIgnores` plus bas visaient `sentry-*`, motif que ce
       * fichier ne porte plus. Ils acceptent désormais les deux formes, pour
       * qu'un retour de l'empreinte ne les rende pas muets en silence.
       * `pwa-doctor` contrôle l'invariant depuis le socle (`chunk-hors-precache`).
       */
      modulePreload: {
        resolveDependencies: (_fichier: string, deps: string[]) =>
          deps.filter(d => !/(^|\/)sentry(-[\w-]+)?\.js$/.test(d)),
      },
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            return id.replace(/\\/g, '/').includes('/@sentry/')
              ? 'sentry'
              : undefined;
          },
          chunkFileNames: chunk =>
            chunk.name === 'sentry'
              ? 'assets/sentry.js'
              : 'assets/[name]-[hash].js',
        },
      },
    },
    plugins: [
      react(),
      tailwindcss(),

      // AVANT `cspPlugin` : il pose un script inline dans le `<head>`, que la
      // CSP doit hacher après coup.
      versionPlugin({ manifest: true }),

      pwaSeoPlugin({
        basePath,
        logoPath: '/icons/icon-512.png',
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
        // Ouvre les hôtes de PostHog — le nuage EUROPÉEN (ADR 0012). Sans
        // cette option, l'ingestion que `ConsentBanner` déclenche APRÈS
        // l'accord serait refusée par la politique — et l'échec ne se verrait
        // qu'en console, sur le site déployé, une fois le consentement donné.
        analytics: true,
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
      VitePWA({
        ...pwa,
        /*
         * LE MORCEAU SENTRY HORS DU PRÉCACHE, sans quoi tout le découpage
         * ci-dessus ne servirait à rien : Workbox ramasse TOUT le JS émis,
         * `import()` ou pas. Mesuré le 16/09/2026 sur la production de deux
         * apps du parc, 345 et 463 KiB de SDK téléchargés par chaque visiteur,
         * sans qu'aucun DSN soit posé.
         *
         * AJOUTÉ aux exclusions du socle (`version.json`, `node_modules`), pas
         * à leur place : `workbox` s'étale À PLAT, une liste de l'app
         * remplacerait la sienne.
         */
        // Le motif accepte les DEUX formes de nom : le fichier s'appelle
        // désormais `sentry.js`, sans empreinte (cf. `chunkFileNames`), et
        // `sentry-*` reste accepté pour qu'un retour de l'empreinte ne fasse pas
        // entrer 158 kB de SDK dans le précache sans que rien ne le signale.
        workbox: {
          ...pwa.workbox,
          globIgnores: [
            ...(pwa.workbox.globIgnores as string[]),
            '**/sentry.js',
            '**/sentry-*.js',
          ],
        },
      }),

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
