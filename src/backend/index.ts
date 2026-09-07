import { createBackendSelector } from '@mister-guiiug/dev-pwa-config/backend';
import { createIdb } from '@mister-guiiug/dev-pwa-config/idb';
import { createLogger } from '@mister-guiiug/dev-pwa-config/logger';
import { withReadCache } from './cached.ts';
import { createLocalBackend } from './local.ts';
import type { Backend } from './ports.ts';
import { useSyncState } from './sync-state.ts';

const log = createLogger('backend');

/**
 * L'ADAPTATEUR SUPABASE ARRIVE À LA DEMANDE. Il pèse — ses lignes, ses
 * schémas, et derrière lui le SDK que la fabrique du socle charge déjà
 * paresseusement. Une application ouverte sans configuration, ou qui tourne
 * sur l'appareil, n'a pas à le télécharger : chaque port est un relais qui
 * importe le module au premier appel, une seule fois, puis s'efface.
 */
function createLazySupabaseBackend(): Backend {
  let loaded: Promise<Backend> | null = null;
  const load = () => {
    // Les lectures gardent leur dernière réponse dans IndexedDB et la
    // resservent quand le réseau manque (ADR 0015) ; l'état de synchronisation
    // apprend qu'on lit une copie, et de quand.
    loaded ??= import('./supabase.ts').then(m =>
      withReadCache(
        m.createSupabaseBackend(),
        createIdb('mister-settle-cache'),
        {
          onStale: at => useSyncState.getState().markStale(at),
          onFresh: () => useSyncState.getState().markFresh(),
          isOnline: () => useSyncState.getState().online,
        }
      )
    );
    return loaded;
  };
  const relay = <K extends keyof Backend>(port: K): Backend[K] =>
    new Proxy({} as Backend[K], {
      get:
        (_target, method: string) =>
        async (...args: unknown[]) => {
          const backend = await load();
          const target = backend[port] as unknown as Record<
            string,
            (...a: unknown[]) => unknown
          >;
          const fn = target[method];
          if (typeof fn !== 'function') {
            throw new TypeError(`${port}.${method} inconnu`);
          }
          return fn.apply(target, args);
        },
    });
  return {
    spaces: relay('spaces'),
    participants: relay('participants'),
    groups: relay('groups'),
    categories: relay('categories'),
    expenses: relay('expenses'),
    settlements: relay('settlements'),
    invitations: relay('invitations'),
    activity: relay('activity'),
    attachments: relay('attachments'),
  };
}

/**
 * LE SÉLECTEUR DE BACKEND, DÉCLARÉ EN UNE FOIS (ADR 0004).
 *
 * Trois règles, dans cet ordre : un choix explicite (`VITE_BACKEND`) gagne
 * toujours ; sinon la présence de toutes les variables requises décide ; sinon
 * on retombe sur le repli. Un choix explicite INCONNU est ignoré — mieux vaut
 * démarrer en local qu'échouer sur une faute de frappe dans un `.env`.
 *
 * **Le repli local n'est pas un détail.** Une app qui exige sa configuration
 * pour démarrer ne tourne ni hors ligne, ni en test, ni dans une CI sans
 * secrets, ni sur la page publique que quelqu'un ouvre sans compte. Ici, le
 * repli est COMPLET : tous les ports, toute la logique de validation, sur
 * l'appareil.
 *
 * L'adaptateur Supabase remplace TOUS les ports d'un coup : ils partagent la
 * même base et les mêmes fonctions ; en migrer un seul n'aurait pas de sens.
 * La file d'écritures hors ligne (ADR 0015) s'ajoutera autour de
 * `expenses.save` au lot 12, sans toucher à l'adaptateur.
 */
const selectBackend = createBackendSelector<Backend>({
  fallback: createLocalBackend,
  backends: {
    supabase: {
      requires: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'],
      create: () => createLazySupabaseBackend(),
    },
  },
  onFallback: ({ kind, missing, error }) => {
    log.warn('repli sur le backend local', { kind, missing, error });
  },
});

const selected = selectBackend(import.meta.env);

/** Le backend de l'application. */
export const backend = selected.backend;

/**
 * Où en est la migration : quels ports sont distants, lesquels sont restés
 * locaux. Une app à moitié migrée doit pouvoir le DIRE — c'est ce que l'écran
 * de réglages affiche.
 */
export const coverage = {
  kind: selected.kind,
  remote: selected.remote,
  local: selected.local,
};

/** `true` quand un compte et une base existent derrière l'application. */
export const isRemote = coverage.kind === 'supabase';

export type { Backend } from './ports.ts';
