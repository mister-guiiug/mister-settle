import { z } from 'zod';
import type { IdbStore } from '@mister-guiiug/dev-pwa-config/idb';
import {
  activityEntrySchema,
  attachmentSchema,
  categorySchema,
  expenseSchema,
  groupSchema,
  invitationSchema,
  isBackendError,
  participantSchema,
  settlementSchema,
  spaceSchema,
  type Backend,
} from './ports.ts';

/**
 * LA LECTURE HORS LIGNE (ADR 0015, 1) : chaque lecture garde sa dernière
 * réponse dans IndexedDB, et la ressert QUAND LE RÉSEAU MANQUE — jamais
 * autrement. Ce qui ressort de la cache est REVALIDÉ par les schémas du port
 * : une copie d'une autre version de l'application ne passe pas. L'écran
 * apprend qu'il lit une copie, et de quand (`onStale`).
 *
 * Les écritures ne passent pas par ici : elles échouent, ou attendent dans
 * la file (`sync.ts`) — jamais une copie.
 */

export interface CacheHooks {
  onStale: (at: string) => void;
  onFresh: () => void;
  isOnline: () => boolean;
}

interface Envelope {
  at: string;
  data: unknown;
}

function cached<Args extends unknown[], T>(
  idb: IdbStore,
  hooks: CacheHooks,
  keyOf: (...args: Args) => string,
  schema: z.ZodType<T>,
  read: (...args: Args) => Promise<T>
): (...args: Args) => Promise<T> {
  return async (...args) => {
    const key = keyOf(...args);
    try {
      const data = await read(...args);
      void idb.set(key, { at: new Date().toISOString(), data } as Envelope);
      hooks.onFresh();
      return data;
    } catch (cause) {
      const cut =
        !hooks.isOnline() ||
        (isBackendError(cause) && cause.code === 'network');
      if (!cut) throw cause;
      const envelope = await idb.get<Envelope>(key);
      if (!envelope) throw cause;
      const parsed = schema.safeParse(envelope.data);
      if (!parsed.success) throw cause;
      hooks.onStale(envelope.at);
      return parsed.data;
    }
  };
}

export function withReadCache(
  inner: Backend,
  idb: IdbStore,
  hooks: CacheHooks
): Backend {
  return {
    ...inner,
    spaces: {
      ...inner.spaces,
      list: cached(
        idb,
        hooks,
        () => 'spaces',
        z.array(spaceSchema),
        () => inner.spaces.list()
      ),
    },
    participants: {
      ...inner.participants,
      list: cached(
        idb,
        hooks,
        spaceId => `participants:${spaceId}`,
        z.array(participantSchema),
        spaceId => inner.participants.list(spaceId)
      ),
    },
    groups: {
      ...inner.groups,
      list: cached(
        idb,
        hooks,
        spaceId => `groups:${spaceId}`,
        z.array(groupSchema),
        spaceId => inner.groups.list(spaceId)
      ),
    },
    categories: {
      ...inner.categories,
      list: cached(
        idb,
        hooks,
        spaceId => `categories:${spaceId}`,
        z.array(categorySchema),
        spaceId => inner.categories.list(spaceId)
      ),
    },
    expenses: {
      ...inner.expenses,
      list: cached(
        idb,
        hooks,
        (spaceId, filter) =>
          `expenses:${spaceId}:${JSON.stringify(filter ?? {})}`,
        z.array(expenseSchema),
        (spaceId, filter) => inner.expenses.list(spaceId, filter)
      ),
      get: cached(
        idb,
        hooks,
        id => `expense:${id}`,
        expenseSchema.nullable(),
        id => inner.expenses.get(id)
      ),
    },
    settlements: {
      ...inner.settlements,
      list: cached(
        idb,
        hooks,
        spaceId => `settlements:${spaceId}`,
        z.array(settlementSchema),
        spaceId => inner.settlements.list(spaceId)
      ),
    },
    invitations: {
      ...inner.invitations,
      list: cached(
        idb,
        hooks,
        spaceId => `invitations:${spaceId}`,
        z.array(invitationSchema),
        spaceId => inner.invitations.list(spaceId)
      ),
    },
    activity: {
      list: cached(
        idb,
        hooks,
        (spaceId, limit) => `activity:${spaceId}:${limit ?? ''}`,
        z.array(activityEntrySchema),
        (spaceId, limit) => inner.activity.list(spaceId, limit)
      ),
    },
    attachments: {
      ...inner.attachments,
      list: cached(
        idb,
        hooks,
        parent =>
          `attachments:${parent.expenseId ?? ''}:${parent.settlementId ?? ''}`,
        z.array(attachmentSchema),
        parent => inner.attachments.list(parent)
      ),
    },
  };
}
