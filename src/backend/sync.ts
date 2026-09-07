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

export function createExpenseQueue(options: {
  save: (input: ExpenseInput) => Promise<SaveResult>;
  store: Store;
  isOnline?: () => boolean;
  onChange?: (status: { pending: number; dead: number }) => void;
  onDone?: (payload: QueuedExpense) => void;
}): SyncQueue<QueuedExpense> {
  return createSyncQueue<QueuedExpense>({
    store: options.store,
    queueKey: 'expense-queue',
    deadKey: 'expense-dead',
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
const DEAD_KEY = 'expense-dead';
let appStore: Store | null = null;
const storeOf = () => (appStore ??= createStore('settle-sync'));

/** La file de l'application, démarrée à la première demande. */
export function expenseQueue(): SyncQueue<QueuedExpense> {
  if (singleton) return singleton;
  const state = useSyncState.getState();
  singleton = createExpenseQueue({
    save: input => backend.expenses.save(input, null),
    store: storeOf(),
    onChange: status => useSyncState.getState().setQueue(status),
    onDone: () => useSyncState.getState().noteDone(),
  });
  state.setQueue({
    pending: singleton.pending(),
    dead: singleton.deadLetters().length,
  });
  void singleton.start();
  return singleton;
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
