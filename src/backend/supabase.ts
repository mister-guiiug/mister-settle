import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClientFactory } from '@mister-guiiug/dev-pwa-config/supabase-client';
import { createLogger } from '@mister-guiiug/dev-pwa-config/logger';
import { createUuid } from '@mister-guiiug/dev-pwa-config/id';
import {
  fromDecimalString,
  minorUnitOf,
  sharesFromDecimalString,
  sharesToDecimalString,
  toDecimalString,
} from '../domain/money.ts';
import {
  BackendError,
  expenseInputSchema,
  groupInputSchema,
  invitationInputSchema,
  participantInputSchema,
  settlementInputSchema,
  spaceInputSchema,
  spaceRoleSchema,
  type ActivityEntry,
  type Attachment,
  type Backend,
  type Category,
  type Expense,
  type Group,
  type Invitation,
  type Membership,
  type Participant,
  type Revision,
  type SaveResult,
  type Settlement,
  type Space,
} from './ports.ts';

const log = createLogger('supabase');

/**
 * LA FABRIQUE DU SOCLE, PAS UN `createClient` EN HAUT DE FICHIER.
 *
 * Elle est **paresseuse** : `@supabase/supabase-js` n'est chargé qu'au premier
 * appel réel. `flowType: 'pkce'` : la connexion par lien renvoie le code dans
 * la query, que le routeur ne touche pas (squelette, ADR 0007).
 */
export const supabase = createSupabaseClientFactory<SupabaseClient>({
  auth: { flowType: 'pkce' },
});

// ── Erreurs ────────────────────────────────────────────────────────────────

interface PgError {
  code?: string | null;
  message: string;
  details?: string | null;
}

/**
 * Les SQLSTATE des fonctions (0009) deviennent des codes de port. Une erreur
 * inconnue garde son message : il est plus utile qu'un « unknown » muet.
 */
export function translateError(error: PgError): BackendError {
  switch (error.code) {
    case 'ST409':
      return new BackendError('conflict', 'version périmée');
    case 'ST404':
    case 'PGRST116':
      return new BackendError('not-found', error.message);
    case 'ST410':
      return new BackendError('gone', error.message);
    case 'ST422':
      return new BackendError('invalid', error.message, error.message);
    case '42501':
      return new BackendError('forbidden', error.message);
    case '23505':
      return new BackendError('invalid', error.message, 'duplicate');
    case '23514':
      return new BackendError('invalid', error.message, 'foreign-participant');
    default:
      if (/fetch|network|Failed to fetch/i.test(error.message)) {
        return new BackendError('network', error.message);
      }
      return new BackendError('unknown', error.message);
  }
}

function fail(context: string, error: PgError): never {
  log.error(context, { code: error.code, message: error.message });
  throw translateError(error);
}

// ── Lignes de la base, et leur passage vers les ports ──────────────────────

const rowSpace = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  currency: z.string(),
  minor_unit: z.number(),
  icon: z.string(),
  color: z.string(),
  archived_at: z.string().nullable(),
  version: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

const rowParticipant = z.object({
  id: z.string(),
  space_id: z.string(),
  display_name: z.string(),
  initials: z.string(),
  avatar_color: z.string(),
  email: z.string().nullable().optional(),
  position: z.number(),
  archived_at: z.string().nullable(),
  version: z.number(),
});

const rowGroup = z.object({
  id: z.string(),
  space_id: z.string(),
  name: z.string(),
  color: z.string(),
  archived_at: z.string().nullable(),
  version: z.number(),
  participant_group_members: z
    .array(z.object({ participant_id: z.string() }))
    .default([]),
});

const rowCategory = z.object({
  id: z.string(),
  space_id: z.string().nullable(),
  parent_id: z.string().nullable(),
  key: z.string().nullable(),
  name: z.string(),
  icon: z.string(),
  position: z.number(),
  archived_at: z.string().nullable(),
});

const decimal = z.union([z.string(), z.number()]).transform(v => String(v));

const rowExpense = z.object({
  id: z.string(),
  space_id: z.string(),
  label: z.string(),
  amount: decimal,
  currency: z.string(),
  fx_rate: decimal.nullable(),
  spent_on: z.string(),
  category_id: z.string().nullable(),
  subcategory_id: z.string().nullable(),
  note: z.string(),
  split_method: z.enum(['equal', 'amount', 'shares']),
  selected_group_ids: z.array(z.string()).default([]),
  status: z.enum(['draft', 'validated', 'archived']),
  validated_at: z.string().nullable(),
  validated_by: z.string().nullable(),
  version: z.number(),
  created_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  expense_payers: z
    .array(z.object({ participant_id: z.string(), amount: decimal }))
    .default([]),
  expense_beneficiaries: z
    .array(
      z.object({
        participant_id: z.string(),
        via_group_id: z.string().nullable(),
        shares: decimal.nullable(),
        amount_input: decimal.nullable(),
        position: z.number(),
      })
    )
    .default([]),
  expense_allocations: z
    .array(z.object({ participant_id: z.string(), amount: decimal }))
    .default([]),
  expense_group_snapshots: z
    .array(
      z.object({
        group_id: z.string().nullable(),
        group_name: z.string(),
        member_participant_ids: z.array(z.string()),
      })
    )
    .default([]),
});

const rowSettlement = z.object({
  id: z.string(),
  space_id: z.string(),
  from_participant_id: z.string(),
  to_participant_id: z.string(),
  amount: decimal,
  currency: z.string(),
  settled_on: z.string(),
  note: z.string(),
  status: z.enum(['recorded', 'cancelled']),
  version: z.number(),
  created_by: z.string().nullable(),
  created_at: z.string(),
});

const rowInvitation = z.object({
  id: z.string(),
  space_id: z.string(),
  role: spaceRoleSchema,
  target_participant_id: z.string().nullable(),
  expires_at: z.string(),
  max_uses: z.number(),
  uses: z.number(),
  revoked_at: z.string().nullable(),
  created_at: z.string(),
});

const rowActivity = z.object({
  id: z.number(),
  space_id: z.string(),
  actor_user_id: z.string().nullable(),
  entity: z.string(),
  entity_id: z.string().nullable(),
  action: z.string(),
  payload: z.record(z.string(), z.unknown()).default({}),
  at: z.string(),
});

const rowRevision = z.object({
  id: z.string(),
  expense_id: z.string(),
  version: z.number(),
  snapshot: z.unknown(),
  changed_by: z.string().nullable(),
  changed_at: z.string(),
  reason: z.string(),
});

const rowAttachment = z.object({
  id: z.string(),
  space_id: z.string(),
  expense_id: z.string().nullable(),
  settlement_id: z.string().nullable(),
  storage_path: z.string(),
  mime: z.string(),
  bytes: z.number(),
  created_by: z.string().nullable(),
  created_at: z.string(),
});

const rowSaveResult = z.object({
  id: z.string(),
  version: z.number(),
  status: z.enum(['draft', 'validated', 'archived']),
});

/** Une chaîne décimale de la base, en entier — ou une erreur lisible. */
function toMinor(value: string, minorUnit: number, what: string): number {
  const minor = fromDecimalString(value, minorUnit);
  if (minor === null) {
    throw new BackendError(
      'unknown',
      `${what} : montant illisible « ${value} »`
    );
  }
  return minor;
}

function toShares(value: string | null): number | null {
  if (value === null) return null;
  const scaled = sharesFromDecimalString(value);
  if (scaled === null)
    throw new BackendError('unknown', `parts illisibles « ${value} »`);
  return scaled;
}

const FX_SCALE = 100_000_000;

export function mapExpense(
  row: z.infer<typeof rowExpense>,
  minorUnit: number
): Expense {
  return {
    id: row.id,
    spaceId: row.space_id,
    label: row.label,
    amount: toMinor(row.amount, minorUnit, 'dépense'),
    currency: row.currency,
    fxRateScaled:
      row.fx_rate === null ? null : Math.round(Number(row.fx_rate) * FX_SCALE),
    spentOn: row.spent_on,
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id,
    note: row.note,
    splitMethod: row.split_method,
    selectedGroupIds: row.selected_group_ids,
    status: row.status,
    validatedAt: row.validated_at,
    validatedBy: row.validated_by,
    validatedFingerprint: null,
    version: row.version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    payers: row.expense_payers.map(p => ({
      participantId: p.participant_id,
      amount: toMinor(p.amount, minorUnit, 'payeur'),
    })),
    beneficiaries: row.expense_beneficiaries.map(b => ({
      participantId: b.participant_id,
      viaGroupId: b.via_group_id,
      shares: toShares(b.shares),
      amountInput:
        b.amount_input === null
          ? null
          : toMinor(b.amount_input, minorUnit, 'bénéficiaire'),
      position: b.position,
    })),
    allocations: row.expense_allocations.map(a => ({
      participantId: a.participant_id,
      amount: toMinor(a.amount, minorUnit, 'allocation'),
    })),
    groupSnapshots: row.expense_group_snapshots.map(s => ({
      groupId: s.group_id,
      groupName: s.group_name,
      memberParticipantIds: s.member_participant_ids,
    })),
  };
}

function mapSettlement(
  row: z.infer<typeof rowSettlement>,
  minorUnit: number
): Settlement {
  return {
    id: row.id,
    spaceId: row.space_id,
    fromParticipantId: row.from_participant_id,
    toParticipantId: row.to_participant_id,
    amount: toMinor(row.amount, minorUnit, 'remboursement'),
    currency: row.currency,
    settledOn: row.settled_on,
    note: row.note,
    status: row.status,
    version: row.version,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

const EXPENSE_SELECT =
  '*, expense_payers(*), expense_beneficiaries(*), expense_allocations(*), expense_group_snapshots(*)';

/**
 * L'adaptateur Supabase — tables, vues et fonctions de 0006 à 0009.
 *
 * LA RLS FAIT LE FILTRAGE, PAS CE CODE. Aucune lecture ne porte de
 * `where user_id = …` : les politiques restreignent déjà les lignes aux
 * membres. Les écritures qui touchent plusieurs lignes ou qui calculent
 * passent par les fonctions (`create_space`, `save_expense`,
 * `validate_expense`…) ; les autres écrivent la table, avec `version` en
 * garde : une mise à jour qui ne trouve pas sa ligne a perdu la course.
 */
export function createSupabaseBackend(): Backend {
  const client = () => supabase.getClient();

  /** Les décimales de chaque espace, pour convertir sans relire l'espace. */
  const minorUnits = new Map<string, number>();
  const rememberMinorUnit = (spaceId: string, minorUnit: number) => {
    minorUnits.set(spaceId, minorUnit);
    return minorUnit;
  };
  const minorUnitFor = async (spaceId: string): Promise<number> => {
    const known = minorUnits.get(spaceId);
    if (known !== undefined) return known;
    const db = await client();
    const { data, error } = await db
      .from('expense_spaces')
      .select('minor_unit, currency')
      .eq('id', spaceId)
      .maybeSingle();
    if (error) fail('lecture de la devise', error);
    const parsed = z
      .object({ minor_unit: z.number(), currency: z.string() })
      .nullable()
      .parse(data);
    return rememberMinorUnit(
      spaceId,
      parsed ? parsed.minor_unit : minorUnitOf('EUR')
    );
  };

  const me = async (): Promise<string> => {
    const db = await client();
    const { data } = await db.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new BackendError('forbidden', 'session requise');
    return id;
  };

  const readSpace = async (id: string): Promise<Space | null> => {
    const db = await client();
    const [space, membership] = await Promise.all([
      db.from('expense_spaces').select('*').eq('id', id).maybeSingle(),
      db
        .from('space_memberships')
        .select('role')
        .eq('space_id', id)
        .eq('user_id', await me())
        .maybeSingle(),
    ]);
    if (space.error) fail('lecture d’un espace', space.error);
    if (membership.error) fail('lecture de l’adhésion', membership.error);
    const row = rowSpace.nullable().parse(space.data);
    if (!row) return null;
    const role = z
      .object({ role: spaceRoleSchema })
      .nullable()
      .parse(membership.data);
    rememberMinorUnit(row.id, row.minor_unit);
    return mapSpace(row, role?.role ?? null);
  };

  const mapSpace = (
    row: z.infer<typeof rowSpace>,
    myRole: Space['myRole']
  ): Space => ({
    id: row.id,
    name: row.name,
    description: row.description,
    currency: row.currency,
    minorUnit: row.minor_unit,
    icon: row.icon,
    color: row.color,
    archivedAt: row.archived_at,
    version: row.version,
    myRole,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  const mapParticipant = (
    row: z.infer<typeof rowParticipant>,
    linkedUserId: string | null
  ): Participant => ({
    id: row.id,
    spaceId: row.space_id,
    displayName: row.display_name,
    initials: row.initials,
    avatarColor: row.avatar_color,
    email: row.email ?? null,
    position: row.position,
    archivedAt: row.archived_at,
    version: row.version,
    linkedUserId,
  });

  const mapGroup = (row: z.infer<typeof rowGroup>): Group => ({
    id: row.id,
    spaceId: row.space_id,
    name: row.name,
    color: row.color,
    archivedAt: row.archived_at,
    version: row.version,
    memberIds: row.participant_group_members.map(m => m.participant_id),
  });

  const readParticipant = async (id: string): Promise<Participant> => {
    const db = await client();
    const { data, error } = await db
      .from('participants_public')
      .select('*')
      .eq('id', id)
      .single();
    if (error) fail('lecture d’une personne', error);
    const row = rowParticipant.parse(data);
    const { data: link } = await db
      .from('participant_user_links')
      .select('user_id')
      .eq('participant_id', id)
      .is('unlinked_at', null)
      .maybeSingle();
    const linked = z.object({ user_id: z.string() }).nullable().parse(link);
    return mapParticipant(row, linked?.user_id ?? null);
  };

  const readGroup = async (id: string): Promise<Group> => {
    const db = await client();
    const { data, error } = await db
      .from('participant_groups')
      .select('*, participant_group_members(participant_id)')
      .eq('id', id)
      .single();
    if (error) fail('lecture d’un regroupement', error);
    return mapGroup(rowGroup.parse(data));
  };

  return {
    spaces: {
      list: async () => {
        const db = await client();
        const { data, error } = await db
          .from('space_memberships')
          .select('role, expense_spaces(*)')
          .eq('user_id', await me());
        if (error) fail('liste des espaces', error);
        const rows = z
          .array(
            z.object({
              role: spaceRoleSchema,
              expense_spaces: rowSpace.nullable(),
            })
          )
          .parse(data);
        return rows
          .filter(
            (r): r is typeof r & { expense_spaces: z.infer<typeof rowSpace> } =>
              r.expense_spaces !== null
          )
          .map(r => {
            rememberMinorUnit(r.expense_spaces.id, r.expense_spaces.minor_unit);
            return mapSpace(r.expense_spaces, r.role);
          })
          .sort((a, b) => a.name.localeCompare(b.name));
      },
      get: readSpace,
      create: async raw => {
        const input = spaceInputSchema.parse(raw);
        const db = await client();
        const id = input.id ?? createUuid();
        const { error } = await db.rpc('create_space', {
          p_name: input.name,
          p_currency: input.currency,
          p_description: input.description,
          p_icon: input.icon,
          p_color: input.color,
          p_me_name: input.meName ?? null,
          p_id: id,
        });
        if (error) fail('création d’un espace', error);
        const space = await readSpace(id);
        if (!space)
          throw new BackendError('unknown', 'espace créé mais introuvable');
        return space;
      },
      update: async (id, patch, expectedVersion) => {
        const db = await client();
        const { data, error } = await db
          .from('expense_spaces')
          .update(patch)
          .eq('id', id)
          .eq('version', expectedVersion)
          .select('*')
          .maybeSingle();
        if (error) fail('mise à jour d’un espace', error);
        if (!data) throw new BackendError('conflict', 'version périmée');
        const space = await readSpace(id);
        if (!space) throw new BackendError('not-found', 'espace introuvable');
        return space;
      },
      archive: async (id, archived, expectedVersion) => {
        const db = await client();
        const { data, error } = await db
          .from('expense_spaces')
          .update({ archived_at: archived ? new Date().toISOString() : null })
          .eq('id', id)
          .eq('version', expectedVersion)
          .select('*')
          .maybeSingle();
        if (error) fail('archivage d’un espace', error);
        if (!data) throw new BackendError('conflict', 'version périmée');
        const space = await readSpace(id);
        if (!space) throw new BackendError('not-found', 'espace introuvable');
        return space;
      },
      remove: async id => {
        const db = await client();
        const { error } = await db.from('expense_spaces').delete().eq('id', id);
        if (error) fail('suppression d’un espace', error);
      },
      members: async spaceId => {
        const db = await client();
        const { data, error } = await db
          .from('space_memberships')
          .select('space_id, user_id, role, joined_at')
          .eq('space_id', spaceId);
        if (error) fail('membres d’un espace', error);
        const rows = z
          .array(
            z.object({
              space_id: z.string(),
              user_id: z.string(),
              role: spaceRoleSchema,
              joined_at: z.string(),
            })
          )
          .parse(data);
        const ids = rows.map(r => r.user_id);
        const { data: profiles } = ids.length
          ? await db.from('profiles').select('id, display_name').in('id', ids)
          : { data: [] };
        const names = new Map(
          z
            .array(
              z.object({ id: z.string(), display_name: z.string().nullable() })
            )
            .parse(profiles ?? [])
            .map(p => [p.id, p.display_name])
        );
        return rows.map((r): Membership => ({
          spaceId: r.space_id,
          userId: r.user_id,
          role: r.role,
          displayName: names.get(r.user_id) ?? null,
          joinedAt: r.joined_at,
        }));
      },
      updateMemberRole: async (spaceId, userId, role) => {
        const db = await client();
        const { error } = await db
          .from('space_memberships')
          .update({ role })
          .eq('space_id', spaceId)
          .eq('user_id', userId);
        if (error) fail('rôle d’un membre', error);
      },
      removeMember: async (spaceId, userId) => {
        const db = await client();
        const { error } = await db
          .from('space_memberships')
          .delete()
          .eq('space_id', spaceId)
          .eq('user_id', userId);
        if (error) fail('retrait d’un membre', error);
      },
      transferOwnership: async (spaceId, userId) => {
        const db = await client();
        const { error } = await db.rpc('transfer_space_ownership', {
          p_space: spaceId,
          p_new_owner: userId,
        });
        if (error) fail('transfert de propriété', error);
      },
    },

    participants: {
      list: async spaceId => {
        const db = await client();
        const { data, error } = await db
          .from('participants_public')
          .select('*')
          .eq('space_id', spaceId)
          .order('position')
          .order('id');
        if (error) fail('liste des personnes', error);
        const rows = z.array(rowParticipant).parse(data);
        const ids = rows.map(r => r.id);
        const { data: links } = ids.length
          ? await db
              .from('participant_user_links')
              .select('participant_id, user_id')
              .in('participant_id', ids)
              .is('unlinked_at', null)
          : { data: [] };
        const linked = new Map(
          z
            .array(
              z.object({ participant_id: z.string(), user_id: z.string() })
            )
            .parse(links ?? [])
            .map(l => [l.participant_id, l.user_id])
        );
        return rows.map(r => mapParticipant(r, linked.get(r.id) ?? null));
      },
      create: async raw => {
        const input = participantInputSchema.parse(raw);
        const db = await client();
        const id = input.id ?? createUuid();
        const { error } = await db.from('participants').insert({
          id,
          space_id: input.spaceId,
          display_name: input.displayName.trim(),
          initials: input.initials,
          avatar_color: input.avatarColor,
          email: input.email,
          ...(input.position !== undefined ? { position: input.position } : {}),
        });
        if (error) fail('création d’une personne', error);
        return readParticipant(id);
      },
      update: async (id, patch, expectedVersion) => {
        const db = await client();
        const { data, error } = await db
          .from('participants')
          .update({
            ...(patch.displayName !== undefined
              ? { display_name: patch.displayName.trim() }
              : {}),
            ...(patch.initials !== undefined
              ? { initials: patch.initials }
              : {}),
            ...(patch.avatarColor !== undefined
              ? { avatar_color: patch.avatarColor }
              : {}),
            ...(patch.email !== undefined ? { email: patch.email } : {}),
            ...(patch.position !== undefined
              ? { position: patch.position }
              : {}),
          })
          .eq('id', id)
          .eq('version', expectedVersion)
          .select('id')
          .maybeSingle();
        if (error) fail('mise à jour d’une personne', error);
        if (!data) throw new BackendError('conflict', 'version périmée');
        return readParticipant(id);
      },
      archive: async (id, archived, expectedVersion) => {
        const db = await client();
        const { data, error } = await db
          .from('participants')
          .update({ archived_at: archived ? new Date().toISOString() : null })
          .eq('id', id)
          .eq('version', expectedVersion)
          .select('id')
          .maybeSingle();
        if (error) fail('archivage d’une personne', error);
        if (!data) throw new BackendError('conflict', 'version périmée');
        return readParticipant(id);
      },
      link: async participantId => {
        const db = await client();
        const { error } = await db.rpc('link_participant', {
          p_participant: participantId,
        });
        if (error) fail('rattachement', error);
      },
      unlink: async participantId => {
        const db = await client();
        const { error } = await db.rpc('unlink_participant', {
          p_participant: participantId,
        });
        if (error) fail('détachement', error);
      },
    },

    groups: {
      list: async spaceId => {
        const db = await client();
        const { data, error } = await db
          .from('participant_groups')
          .select('*, participant_group_members(participant_id)')
          .eq('space_id', spaceId)
          .order('name');
        if (error) fail('liste des regroupements', error);
        return z.array(rowGroup).parse(data).map(mapGroup);
      },
      create: async raw => {
        const input = groupInputSchema.parse(raw);
        const db = await client();
        const id = input.id ?? createUuid();
        const { error } = await db.from('participant_groups').insert({
          id,
          space_id: input.spaceId,
          name: input.name.trim(),
          color: input.color,
        });
        if (error) fail('création d’un regroupement', error);
        if (input.memberIds.length) {
          const { error: membersError } = await db
            .from('participant_group_members')
            .insert(
              [...new Set(input.memberIds)].map(participant_id => ({
                group_id: id,
                participant_id,
              }))
            );
          if (membersError) fail('membres d’un regroupement', membersError);
        }
        return readGroup(id);
      },
      // Deux écritures, pas une transaction : un regroupement se compose en
      // quelques clics, et un échec entre les deux se voit à la relecture.
      update: async (id, patch, expectedVersion) => {
        const db = await client();
        const { data, error } = await db
          .from('participant_groups')
          .update({
            ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
            ...(patch.color !== undefined ? { color: patch.color } : {}),
          })
          .eq('id', id)
          .eq('version', expectedVersion)
          .select('id')
          .maybeSingle();
        if (error) fail('mise à jour d’un regroupement', error);
        if (!data) throw new BackendError('conflict', 'version périmée');
        if (patch.memberIds !== undefined) {
          const { error: cleared } = await db
            .from('participant_group_members')
            .delete()
            .eq('group_id', id);
          if (cleared) fail('membres d’un regroupement', cleared);
          if (patch.memberIds.length) {
            const { error: inserted } = await db
              .from('participant_group_members')
              .insert(
                [...new Set(patch.memberIds)].map(participant_id => ({
                  group_id: id,
                  participant_id,
                }))
              );
            if (inserted) fail('membres d’un regroupement', inserted);
          }
        }
        return readGroup(id);
      },
      archive: async (id, archived, expectedVersion) => {
        const db = await client();
        const { data, error } = await db
          .from('participant_groups')
          .update({ archived_at: archived ? new Date().toISOString() : null })
          .eq('id', id)
          .eq('version', expectedVersion)
          .select('id')
          .maybeSingle();
        if (error) fail('archivage d’un regroupement', error);
        if (!data) throw new BackendError('conflict', 'version périmée');
        return readGroup(id);
      },
      remove: async id => {
        const db = await client();
        const { error } = await db
          .from('participant_groups')
          .delete()
          .eq('id', id);
        if (error) fail('suppression d’un regroupement', error);
      },
    },

    categories: {
      list: async spaceId => {
        const db = await client();
        const { data, error } = await db
          .from('categories')
          .select('*')
          .or(`space_id.is.null,space_id.eq.${spaceId}`)
          .order('position');
        if (error) fail('liste des catégories', error);
        return z
          .array(rowCategory)
          .parse(data)
          .map((r): Category => ({
            id: r.id,
            spaceId: r.space_id,
            parentId: r.parent_id,
            key: r.key,
            name: r.name,
            icon: r.icon,
            position: r.position,
            archivedAt: r.archived_at,
          }));
      },
      create: async raw => {
        const input = z
          .object({
            id: z.string().optional(),
            spaceId: z.string(),
            parentId: z.string().nullable().default(null),
            name: z.string().min(1).max(60),
            icon: z.string().default(''),
            position: z.number().int().default(0),
          })
          .parse(raw);
        const db = await client();
        const id = input.id ?? createUuid();
        const { data, error } = await db
          .from('categories')
          .insert({
            id,
            space_id: input.spaceId,
            parent_id: input.parentId,
            name: input.name.trim(),
            icon: input.icon,
            position: input.position,
          })
          .select('*')
          .single();
        if (error) fail('création d’une catégorie', error);
        const r = rowCategory.parse(data);
        return {
          id: r.id,
          spaceId: r.space_id,
          parentId: r.parent_id,
          key: r.key,
          name: r.name,
          icon: r.icon,
          position: r.position,
          archivedAt: r.archived_at,
        };
      },
      archive: async (id, archived) => {
        const db = await client();
        const { error } = await db
          .from('categories')
          .update({ archived_at: archived ? new Date().toISOString() : null })
          .eq('id', id);
        if (error) fail('archivage d’une catégorie', error);
      },
    },

    expenses: {
      list: async (spaceId, filter) => {
        const db = await client();
        const minorUnit = await minorUnitFor(spaceId);
        let query = db
          .from('expenses')
          .select(EXPENSE_SELECT)
          .eq('space_id', spaceId);
        if (filter?.status && filter.status !== 'all')
          query = query.eq('status', filter.status);
        if (filter?.from) query = query.gte('spent_on', filter.from);
        if (filter?.to) query = query.lte('spent_on', filter.to);
        if (filter?.categoryId)
          query = query.or(
            `category_id.eq.${filter.categoryId},subcategory_id.eq.${filter.categoryId}`
          );
        const { data, error } = await query
          .order('spent_on', { ascending: false })
          .order('id', { ascending: false });
        if (error) fail('liste des dépenses', error);
        const expenses = z
          .array(rowExpense)
          .parse(data)
          .map(r => mapExpense(r, minorUnit));
        const q = filter?.query?.trim().toLowerCase();
        return expenses
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
              !q ||
              e.label.toLowerCase().includes(q) ||
              e.note.toLowerCase().includes(q)
          );
      },
      get: async id => {
        const db = await client();
        const { data, error } = await db
          .from('expenses')
          .select(EXPENSE_SELECT)
          .eq('id', id)
          .maybeSingle();
        if (error) fail('lecture d’une dépense', error);
        const row = rowExpense.nullable().parse(data);
        if (!row) return null;
        return mapExpense(row, await minorUnitFor(row.space_id));
      },
      save: async (raw, expectedVersion) => {
        const input = expenseInputSchema.parse(raw);
        const db = await client();
        const minorUnit = await minorUnitFor(input.spaceId);
        const payload = {
          id: input.id ?? createUuid(),
          space_id: input.spaceId,
          label: input.label,
          amount: toDecimalString(input.amount, minorUnit),
          currency: input.currency,
          fx_rate:
            input.fxRateScaled === null
              ? null
              : (input.fxRateScaled / FX_SCALE).toString(),
          spent_on: input.spentOn,
          category_id: input.categoryId,
          subcategory_id: input.subcategoryId,
          note: input.note,
          split_method: input.splitMethod,
          selected_group_ids: input.selectedGroupIds,
          payers: input.payers.map(p => ({
            participant_id: p.participantId,
            amount: toDecimalString(p.amount, minorUnit),
          })),
          beneficiaries: input.beneficiaries.map(b => ({
            participant_id: b.participantId,
            via_group_id: b.viaGroupId,
            shares: b.shares === null ? null : sharesToDecimalString(b.shares),
            amount_input:
              b.amountInput === null
                ? null
                : toDecimalString(b.amountInput, minorUnit),
            position: b.position,
          })),
        };
        const { data, error } = await db.rpc('save_expense', {
          p_expense: payload,
          p_expected_version: expectedVersion,
        });
        if (error) fail('enregistrement d’une dépense', error);
        return rowSaveResult.parse(data) satisfies SaveResult;
      },
      validate: async (id, expectedVersion) => {
        const db = await client();
        const { data, error } = await db.rpc('validate_expense', {
          p_expense_id: id,
          p_expected_version: expectedVersion,
        });
        if (error) fail('validation d’une dépense', error);
        return rowSaveResult.parse(data);
      },
      archive: async (id, archived, expectedVersion) => {
        const db = await client();
        const { data, error } = await db.rpc('archive_expense', {
          p_expense_id: id,
          p_archived: archived,
          p_expected_version: expectedVersion,
        });
        if (error) fail('archivage d’une dépense', error);
        return rowSaveResult.parse(data);
      },
      remove: async id => {
        const db = await client();
        const { error } = await db.from('expenses').delete().eq('id', id);
        if (error) fail('suppression d’une dépense', error);
      },
      revisions: async id => {
        const db = await client();
        const { data, error } = await db
          .from('expense_revisions')
          .select('*')
          .eq('expense_id', id)
          .order('version', { ascending: false });
        if (error) fail('révisions d’une dépense', error);
        return z
          .array(rowRevision)
          .parse(data)
          .map((r): Revision => ({
            id: r.id,
            expenseId: r.expense_id,
            version: r.version,
            snapshot: r.snapshot,
            changedBy: r.changed_by,
            changedAt: r.changed_at,
            reason: r.reason,
          }));
      },
    },

    settlements: {
      list: async spaceId => {
        const db = await client();
        const minorUnit = await minorUnitFor(spaceId);
        const { data, error } = await db
          .from('settlements')
          .select('*')
          .eq('space_id', spaceId)
          .order('settled_on', { ascending: false });
        if (error) fail('liste des remboursements', error);
        return z
          .array(rowSettlement)
          .parse(data)
          .map(r => mapSettlement(r, minorUnit));
      },
      record: async raw => {
        const input = settlementInputSchema.parse(raw);
        const db = await client();
        const minorUnit = await minorUnitFor(input.spaceId);
        const { data: spaceRow } = await db
          .from('expense_spaces')
          .select('currency')
          .eq('id', input.spaceId)
          .single();
        const currency = z
          .object({ currency: z.string() })
          .parse(spaceRow).currency;
        const id = input.id ?? createUuid();
        const { data, error } = await db
          .from('settlements')
          .insert({
            id,
            space_id: input.spaceId,
            from_participant_id: input.fromParticipantId,
            to_participant_id: input.toParticipantId,
            amount: toDecimalString(input.amount, minorUnit),
            currency,
            settled_on: input.settledOn,
            note: input.note,
            created_by: await me(),
          })
          .select('*')
          .single();
        if (error) fail('déclaration d’un remboursement', error);
        return mapSettlement(rowSettlement.parse(data), minorUnit);
      },
      cancel: async (id, expectedVersion) => {
        const db = await client();
        const { data, error } = await db
          .from('settlements')
          .update({ status: 'cancelled' })
          .eq('id', id)
          .eq('version', expectedVersion)
          .select('*')
          .maybeSingle();
        if (error) fail('annulation d’un remboursement', error);
        if (!data) throw new BackendError('conflict', 'version périmée');
        const row = rowSettlement.parse(data);
        return mapSettlement(row, await minorUnitFor(row.space_id));
      },
    },

    invitations: {
      list: async spaceId => {
        const db = await client();
        const { data, error } = await db
          .from('invitations')
          .select('*')
          .eq('space_id', spaceId)
          .order('created_at', { ascending: false });
        if (error) fail('liste des invitations', error);
        return z.array(rowInvitation).parse(data).map(mapInvitation);
      },
      create: async raw => {
        const input = invitationInputSchema.parse(raw);
        const db = await client();
        const { data, error } = await db.rpc('create_invitation', {
          p_space: input.spaceId,
          p_role: input.role,
          p_target: input.targetParticipantId,
          p_expires: `${input.expiresInDays} days`,
          p_max_uses: input.maxUses,
        });
        if (error) fail('création d’une invitation', error);
        const result = z
          .object({ id: z.string(), token: z.string(), expires_at: z.string() })
          .parse(data);
        const { data: row, error: readError } = await db
          .from('invitations')
          .select('*')
          .eq('id', result.id)
          .single();
        if (readError) fail('lecture d’une invitation', readError);
        return {
          invitation: mapInvitation(rowInvitation.parse(row)),
          token: result.token,
        };
      },
      revoke: async id => {
        const db = await client();
        const { error } = await db
          .from('invitations')
          .update({ revoked_at: new Date().toISOString() })
          .eq('id', id);
        if (error) fail('révocation d’une invitation', error);
      },
      accept: async (token, participantId) => {
        const db = await client();
        const { data, error } = await db.rpc('accept_invitation', {
          p_token: token,
          p_participant: participantId ?? null,
        });
        if (error) fail('acceptation d’une invitation', error);
        const result = z
          .object({
            space_id: z.string(),
            participant_id: z.string().nullable(),
            role: spaceRoleSchema,
          })
          .parse(data);
        return {
          spaceId: result.space_id,
          participantId: result.participant_id,
          role: result.role,
        };
      },
    },

    activity: {
      list: async (spaceId, limit = 50) => {
        const db = await client();
        const { data, error } = await db
          .from('activity_logs')
          .select('*')
          .eq('space_id', spaceId)
          .order('at', { ascending: false })
          .limit(limit);
        if (error) fail('journal d’activité', error);
        return z
          .array(rowActivity)
          .parse(data)
          .map((r): ActivityEntry => ({
            id: r.id,
            spaceId: r.space_id,
            actorUserId: r.actor_user_id,
            entity: r.entity,
            entityId: r.entity_id,
            action: r.action,
            payload: r.payload,
            at: r.at,
          }));
      },
    },

    attachments: {
      list: async parent => {
        const db = await client();
        let query = db.from('attachments').select('*');
        if (parent.expenseId) query = query.eq('expense_id', parent.expenseId);
        if (parent.settlementId)
          query = query.eq('settlement_id', parent.settlementId);
        const { data, error } = await query.order('created_at');
        if (error) fail('justificatifs', error);
        return z.array(rowAttachment).parse(data).map(mapAttachment);
      },
      upload: async (spaceId, parent, file, mime) => {
        const db = await client();
        const id = createUuid();
        const extension =
          mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
        const storagePath = `${spaceId}/${parent.expenseId ?? parent.settlementId ?? 'divers'}/${id}.${extension}`;
        const { error: uploadError } = await db.storage
          .from('receipts')
          .upload(storagePath, file, { contentType: mime });
        if (uploadError)
          fail('envoi d’un justificatif', { message: uploadError.message });
        const { data, error } = await db
          .from('attachments')
          .insert({
            id,
            space_id: spaceId,
            expense_id: parent.expenseId ?? null,
            settlement_id: parent.settlementId ?? null,
            storage_path: storagePath,
            mime,
            bytes: file.size,
            created_by: await me(),
          })
          .select('*')
          .single();
        if (error) fail('enregistrement d’un justificatif', error);
        return mapAttachment(rowAttachment.parse(data));
      },
      url: async attachment => {
        const db = await client();
        const { data, error } = await db.storage
          .from('receipts')
          .createSignedUrl(attachment.storagePath, 600);
        if (error || !data)
          fail('URL d’un justificatif', {
            message: error?.message ?? 'aucune URL',
          });
        return data.signedUrl;
      },
      remove: async id => {
        const db = await client();
        const { data } = await db
          .from('attachments')
          .select('storage_path')
          .eq('id', id)
          .maybeSingle();
        const row = z
          .object({ storage_path: z.string() })
          .nullable()
          .parse(data);
        if (row) await db.storage.from('receipts').remove([row.storage_path]);
        const { error } = await db.from('attachments').delete().eq('id', id);
        if (error) fail('suppression d’un justificatif', error);
      },
    },
  };
}

function mapInvitation(row: z.infer<typeof rowInvitation>): Invitation {
  return {
    id: row.id,
    spaceId: row.space_id,
    role: row.role,
    targetParticipantId: row.target_participant_id,
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    uses: row.uses,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

function mapAttachment(row: z.infer<typeof rowAttachment>): Attachment {
  return {
    id: row.id,
    spaceId: row.space_id,
    expenseId: row.expense_id,
    settlementId: row.settlement_id,
    storagePath: row.storage_path,
    mime: row.mime,
    bytes: row.bytes,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}
