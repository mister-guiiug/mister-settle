import { z } from 'zod';
import { createVersionedStore } from '@mister-guiiug/dev-pwa-config/versioned-store';
import { createIdb } from '@mister-guiiug/dev-pwa-config/idb';
import { createUuid } from '@mister-guiiug/dev-pwa-config/id';
import { minorUnitOf } from '../domain/money.ts';
import {
  calculationFingerprint,
  checkExpense,
  computeAllocations,
  hasBlockingIssue,
  type ExpenseInput as DomainExpenseInput,
} from '../domain/expense.ts';
import {
  BackendError,
  activityEntrySchema,
  attachmentSchema,
  categoryInputSchema,
  categorySchema,
  expenseInputSchema,
  expenseSchema,
  groupInputSchema,
  groupSchema,
  participantInputSchema,
  participantSchema,
  revisionSchema,
  settlementInputSchema,
  settlementSchema,
  spaceInputSchema,
  spaceSchema,
  type ActivityEntry,
  type Attachment,
  type Backend,
  type Expense,
  type Group,
  type Participant,
  type Revision,
  type SaveResult,
  type Settlement,
  type Space,
} from './ports.ts';

/**
 * L'ADAPTATEUR LOCAL : tout l'espace de dépenses sur l'appareil, sans compte.
 *
 * Un seul instantané versionné (`versioned-store` du socle) porte tous les
 * espaces : enveloppe `{ v, data }`, validation Zod à la relecture, copie de
 * côté avant toute perte possible. Les justificatifs, eux, sont des `Blob`
 * dans IndexedDB (`createIdb`) — le `localStorage` ne sait pas les tenir.
 *
 * IL FAIT CE QUE LA BASE FAIT. `save` et `validate` suivent exactement
 * `save_expense` et `validate_expense` (0009) : même empreinte de calcul qui
 * décide du sort de la validation, mêmes contrôles, mêmes allocations —
 * calculées par `src/domain`. Une dépense qui passe ici passera là-bas.
 *
 * SANS COMPTE, IL N'Y A QU'UNE PERSONNE : `LOCAL_USER_ID`, propriétaire de
 * tous les espaces de l'appareil. Les invitations n'existent pas ; elles
 * rendent `local-mode`, et l'écran le dit au lieu de les masquer.
 */

export const LOCAL_USER_ID = 'local';

const dbSchema = z.object({
  spaces: z.array(spaceSchema),
  participants: z.array(participantSchema),
  groups: z.array(groupSchema),
  categories: z.array(categorySchema),
  expenses: z.array(expenseSchema),
  revisions: z.array(revisionSchema),
  settlements: z.array(settlementSchema),
  activity: z.array(activityEntrySchema),
  attachments: z.array(attachmentSchema),
  /** Le nom que l'utilisateur se donne dans un nouvel espace. */
  meName: z.string().default('Moi'),
});
type LocalDb = z.infer<typeof dbSchema>;

const seed = (): LocalDb => ({
  spaces: [],
  participants: [],
  groups: [],
  categories: [],
  expenses: [],
  revisions: [],
  settlements: [],
  activity: [],
  attachments: [],
  meName: 'Moi',
});

/** Le magasin local — exporté pour les réglages (export, import, effacement). */
export const localDb = createVersionedStore<LocalDb>({
  store: 'mister-settle',
  key: 'db',
  version: 1,
  validate: data => dbSchema.parse(data),
  seed,
});

/** Les justificatifs, en `Blob`, à côté. */
export const localBlobs = createIdb('mister-settle');

/** Le catalogue commun, le même que `0006_espaces.sql`. */
export const COMMON_CATEGORIES: ReadonlyArray<{
  id: string;
  key: string;
  name: string;
  icon: string;
}> = [
  {
    id: 'a0000000-0000-4000-8000-000000000001',
    key: 'logement',
    name: 'Logement',
    icon: 'house',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000002',
    key: 'transport',
    name: 'Transport',
    icon: 'car',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000003',
    key: 'courses',
    name: 'Courses',
    icon: 'shopping-cart',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000004',
    key: 'restaurant',
    name: 'Restaurant',
    icon: 'utensils',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000005',
    key: 'loisirs',
    name: 'Loisirs',
    icon: 'ticket',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000006',
    key: 'sante',
    name: 'Santé',
    icon: 'heart-pulse',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000007',
    key: 'cadeaux',
    name: 'Cadeaux',
    icon: 'gift',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000008',
    key: 'autre',
    name: 'Autre',
    icon: 'tag',
  },
];

const now = () => new Date().toISOString();

function toDomainInput(expense: {
  amount: number;
  currency: string;
  fxRateScaled: number | null;
  splitMethod: 'equal' | 'amount' | 'shares';
  payers: ReadonlyArray<{ participantId: string; amount: number }>;
  beneficiaries: ReadonlyArray<{
    participantId: string;
    position: number;
    shares: number | null;
    amountInput: number | null;
    viaGroupId: string | null;
  }>;
  selectedGroupIds: readonly string[];
}): DomainExpenseInput {
  return {
    amount: expense.amount,
    currency: expense.currency,
    fxRateScaled: expense.fxRateScaled,
    method: expense.splitMethod,
    payers: expense.payers,
    beneficiaries: expense.beneficiaries.map(b => ({
      participantId: b.participantId,
      position: b.position,
      ...(b.amountInput !== null ? { amount: b.amountInput } : {}),
      ...(b.shares !== null ? { shares: b.shares } : {}),
      viaGroupIds: b.viaGroupId ? [b.viaGroupId] : [],
    })),
    selectedGroupIds: expense.selectedGroupIds,
  };
}

export function createLocalBackend(): Backend {
  const read = (): LocalDb => localDb.load();
  const write = (db: LocalDb) => {
    if (!localDb.save(db)) {
      throw new BackendError(
        'unknown',
        'le stockage local a refusé l’écriture'
      );
    }
  };

  /** Une écriture qui relit, modifie, réécrit — le local ne sait rien faire d'autre. */
  const mutate = <T>(fn: (db: LocalDb) => T): T => {
    const db = read();
    const result = fn(db);
    write(db);
    return result;
  };

  const log = (
    db: LocalDb,
    spaceId: string,
    entity: string,
    entityId: string | null,
    action: string,
    payload: Record<string, unknown> = {}
  ) => {
    const id = db.activity.reduce((max, a) => Math.max(max, a.id), 0) + 1;
    db.activity.push({
      id,
      spaceId,
      actorUserId: LOCAL_USER_ID,
      entity,
      entityId,
      action,
      payload,
      at: now(),
    });
  };

  const requireSpace = (db: LocalDb, spaceId: string): Space => {
    const space = db.spaces.find(s => s.id === spaceId);
    if (!space) throw new BackendError('not-found', 'espace introuvable');
    return space;
  };

  const checkVersion = (actual: number, expected: number) => {
    if (actual !== expected) {
      throw new BackendError('conflict', 'version périmée');
    }
  };

  const orderedParticipants = (db: LocalDb, spaceId: string) =>
    db.participants
      .filter(p => p.spaceId === spaceId)
      .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1));

  return {
    spaces: {
      list: async () => read().spaces.slice(),
      get: async id => read().spaces.find(s => s.id === id) ?? null,
      create: async raw => {
        const input = spaceInputSchema.parse(raw);
        return mutate(db => {
          const id = input.id ?? createUuid();
          const stamp = now();
          const space: Space = {
            id,
            name: input.name.trim(),
            description: input.description,
            currency: input.currency.toUpperCase(),
            minorUnit: minorUnitOf(input.currency),
            icon: input.icon,
            color: input.color,
            archivedAt: null,
            version: 1,
            myRole: 'owner',
            createdAt: stamp,
            updatedAt: stamp,
          };
          db.spaces.push(space);
          const meName = (input.meName ?? db.meName).trim() || 'Moi';
          db.participants.push({
            id: createUuid(),
            spaceId: id,
            displayName: meName.slice(0, 60),
            initials: '',
            avatarColor: '',
            email: null,
            position: 0,
            archivedAt: null,
            version: 1,
            linkedUserId: LOCAL_USER_ID,
          });
          log(db, id, 'expense_spaces', id, 'insert', { label: space.name });
          return space;
        });
      },
      update: async (id, patch, expectedVersion) =>
        mutate(db => {
          const space = requireSpace(db, id);
          checkVersion(space.version, expectedVersion);
          Object.assign(space, patch, {
            version: space.version + 1,
            updatedAt: now(),
          });
          log(db, id, 'expense_spaces', id, 'update', { label: space.name });
          return { ...space };
        }),
      archive: async (id, archived, expectedVersion) =>
        mutate(db => {
          const space = requireSpace(db, id);
          checkVersion(space.version, expectedVersion);
          space.archivedAt = archived ? now() : null;
          space.version += 1;
          space.updatedAt = now();
          log(
            db,
            id,
            'expense_spaces',
            id,
            archived ? 'archive' : 'unarchive',
            {
              label: space.name,
            }
          );
          return { ...space };
        }),
      remove: async id =>
        mutate(db => {
          db.spaces = db.spaces.filter(s => s.id !== id);
          db.participants = db.participants.filter(p => p.spaceId !== id);
          db.groups = db.groups.filter(g => g.spaceId !== id);
          db.categories = db.categories.filter(c => c.spaceId !== id);
          const gone = new Set(
            db.expenses.filter(e => e.spaceId === id).map(e => e.id)
          );
          db.expenses = db.expenses.filter(e => e.spaceId !== id);
          db.revisions = db.revisions.filter(r => !gone.has(r.expenseId));
          db.settlements = db.settlements.filter(s => s.spaceId !== id);
          db.activity = db.activity.filter(a => a.spaceId !== id);
          db.attachments = db.attachments.filter(a => a.spaceId !== id);
        }),
      members: async spaceId => {
        const space = read().spaces.find(s => s.id === spaceId);
        if (!space) return [];
        return [
          {
            spaceId,
            userId: LOCAL_USER_ID,
            role: 'owner',
            displayName: read().meName,
            joinedAt: space.createdAt,
          },
        ];
      },
      updateMemberRole: async () => {
        throw new BackendError('local-mode', 'pas de membres sans compte');
      },
      removeMember: async () => {
        throw new BackendError('local-mode', 'pas de membres sans compte');
      },
      transferOwnership: async () => {
        throw new BackendError('local-mode', 'pas de membres sans compte');
      },
    },

    participants: {
      list: async spaceId =>
        orderedParticipants(read(), spaceId).map(p => ({ ...p })),
      create: async raw => {
        const input = participantInputSchema.parse(raw);
        return mutate(db => {
          requireSpace(db, input.spaceId);
          const siblings = orderedParticipants(db, input.spaceId);
          const name = input.displayName.trim();
          if (
            siblings.some(
              p =>
                !p.archivedAt &&
                p.displayName.toLowerCase() === name.toLowerCase()
            )
          ) {
            throw new BackendError(
              'invalid',
              'nom déjà pris',
              'duplicate-name'
            );
          }
          const participant: Participant = {
            id: input.id ?? createUuid(),
            spaceId: input.spaceId,
            displayName: name,
            initials: input.initials,
            avatarColor: input.avatarColor,
            email: input.email,
            position:
              input.position ??
              siblings.reduce((max, p) => Math.max(max, p.position), -1) + 1,
            archivedAt: null,
            version: 1,
            linkedUserId: null,
          };
          db.participants.push(participant);
          log(db, input.spaceId, 'participants', participant.id, 'insert', {
            label: name,
          });
          return { ...participant };
        });
      },
      update: async (id, patch, expectedVersion) =>
        mutate(db => {
          const participant = db.participants.find(p => p.id === id);
          if (!participant)
            throw new BackendError('not-found', 'personne introuvable');
          checkVersion(participant.version, expectedVersion);
          Object.assign(participant, patch, {
            version: participant.version + 1,
          });
          log(db, participant.spaceId, 'participants', id, 'update', {
            label: participant.displayName,
          });
          return { ...participant };
        }),
      archive: async (id, archived, expectedVersion) =>
        mutate(db => {
          const participant = db.participants.find(p => p.id === id);
          if (!participant)
            throw new BackendError('not-found', 'personne introuvable');
          checkVersion(participant.version, expectedVersion);
          participant.archivedAt = archived ? now() : null;
          participant.version += 1;
          log(
            db,
            participant.spaceId,
            'participants',
            id,
            archived ? 'archive' : 'unarchive',
            {
              label: participant.displayName,
            }
          );
          return { ...participant };
        }),
      link: async participantId =>
        mutate(db => {
          const participant = db.participants.find(p => p.id === participantId);
          if (!participant)
            throw new BackendError('not-found', 'personne introuvable');
          if (
            participant.linkedUserId &&
            participant.linkedUserId !== LOCAL_USER_ID
          ) {
            throw new BackendError(
              'invalid',
              'personne déjà rattachée',
              'participant-linked'
            );
          }
          for (const p of db.participants) {
            if (
              p.spaceId === participant.spaceId &&
              p.linkedUserId === LOCAL_USER_ID
            ) {
              p.linkedUserId = null;
            }
          }
          participant.linkedUserId = LOCAL_USER_ID;
        }),
      unlink: async participantId =>
        mutate(db => {
          const participant = db.participants.find(p => p.id === participantId);
          if (participant) participant.linkedUserId = null;
        }),
    },

    groups: {
      list: async spaceId =>
        read()
          .groups.filter(g => g.spaceId === spaceId)
          .map(g => ({ ...g, memberIds: [...g.memberIds] })),
      create: async raw => {
        const input = groupInputSchema.parse(raw);
        return mutate(db => {
          requireSpace(db, input.spaceId);
          const known = new Set(
            db.participants
              .filter(p => p.spaceId === input.spaceId)
              .map(p => p.id)
          );
          if (input.memberIds.some(id => !known.has(id))) {
            throw new BackendError(
              'invalid',
              'membre d’un autre espace',
              'foreign-member'
            );
          }
          const group: Group = {
            id: input.id ?? createUuid(),
            spaceId: input.spaceId,
            name: input.name.trim(),
            color: input.color,
            archivedAt: null,
            version: 1,
            memberIds: [...new Set(input.memberIds)],
          };
          db.groups.push(group);
          log(db, input.spaceId, 'participant_groups', group.id, 'insert', {
            label: group.name,
          });
          return { ...group, memberIds: [...group.memberIds] };
        });
      },
      update: async (id, patch, expectedVersion) =>
        mutate(db => {
          const group = db.groups.find(g => g.id === id);
          if (!group)
            throw new BackendError('not-found', 'regroupement introuvable');
          checkVersion(group.version, expectedVersion);
          if (patch.name !== undefined) group.name = patch.name.trim();
          if (patch.color !== undefined) group.color = patch.color;
          if (patch.memberIds !== undefined)
            group.memberIds = [...new Set(patch.memberIds)];
          group.version += 1;
          log(db, group.spaceId, 'participant_groups', id, 'update', {
            label: group.name,
          });
          return { ...group, memberIds: [...group.memberIds] };
        }),
      archive: async (id, archived, expectedVersion) =>
        mutate(db => {
          const group = db.groups.find(g => g.id === id);
          if (!group)
            throw new BackendError('not-found', 'regroupement introuvable');
          checkVersion(group.version, expectedVersion);
          group.archivedAt = archived ? now() : null;
          group.version += 1;
          return { ...group, memberIds: [...group.memberIds] };
        }),
      // Supprimer un regroupement ne touche ni les personnes ni les dépenses :
      // la composition figée vit sur chaque dépense (ADR 0012).
      remove: async id =>
        mutate(db => {
          const group = db.groups.find(g => g.id === id);
          db.groups = db.groups.filter(g => g.id !== id);
          if (group)
            log(db, group.spaceId, 'participant_groups', id, 'delete', {
              label: group.name,
            });
        }),
    },

    categories: {
      list: async spaceId => [
        ...COMMON_CATEGORIES.map((c, index) => ({
          id: c.id,
          spaceId: null,
          parentId: null,
          key: c.key,
          name: c.name,
          icon: c.icon,
          position: index + 1,
          archivedAt: null,
        })),
        ...read().categories.filter(c => c.spaceId === spaceId),
      ],
      create: async raw => {
        const input = categoryInputSchema.parse(raw);
        return mutate(db => {
          requireSpace(db, input.spaceId);
          const category = {
            id: input.id ?? createUuid(),
            spaceId: input.spaceId,
            parentId: input.parentId,
            key: null,
            name: input.name.trim(),
            icon: input.icon,
            position: input.position,
            archivedAt: null,
          };
          db.categories.push(category);
          return { ...category };
        });
      },
      archive: async (id, archived) =>
        mutate(db => {
          const category = db.categories.find(c => c.id === id);
          if (category) category.archivedAt = archived ? now() : null;
        }),
    },

    expenses: {
      list: async (spaceId, filter) => {
        const query = filter?.query?.trim().toLowerCase();
        return read()
          .expenses.filter(e => e.spaceId === spaceId)
          .filter(
            e =>
              !filter?.status ||
              filter.status === 'all' ||
              e.status === filter.status
          )
          .filter(
            e =>
              !filter?.participantId ||
              e.payers.some(p => p.participantId === filter.participantId) ||
              e.beneficiaries.some(
                b => b.participantId === filter.participantId
              )
          )
          .filter(
            e =>
              !filter?.categoryId ||
              e.categoryId === filter.categoryId ||
              e.subcategoryId === filter.categoryId
          )
          .filter(e => !filter?.from || e.spentOn >= filter.from)
          .filter(e => !filter?.to || e.spentOn <= filter.to)
          .filter(
            e =>
              !query ||
              e.label.toLowerCase().includes(query) ||
              e.note.toLowerCase().includes(query)
          )
          .sort((a, b) =>
            a.spentOn < b.spentOn
              ? 1
              : a.spentOn > b.spentOn
                ? -1
                : a.id < b.id
                  ? 1
                  : -1
          )
          .map(e => structuredClone(e));
      },
      get: async id => {
        const expense = read().expenses.find(e => e.id === id);
        return expense ? structuredClone(expense) : null;
      },
      save: async (raw, expectedVersion) => {
        const input = expenseInputSchema.parse(raw);
        return mutate(db => {
          const space = requireSpace(db, input.spaceId);
          const known = new Set(
            db.participants.filter(p => p.spaceId === space.id).map(p => p.id)
          );
          for (const line of [...input.payers, ...input.beneficiaries]) {
            if (!known.has(line.participantId)) {
              throw new BackendError(
                'invalid',
                'personne d’un autre espace',
                'foreign-participant'
              );
            }
          }
          const id = input.id ?? createUuid();
          const existing = db.expenses.find(e => e.id === id);
          if (existing) {
            if (existing.spaceId !== space.id)
              throw new BackendError('forbidden', 'dépense d’un autre espace');
            if (existing.status === 'archived')
              throw new BackendError(
                'invalid',
                'dépense archivée',
                'expense-archived'
              );
            if (expectedVersion !== null)
              checkVersion(existing.version, expectedVersion);
          }
          const fingerprint = calculationFingerprint(toDomainInput(input));
          const keepsValidation =
            existing?.status === 'validated' &&
            existing.validatedFingerprint === fingerprint;
          const stamp = now();
          const next: Expense = {
            ...input,
            id,
            currency: input.currency.toUpperCase(),
            status: keepsValidation ? 'validated' : 'draft',
            validatedAt: keepsValidation
              ? (existing?.validatedAt ?? null)
              : null,
            validatedBy: keepsValidation
              ? (existing?.validatedBy ?? null)
              : null,
            validatedFingerprint: keepsValidation ? fingerprint : null,
            version: existing ? existing.version + 1 : 1,
            createdBy: existing?.createdBy ?? LOCAL_USER_ID,
            createdAt: existing?.createdAt ?? stamp,
            updatedAt: stamp,
            allocations: keepsValidation ? (existing?.allocations ?? []) : [],
            groupSnapshots: keepsValidation
              ? (existing?.groupSnapshots ?? [])
              : [],
          };
          if (existing) Object.assign(existing, next);
          else db.expenses.push(next);
          db.revisions.push({
            id: createUuid(),
            expenseId: id,
            version: next.version,
            snapshot: structuredClone(next),
            changedBy: LOCAL_USER_ID,
            changedAt: stamp,
            reason: existing ? 'saved' : 'created',
          });
          log(db, space.id, 'expenses', id, existing ? 'update' : 'insert', {
            label: next.label,
            amount: next.amount,
            status: next.status,
          });
          return {
            id,
            version: next.version,
            status: next.status,
          } satisfies SaveResult;
        });
      },
      validate: async (id, expectedVersion) =>
        mutate(db => {
          const expense = db.expenses.find(e => e.id === id);
          if (!expense)
            throw new BackendError('not-found', 'dépense introuvable');
          checkVersion(expense.version, expectedVersion);
          if (expense.status === 'archived')
            throw new BackendError(
              'invalid',
              'dépense archivée',
              'expense-archived'
            );
          const domainInput = toDomainInput(expense);
          const issues = checkExpense(domainInput);
          if (hasBlockingIssue(issues)) {
            const first = issues.find(i => i.severity === 'error');
            throw new BackendError(
              'invalid',
              first?.code ?? 'invalid',
              first?.code
            );
          }
          const allocations = computeAllocations(domainInput) ?? [];
          const usedGroupIds = new Set<string>([
            ...expense.selectedGroupIds,
            ...expense.beneficiaries
              .map(b => b.viaGroupId)
              .filter((g): g is string => g !== null),
          ]);
          const stamp = now();
          expense.allocations = allocations;
          expense.groupSnapshots = db.groups
            .filter(g => usedGroupIds.has(g.id))
            .map(g => ({
              groupId: g.id,
              groupName: g.name,
              memberParticipantIds: [...g.memberIds].sort(),
            }));
          expense.status = 'validated';
          expense.validatedAt = stamp;
          expense.validatedBy = LOCAL_USER_ID;
          expense.validatedFingerprint = calculationFingerprint(domainInput);
          expense.version += 1;
          expense.updatedAt = stamp;
          db.revisions.push({
            id: createUuid(),
            expenseId: id,
            version: expense.version,
            snapshot: structuredClone(expense),
            changedBy: LOCAL_USER_ID,
            changedAt: stamp,
            reason: 'validated',
          });
          log(db, expense.spaceId, 'expenses', id, 'validate', {
            label: expense.label,
            amount: expense.amount,
          });
          return {
            id,
            version: expense.version,
            status: expense.status,
          } satisfies SaveResult;
        }),
      archive: async (id, archived, expectedVersion) =>
        mutate(db => {
          const expense = db.expenses.find(e => e.id === id);
          if (!expense)
            throw new BackendError('not-found', 'dépense introuvable');
          checkVersion(expense.version, expectedVersion);
          expense.status = archived
            ? 'archived'
            : expense.validatedAt
              ? 'validated'
              : 'draft';
          expense.version += 1;
          expense.updatedAt = now();
          log(
            db,
            expense.spaceId,
            'expenses',
            id,
            archived ? 'archive' : 'unarchive',
            {
              label: expense.label,
            }
          );
          return {
            id,
            version: expense.version,
            status: expense.status,
          } satisfies SaveResult;
        }),
      remove: async id =>
        mutate(db => {
          const expense = db.expenses.find(e => e.id === id);
          if (!expense) return;
          if (expense.status !== 'draft') {
            throw new BackendError(
              'invalid',
              'seul un brouillon se supprime',
              'not-a-draft'
            );
          }
          db.expenses = db.expenses.filter(e => e.id !== id);
          db.revisions = db.revisions.filter(r => r.expenseId !== id);
          db.attachments = db.attachments.filter(a => a.expenseId !== id);
          log(db, expense.spaceId, 'expenses', id, 'delete', {
            label: expense.label,
          });
        }),
      revisions: async id =>
        read()
          .revisions.filter(r => r.expenseId === id)
          .sort((a, b) => b.version - a.version)
          .map((r): Revision => structuredClone(r)),
    },

    settlements: {
      list: async spaceId =>
        read()
          .settlements.filter(s => s.spaceId === spaceId)
          .sort((a, b) => (a.settledOn < b.settledOn ? 1 : -1))
          .map(s => ({ ...s })),
      record: async raw => {
        const input = settlementInputSchema.parse(raw);
        return mutate(db => {
          const space = requireSpace(db, input.spaceId);
          if (input.fromParticipantId === input.toParticipantId) {
            throw new BackendError(
              'invalid',
              'deux personnes différentes',
              'same-person'
            );
          }
          if (input.amount <= 0)
            throw new BackendError(
              'invalid',
              'montant positif',
              'amount-not-positive'
            );
          const settlement: Settlement = {
            id: input.id ?? createUuid(),
            spaceId: space.id,
            fromParticipantId: input.fromParticipantId,
            toParticipantId: input.toParticipantId,
            amount: input.amount,
            currency: space.currency,
            settledOn: input.settledOn,
            note: input.note,
            status: 'recorded',
            version: 1,
            createdBy: LOCAL_USER_ID,
            createdAt: now(),
          };
          db.settlements.push(settlement);
          log(db, space.id, 'settlements', settlement.id, 'insert', {
            amount: settlement.amount,
          });
          return { ...settlement };
        });
      },
      cancel: async (id, expectedVersion) =>
        mutate(db => {
          const settlement = db.settlements.find(s => s.id === id);
          if (!settlement)
            throw new BackendError('not-found', 'remboursement introuvable');
          checkVersion(settlement.version, expectedVersion);
          settlement.status = 'cancelled';
          settlement.version += 1;
          log(db, settlement.spaceId, 'settlements', id, 'update', {
            status: 'cancelled',
          });
          return { ...settlement };
        }),
    },

    invitations: {
      list: async () => [],
      create: async () => {
        throw new BackendError('local-mode', 'pas d’invitation sans compte');
      },
      revoke: async () => {
        throw new BackendError('local-mode', 'pas d’invitation sans compte');
      },
      accept: async () => {
        throw new BackendError('local-mode', 'pas d’invitation sans compte');
      },
    },

    activity: {
      list: async (spaceId, limit = 50) =>
        read()
          .activity.filter(a => a.spaceId === spaceId)
          .sort((a, b) => b.id - a.id)
          .slice(0, limit)
          .map((a): ActivityEntry => structuredClone(a)),
    },

    attachments: {
      list: async parent =>
        read()
          .attachments.filter(
            a =>
              (parent.expenseId !== undefined &&
                a.expenseId === parent.expenseId) ||
              (parent.settlementId !== undefined &&
                a.settlementId === parent.settlementId)
          )
          .map(a => ({ ...a })),
      upload: async (spaceId, parent, file, mime) => {
        const id = createUuid();
        const storagePath = `${spaceId}/${parent.expenseId ?? parent.settlementId ?? 'divers'}/${id}`;
        const stored = await localBlobs.setBlob(storagePath, file);
        if (!stored)
          throw new BackendError('unknown', 'IndexedDB a refusé le fichier');
        const attachment: Attachment = {
          id,
          spaceId,
          expenseId: parent.expenseId ?? null,
          settlementId: parent.settlementId ?? null,
          storagePath,
          mime,
          bytes: file.size,
          createdBy: LOCAL_USER_ID,
          createdAt: now(),
        };
        mutate(db => {
          db.attachments.push(attachment);
        });
        return { ...attachment };
      },
      url: async attachment => {
        const blob = await localBlobs.getBlob(attachment.storagePath);
        if (!blob)
          throw new BackendError('not-found', 'fichier absent de l’appareil');
        return URL.createObjectURL(blob);
      },
      remove: async id => {
        const attachment = read().attachments.find(a => a.id === id);
        if (attachment) await localBlobs.removeBlob(attachment.storagePath);
        mutate(db => {
          db.attachments = db.attachments.filter(a => a.id !== id);
        });
      },
    },
  };
}
