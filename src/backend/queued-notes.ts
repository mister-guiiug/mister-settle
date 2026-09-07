import {
  createSyncQueue,
  type SyncQueue,
} from '@mister-guiiug/dev-pwa-config/sync-queue';
import { createStore } from '@mister-guiiug/dev-pwa-config/storage';
import { classifyBackendError } from '@mister-guiiug/dev-pwa-config/backend';
import { createLogger } from '@mister-guiiug/dev-pwa-config/logger';
import type { Note, NotesRepository } from './ports.ts';

const log = createLogger('sync');

/**
 * Ce qui peut attendre : les gestes qui nomment UNE ligne. `import` et `clear`
 * n'y sont pas, et c'est une décision — cf. ADR 0010.
 */
export type NoteMutation =
  { kind: 'add'; note: Note } | { kind: 'remove'; id: string };

export type SyncStatus = 'synced' | 'pending' | 'offline' | 'error';

export interface SyncSnapshot {
  status: SyncStatus;
  /** Écritures en attente d'un réseau. */
  pending: number;
  /** Écritures refusées durablement — à montrer, pas à cacher. */
  dead: number;
  /** Le dernier refus, tel que la base l'a formulé. */
  lastError: string | null;
}

export interface QueuedNotes {
  /** Le port, inchangé de l'extérieur — c'est tout l'intérêt. */
  notes: NotesRepository;
  queue: SyncQueue<NoteMutation>;
  /** `useSyncExternalStore` : l'abonnement et l'instantané STABLE. */
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => SyncSnapshot;
  /** Draine ce qui restait, puis rejoue à chaque retour en ligne. */
  start: () => Promise<unknown>;
  stop: () => void;
  /**
   * Le drain déclenché par la dernière écriture, une fois achevé.
   *
   * `add()` rend la main dès que la mutation est enfilée : le drain, lui,
   * continue dans son coin. Sans cette poignée, un test devrait deviner
   * combien de tours de micro-tâches attendre — et le socle rend `{0,0,0}` à
   * un second `flush()` concurrent, ce qui donne un test vert par hasard
   * plutôt qu'une observation.
   */
  drained: () => Promise<void>;
}

export interface QueuedNotesOptions {
  /** Préfixe des clés de la file dans le stockage — l'app partage son origine. */
  prefix?: string;
  /** Défaut : `navigator.onLine !== false`. Injectable (tests). */
  isOnline?: () => boolean;
  /** Porte `addEventListener('online'|'offline')`. Défaut : `globalThis`. */
  env?: {
    addEventListener?: (type: string, listener: () => void) => void;
    removeEventListener?: (type: string, listener: () => void) => void;
  };
  /** Échecs cumulés avant lettre morte, même « transitoires ». */
  maxAttempts?: number;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
}

/**
 * ÉCRIRE HORS LIGNE — le port des notes, posé sur la file du socle.
 *
 * POURQUOI C'EST ICI ET PAS DANS L'ADAPTATEUR. La file ne sait rien de
 * Supabase : elle enfile des MUTATIONS et les rejoue vers le port qu'on lui
 * donne. C'est ce qui la rend vraie pour le prochain adaptateur — Firebase,
 * HTTP — sans une ligne de plus, et c'est pour cette raison que le port parle
 * en mutations depuis l'ADR 0004.
 *
 * CE QUE `add()` PROMET CHANGE, ET C'EST LE CŒUR DE LA DÉCISION. Avant, la
 * promesse rendue voulait dire « écrit » : le magasin restaurait l'état d'avant
 * si elle rejetait. Elle veut désormais dire **« accepté »** — la mutation est
 * dans une file persistante, elle partira. Sans ce changement, une écriture
 * hors ligne serait annulée à l'écran une seconde après avoir été faite, ce qui
 * est exactement ce qu'on cherche à éviter.
 *
 * CE QUI RESTE REFUSABLE. Une mutation que la base REJETTE (RLS, contrainte)
 * ne se rejoue pas indéfiniment : elle part en lettre morte au premier refus
 * durable, et l'instantané le DIT. Une file qui boucle sur un refus ne se
 * répare jamais toute seule, et personne ne le voit — c'est la panne que ce
 * module refuse d'avoir.
 *
 * LE LOCAL N'EN A PAS. Entre l'application et `localStorage` il n'y a pas de
 * réseau : une file n'y ajouterait qu'un délai et un moyen de perdre une note
 * au rechargement. `backend/index.ts` n'enveloppe donc que l'adaptateur
 * distant.
 */
export function createQueuedNotes(
  inner: NotesRepository,
  options: QueuedNotesOptions = {}
): QueuedNotes {
  const {
    prefix = 'mister-settle-sync-',
    isOnline = () => globalThis.navigator?.onLine !== false,
    env = globalThis,
    maxAttempts = 5,
    setTimeout: schedule,
    clearTimeout: unschedule,
  } = options;

  // L'instantané est un objet MÉMORISÉ, remplacé seulement quand il change.
  // `useSyncExternalStore` compare par identité : en construire un neuf à
  // chaque lecture ferait boucler le rendu — le piège du parc, déjà payé.
  let snapshot: SyncSnapshot = {
    status: isOnline() ? 'synced' : 'offline',
    pending: 0,
    dead: 0,
    lastError: null,
  };
  const listeners = new Set<() => void>();

  function publish(next: Partial<SyncSnapshot>) {
    const candidat: SyncSnapshot = { ...snapshot, ...next };
    candidat.status =
      candidat.dead > 0
        ? 'error'
        : !isOnline()
          ? 'offline'
          : candidat.pending > 0
            ? 'pending'
            : 'synced';
    if (
      candidat.status === snapshot.status &&
      candidat.pending === snapshot.pending &&
      candidat.dead === snapshot.dead &&
      candidat.lastError === snapshot.lastError
    ) {
      return;
    }
    snapshot = candidat;
    for (const listener of listeners) listener();
  }

  const queue = createSyncQueue<NoteMutation>({
    store: createStore(prefix),
    // Le transport, injecté : la file ne sait pas vers quoi elle rejoue.
    process: async mutation => {
      if (mutation.kind === 'add') await inner.add(mutation.note);
      else await inner.remove(mutation.id);
    },
    /**
     * UNE NOTE, UNE OPÉRATION EN ATTENTE. Ajoutée puis retirée hors ligne,
     * seule la seconde part : la suppression d'une ligne que le serveur n'a
     * jamais vue ne touche rien, et l'état final est le bon. Deux entrées
     * auraient envoyé une insertion qu'on s'apprête à défaire.
     */
    keyOf: mutation =>
      `note:${mutation.kind === 'add' ? mutation.note.id : mutation.id}`,
    /**
     * CE QUI NE SE REJOUE PAS. `classifyBackendError` du socle lit le message
     * des SDK et du navigateur : un refus de permission (RLS, session
     * expirée) ne réussira pas mieux la cinquième fois. Tout le reste est
     * réessayé — et `maxAttempts` borne même les échecs « transitoires », car
     * une erreur mal classée bloquerait la file pour toujours.
     */
    shouldRetry: error =>
      classifyBackendError(
        error instanceof Error ? error.message : String(error)
      ) !== 'permission',
    maxAttempts,
    isOnline,
    onDead: (entry, error) => {
      const message = error instanceof Error ? error.message : String(error);
      log.error('écriture refusée définitivement', {
        mutation: entry.payload,
        message,
      });
      publish({ lastError: message });
    },
    onChange: ({ pending, dead }) => publish({ pending, dead }),
    env,
    ...(schedule ? { setTimeout: schedule } : {}),
    ...(unschedule ? { clearTimeout: unschedule } : {}),
  });

  /** Le drain en cours — jamais attendu par `add`, observable par `drained`. */
  let drain: Promise<unknown> = Promise.resolve();

  /** Enfile, puis draine sans attendre : la promesse dit « accepté ». */
  function enfiler(mutation: NoteMutation): void {
    const entry = queue.enqueue(mutation);
    if (!entry) {
      // Refuser VISIBLEMENT vaut mieux que jeter en silence : le magasin
      // restaure l'état d'avant et porte l'erreur, comme pour tout refus.
      throw new Error('file de synchronisation pleine');
    }
    drain = queue.flush();
  }

  const notes: NotesRepository = {
    // La LECTURE n'est pas mise en file : elle n'a rien à rejouer. Hors ligne,
    // c'est le service worker qui répond, ou l'appel échoue et l'écran le dit.
    load: () => inner.load(),

    add: async note => enfiler({ kind: 'add', note }),
    remove: async id => enfiler({ kind: 'remove', id }),

    /**
     * `import` et `clear` REMPLACENT TOUT, et ne passent donc pas par la file.
     * Rejouer « efface tout » une heure plus tard emporterait ce qui a été
     * écrit entre-temps, ici ou sur un autre appareil — une file d'attente
     * n'est sûre que pour des gestes qui nomment leur ligne. Hors ligne, ces
     * deux-là échouent et le disent : c'est la bonne réponse.
     */
    clear: () => inner.clear(),
    export: () => inner.export(),
    import: json => inner.import(json),
  };

  const surReseau = () => publish({});
  const porte = env as {
    addEventListener?: (type: string, listener: () => void) => void;
    removeEventListener?: (type: string, listener: () => void) => void;
  };

  return {
    notes,
    queue,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    drained: async () => {
      await drain;
    },
    start() {
      // `online` est déjà écouté par la file (elle draine) ; ces deux-là ne
      // servent qu'à TEINTER l'indicateur, y compris quand il n'y a rien en
      // attente — dire « hors ligne » avant la première écriture perdue.
      porte.addEventListener?.('online', surReseau);
      porte.addEventListener?.('offline', surReseau);
      return queue.start();
    },
    stop() {
      porte.removeEventListener?.('online', surReseau);
      porte.removeEventListener?.('offline', surReseau);
      queue.stop();
    },
  };
}
