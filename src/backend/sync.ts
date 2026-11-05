import { createStore, type Store } from '@mister-guiiug/dev-pwa-config/storage';
import {
  createSyncQueue,
  type SyncQueue,
  type SyncQueueEntry,
} from '@mister-guiiug/dev-pwa-config/sync-queue';
import { backend } from './index.ts';
import { isBackendError, type ExpenseInput, type SaveResult } from './ports.ts';
import { useSyncState } from './sync-state.ts';

/**
 * LA FILE DES CRÉATIONS (ADR 0015, 3) : la création d'une dépense — et elle
 * seule — attend le réseau. Elle est idempotente par construction :
 * l'identifiant est engendré côté client et sert de clé primaire, un rejeu
 * n'insère pas deux fois. Une entrée que la base refuse durablement (RLS,
 * version, saisie) devient une LETTRE MORTE que l'écran explique, avec deux
 * issues : rouvrir dans l'assistant, ou abandonner.
 */

export interface QueuedExpense {
  /** L'entrée du port, avec son identifiant — la clé du rejeu. */
  input: ExpenseInput & { id: string };
  spaceId: string;
  label: string;
  /** Le formulaire tel qu'il était : pour rouvrir une lettre morte. */
  form: unknown;
}

/** Ne réessaie que ce que le réseau a empêché ; un refus est définitif. */
export function shouldRetry(error: unknown): boolean {
  return isBackendError(error) && error.code === 'network';
}

const QUEUE_KEY = 'expense-queue';
const DEAD_KEY = 'expense-dead';

export function createExpenseQueue(options: {
  save: (input: ExpenseInput) => Promise<SaveResult>;
  store: Store;
  isOnline?: () => boolean;
  onChange?: (status: { pending: number; dead: number }) => void;
  onDone?: (payload: QueuedExpense) => void;
}): SyncQueue<QueuedExpense> {
  return createSyncQueue<QueuedExpense>({
    store: options.store,
    queueKey: QUEUE_KEY,
    deadKey: DEAD_KEY,
    keyOf: payload => payload.input.id,
    shouldRetry: error => shouldRetry(error),
    maxAttempts: 8,
    process: async payload => {
      const result = await options.save(payload.input);
      options.onDone?.(payload);
      return result;
    },
    ...(options.isOnline ? { isOnline: options.isOnline } : {}),
    ...(options.onChange ? { onChange: options.onChange } : {}),
  });
}

let singleton: SyncQueue<QueuedExpense> | null = null;
let started = false;
let appStore: Store | null = null;
const storeOf = () => (appStore ??= createStore('settle-sync'));

/**
 * La file, créée à la première demande, et son état PUBLIÉ aussitôt — sans
 * rien envoyer : lire ce qui attend ne demande ni réseau ni session.
 */
function queueOf(): SyncQueue<QueuedExpense> {
  if (singleton) return singleton;
  singleton = createExpenseQueue({
    save: input => backend.expenses.save(input, null),
    store: storeOf(),
    onChange: status => useSyncState.getState().setQueue(status),
    onDone: () => useSyncState.getState().noteDone(),
  });
  useSyncState.getState().setQueue({
    pending: singleton.pending(),
    dead: singleton.deadLetters().length,
  });
  return singleton;
}

/** La file de l'application, démarrée à la première demande. */
export function expenseQueue(): SyncQueue<QueuedExpense> {
  const queue = queueOf();
  if (!started) {
    started = true;
    void queue.start();
  }
  return queue;
}

/**
 * LA FILE DÉMARRE AU LANCEMENT, pas au premier écran qui la demande.
 *
 * Elle n'était créée qu'au premier `expenseQueue()` — l'assistant, l'écran
 * de synchronisation. Relevé le 05/11/2026 : après un redémarrage, rien
 * n'était rejoué, et la pastille disait « synchronisé » (0 en attente) au-
 * dessus de dépenses qui n'étaient jamais parties.
 *
 * L'ÉTAT EST PUBLIÉ TOUT DE SUITE, L'ENVOI ATTEND LA SESSION. Sans elle, la
 * base refuse (RLS) et la file rangerait en lettres mortes des dépenses qui
 * n'avaient qu'à attendre la reconnexion.
 */
export function bootExpenseQueue(session: boolean): void {
  if (session) expenseQueue();
  else queueOf();
}

/**
 * Les créations en attente d'un espace : la liste des dépenses les montre.
 * Appelée PENDANT un rendu, elle ne crée pas la file — ce qui publierait son
 * état, donc mettrait à jour un autre composant en plein rendu : sans file
 * encore, elle lit le stockage, que la file relit de toute façon.
 */
export function queuedExpensesOf(
  spaceId: string
): SyncQueueEntry<QueuedExpense>[] {
  const entries = singleton
    ? singleton.list()
    : storeOf().get<SyncQueueEntry<QueuedExpense>[]>(QUEUE_KEY, []);
  return (Array.isArray(entries) ? entries : []).filter(
    entry => entry?.payload?.spaceId === spaceId
  );
}

/**
 * Ce qu'une purge jetterait : les créations en attente ET les refusées, qui
 * restent rejouables tant qu'on ne les abandonne pas.
 */
export function unsentExpenses(): number {
  const queue = queueOf();
  return queue.pending() + queue.deadLetters().length;
}

/**
 * VIDER LA FILE — déconnexion, suppression du compte. Elle vit sur
 * l'APPAREIL, pas dans la session : laissée là, elle repartirait sous la
 * session du compte suivant, avec ses droits. Arrêtée aussi, pour qu'une
 * session suivante la redémarre (et réécoute le retour du réseau).
 */
export function clearExpenseQueue(): void {
  const queue = queueOf();
  queue.stop();
  queue.clear();
  started = false;
}

/**
 * ABANDONNER UNE LETTRE MORTE, et elle seule. Le socle ne retire que de la
 * file d'attente (`remove`) ou redonne leur chance à TOUTES les lettres
 * mortes (`requeueDead`) : ici on retire une entrée de la liste des mortes,
 * sous la clé que la file a reçue, puis on redit l'état.
 */
export function dropDeadLetter(id: string): void {
  const store = storeOf();
  const dead = store.get<SyncQueueEntry<QueuedExpense>[]>(DEAD_KEY, []);
  store.set(
    DEAD_KEY,
    dead.filter(entry => entry.id !== id)
  );
  const queue = expenseQueue();
  useSyncState.getState().setQueue({
    pending: queue.pending(),
    dead: queue.deadLetters().length,
  });
}
