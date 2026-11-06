import { defineConfig, type PluginOption } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import {
  pwaBaseOptions,
  SENTRY_CHUNK_FILE,
  withoutSentryPreload,
} from '@mister-guiiug/dev-pwa-config/vite-pwa';
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
    // Les polices Google : mises en cache par pwaWorkbox (socle 6.32.0).
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
       * `chunkFileNames` donne au morceau Sentry un NOM stable — sans règle,
       * Rolldown le nomme d'après le module (`esm-*`), instable d'une version à
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
       *
       * ON NOMME LE MORCEAU, ON NE LE COMPOSE PLUS — et c'est ce qui rend
       * l'application au hors-ligne. Jusqu'au 05/11/2026, le nom venait d'un
       * `manualChunks`, que Rolldown traduit en groupe de `codeSplitting` AVEC
       * les dépendances de ce qu'il capture, récursivement (son défaut, que
       * Rollup n'avait pas). `@sentry/react` importe `react` : React entrait
       * dans `sentry.js` (450 Ko, `react.transitional.element`), et l'entrée
       * commençait par `import … from "./sentry.js"` — un morceau que
       * `globIgnores` sort du précache. Hors ligne, il manquait, et React ne
       * montait plus : relevé en production par l'audit hors-ligne du parc,
       * rejoué par `e2e/offline.spec.ts`.
       *
       * Sans groupe, le découpage automatique fait exactement ce qu'il faut :
       * le morceau de l'`import()` d'`initSentry` ne reçoit que ce que SEUL
       * Sentry atteint (`@sentry/*`, `web-vitals`) ; ce que l'entrée partage
       * avec lui — React — reste du côté de l'entrée, précaché. On ne fait que
       * reconnaître ce morceau à sa façade, `@sentry/react`, pour lui donner
       * son nom stable. Un groupe sans récursion
       * (`includeDependenciesRecursively: false`) a été essayé : il laissait
       * `web-vitals` dans une façade à part, en cycle avec `sentry.js`.
       */
      modulePreload: {
        resolveDependencies: withoutSentryPreload,
      },
      rolldownOptions: {
        output: {
          chunkFileNames: chunk =>
            chunk.isDynamicEntry &&
            /[\\/]node_modules[\\/]@sentry[\\/]react[\\/]/.test(
              chunk.facadeModuleId ?? ''
            )
              ? SENTRY_CHUNK_FILE
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
        // Ledger (DESIGN.md) : fond page clair / navy sombre.
        themeColor: { light: '#f4f6f8', dark: '#0b1f33' },
        // « À propos » est une vraie URL, lisible sans session : sans fichier,
        // GitHub Pages la servait en 404 (le repli SPA garde ce statut). Le
        // socle l'écrit au build avec son titre et sa description, et la met
        // au plan de site.
        routes: [
          {
            path: 'a-propos',
            title:
              'À propos de Mister Settle : partage de dépenses sans argent',
            description:
              'Mister Settle répartit les dépenses d’un groupe (voyage, colocation, famille) et calcule qui doit quoi à qui, sans jamais manipuler d’argent. Gratuit.',
          },
        ],
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
        connectSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        // IBM Plex (Ledger) : feuilles Google Fonts + fichiers gstatic.
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
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
      // Le morceau Sentry est hors du précache par pwaWorkbox (socle 6.32.0).
      VitePWA(pwa),

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
