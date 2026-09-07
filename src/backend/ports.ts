import { z } from 'zod';

/**
 * LES PORTS — ce dont l'application a besoin, pas ce qu'un fournisseur sait
 * faire (ADR 0004). Deux adaptateurs les implémentent : le local (magasin
 * versionné, sans réseau) et Supabase (tables, vues, fonctions). Les écrans ne
 * connaissent que ceci.
 *
 * LES SCHÉMAS SERVENT DEUX FOIS : ils typent le code, et ils valident ce qui
 * remonte du stockage — une ligne écrite par une version antérieure, ou par
 * une autre main. Ce qui vient du réseau n'est pas plus sûr que ce qui vient
 * du disque (squelette, ADR 0002).
 *
 * LES MONTANTS SONT DES ENTIERS d'unités mineures (`Minor`, ADR 0011). C'est
 * l'adaptateur qui convertit depuis et vers la chaîne décimale de la base ;
 * aucun écran ne voit une chaîne « 12.50 ».
 */

export const spaceRoleSchema = z.enum([
  'owner',
  'admin',
  'contributor',
  'reader',
]);
export type SpaceRole = z.infer<typeof spaceRoleSchema>;

export const splitMethodSchema = z.enum(['equal', 'amount', 'shares']);
export type SplitMethod = z.infer<typeof splitMethodSchema>;

export const expenseStatusSchema = z.enum(['draft', 'validated', 'archived']);
export type ExpenseStatus = z.infer<typeof expenseStatusSchema>;

export const settlementStatusSchema = z.enum(['recorded', 'cancelled']);
export type SettlementStatus = z.infer<typeof settlementStatusSchema>;

const uuid = z.uuid();
const minor = z.number().int();
const isoDate = z.iso.date();
const timestamp = z.string().min(1);
const currency = z.string().regex(/^[A-Z]{3}$/);

// ── Espaces ────────────────────────────────────────────────────────────────

export const spaceSchema = z.object({
  id: uuid,
  name: z.string().min(1).max(80),
  description: z.string().max(500),
  currency,
  minorUnit: z.number().int().min(0).max(3),
  icon: z.string().max(8),
  color: z.string(),
  archivedAt: timestamp.nullable(),
  version: z.number().int(),
  /** Mon rôle dans cet espace ; `null` si la base ne l'a pas dit. */
  myRole: spaceRoleSchema.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Space = z.infer<typeof spaceSchema>;

export const spaceInputSchema = z.object({
  id: uuid.optional(),
  name: z.string().min(1).max(80),
  description: z.string().max(500).default(''),
  // Comme `create_space` en SQL : la casse est normalisée, pas refusée.
  currency: z
    .string()
    .regex(/^[A-Za-z]{3}$/)
    .transform(code => code.toUpperCase()),
  icon: z.string().max(8).default(''),
  color: z.string().default(''),
  /** Le nom de la personne que je suis dans cet espace. */
  meName: z.string().max(60).optional(),
});
export type SpaceInput = z.input<typeof spaceInputSchema>;

export const spacePatchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).optional(),
  icon: z.string().max(8).optional(),
  color: z.string().optional(),
});
export type SpacePatch = z.infer<typeof spacePatchSchema>;

export const membershipSchema = z.object({
  spaceId: uuid,
  userId: z.string().min(1),
  role: spaceRoleSchema,
  displayName: z.string().nullable(),
  joinedAt: timestamp,
});
export type Membership = z.infer<typeof membershipSchema>;

// ── Personnes ──────────────────────────────────────────────────────────────

export const participantSchema = z.object({
  id: uuid,
  spaceId: uuid,
  displayName: z.string().min(1).max(60),
  initials: z.string().max(3),
  avatarColor: z.string(),
  /** Rendu aux administrateurs seulement ; `null` sinon. */
  email: z.string().nullable(),
  position: z.number().int(),
  archivedAt: timestamp.nullable(),
  version: z.number().int(),
  /** Le compte rattaché, s'il y en a un. */
  linkedUserId: z.string().nullable(),
});
export type Participant = z.infer<typeof participantSchema>;

export const participantInputSchema = z.object({
  id: uuid.optional(),
  spaceId: uuid,
  displayName: z.string().min(1).max(60),
  initials: z.string().max(3).default(''),
  avatarColor: z.string().default(''),
  email: z.string().nullable().default(null),
  position: z.number().int().optional(),
});
export type ParticipantInput = z.input<typeof participantInputSchema>;

export const participantPatchSchema = z.object({
  displayName: z.string().min(1).max(60).optional(),
  initials: z.string().max(3).optional(),
  avatarColor: z.string().optional(),
  email: z.string().nullable().optional(),
  position: z.number().int().optional(),
});
export type ParticipantPatch = z.infer<typeof participantPatchSchema>;

// ── Regroupements ──────────────────────────────────────────────────────────

export const groupSchema = z.object({
  id: uuid,
  spaceId: uuid,
  name: z.string().min(1).max(60),
  color: z.string(),
  archivedAt: timestamp.nullable(),
  version: z.number().int(),
  memberIds: z.array(uuid),
});
export type Group = z.infer<typeof groupSchema>;

export const groupInputSchema = z.object({
  id: uuid.optional(),
  spaceId: uuid,
  name: z.string().min(1).max(60),
  color: z.string().default(''),
  memberIds: z.array(uuid).default([]),
});
export type GroupInput = z.input<typeof groupInputSchema>;

export const groupPatchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  color: z.string().optional(),
  memberIds: z.array(uuid).optional(),
});
export type GroupPatch = z.infer<typeof groupPatchSchema>;

// ── Catégories ─────────────────────────────────────────────────────────────

export const categorySchema = z.object({
  id: uuid,
  /** `null` : le catalogue commun. */
  spaceId: uuid.nullable(),
  parentId: uuid.nullable(),
  /** Clé de traduction du catalogue commun ; `null` pour une catégorie d'espace. */
  key: z.string().nullable(),
  name: z.string().min(1).max(60),
  icon: z.string(),
  position: z.number().int(),
  archivedAt: timestamp.nullable(),
});
export type Category = z.infer<typeof categorySchema>;

export const categoryInputSchema = z.object({
  id: uuid.optional(),
  spaceId: uuid,
  parentId: uuid.nullable().default(null),
  name: z.string().min(1).max(60),
  icon: z.string().default(''),
  position: z.number().int().default(0),
});
export type CategoryInput = z.input<typeof categoryInputSchema>;

// ── Dépenses ───────────────────────────────────────────────────────────────

export const payerLineSchema = z.object({
  participantId: uuid,
  amount: minor,
});
export type PayerLine = z.infer<typeof payerLineSchema>;

export const beneficiaryLineSchema = z.object({
  participantId: uuid,
  viaGroupId: uuid.nullable().default(null),
  /** Parts mises à l'échelle (`SHARES_SCALE`), modèle `shares`. */
  shares: z.number().int().nullable().default(null),
  /** Montant saisi, modèle `amount`. */
  amountInput: minor.nullable().default(null),
  position: z.number().int(),
});
export type BeneficiaryLine = z.infer<typeof beneficiaryLineSchema>;

export const allocationLineSchema = z.object({
  participantId: uuid,
  amount: minor,
});
export type AllocationLine = z.infer<typeof allocationLineSchema>;

export const groupSnapshotSchema = z.object({
  groupId: uuid.nullable(),
  groupName: z.string(),
  memberParticipantIds: z.array(uuid),
});
export type GroupSnapshot = z.infer<typeof groupSnapshotSchema>;

export const expenseInputSchema = z.object({
  id: uuid.optional(),
  spaceId: uuid,
  label: z.string().min(1).max(120),
  amount: minor,
  currency,
  /** Taux figé, ×10⁸ ; `null` dans la devise de l'espace. */
  fxRateScaled: z.number().int().nullable().default(null),
  spentOn: isoDate,
  categoryId: uuid.nullable().default(null),
  subcategoryId: uuid.nullable().default(null),
  note: z.string().max(2000).default(''),
  splitMethod: splitMethodSchema,
  selectedGroupIds: z.array(uuid).default([]),
  payers: z.array(payerLineSchema),
  beneficiaries: z.array(beneficiaryLineSchema),
});
export type ExpenseInput = z.input<typeof expenseInputSchema>;
export type ExpenseDraft = z.infer<typeof expenseInputSchema>;

export const expenseSchema = expenseInputSchema.required({ id: true }).extend({
  status: expenseStatusSchema,
  validatedAt: timestamp.nullable(),
  validatedBy: z.string().nullable(),
  /** Porté par l'adaptateur local ; Supabase le garde côté serveur. */
  validatedFingerprint: z.string().nullable().default(null),
  version: z.number().int(),
  createdBy: z.string().nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
  allocations: z.array(allocationLineSchema),
  groupSnapshots: z.array(groupSnapshotSchema),
});
export type Expense = z.infer<typeof expenseSchema>;

export const revisionSchema = z.object({
  id: uuid,
  expenseId: uuid,
  version: z.number().int(),
  snapshot: z.unknown(),
  changedBy: z.string().nullable(),
  changedAt: timestamp,
  reason: z.string(),
});
export type Revision = z.infer<typeof revisionSchema>;

export interface SaveResult {
  id: string;
  version: number;
  status: ExpenseStatus;
}

// ── Remboursements déclarés ────────────────────────────────────────────────

export const settlementSchema = z.object({
  id: uuid,
  spaceId: uuid,
  fromParticipantId: uuid,
  toParticipantId: uuid,
  amount: minor,
  currency,
  settledOn: isoDate,
  note: z.string().max(500),
  status: settlementStatusSchema,
  version: z.number().int(),
  createdBy: z.string().nullable(),
  createdAt: timestamp,
});
export type Settlement = z.infer<typeof settlementSchema>;

export const settlementInputSchema = z.object({
  id: uuid.optional(),
  spaceId: uuid,
  fromParticipantId: uuid,
  toParticipantId: uuid,
  amount: minor,
  settledOn: isoDate,
  note: z.string().max(500).default(''),
});
export type SettlementInput = z.input<typeof settlementInputSchema>;

// ── Invitations ────────────────────────────────────────────────────────────

export const invitationSchema = z.object({
  id: uuid,
  spaceId: uuid,
  role: spaceRoleSchema,
  targetParticipantId: uuid.nullable(),
  expiresAt: timestamp,
  maxUses: z.number().int(),
  uses: z.number().int(),
  revokedAt: timestamp.nullable(),
  createdAt: timestamp,
});
export type Invitation = z.infer<typeof invitationSchema>;

export const invitationInputSchema = z.object({
  spaceId: uuid,
  role: spaceRoleSchema.exclude(['owner']).default('contributor'),
  targetParticipantId: uuid.nullable().default(null),
  expiresInDays: z.number().int().min(1).max(90).default(7),
  maxUses: z.number().int().min(1).max(100).default(1),
});
export type InvitationInput = z.input<typeof invitationInputSchema>;

// ── Activité, justificatifs ────────────────────────────────────────────────

export const activityEntrySchema = z.object({
  id: z.number().int(),
  spaceId: uuid,
  actorUserId: z.string().nullable(),
  entity: z.string(),
  entityId: z.string().nullable(),
  action: z.string(),
  payload: z.record(z.string(), z.unknown()),
  at: timestamp,
});
export type ActivityEntry = z.infer<typeof activityEntrySchema>;

export const attachmentSchema = z.object({
  id: uuid,
  spaceId: uuid,
  expenseId: uuid.nullable(),
  settlementId: uuid.nullable(),
  storagePath: z.string(),
  mime: z.string(),
  bytes: z.number().int(),
  createdBy: z.string().nullable(),
  createdAt: timestamp,
});
export type Attachment = z.infer<typeof attachmentSchema>;

// ── Erreurs ────────────────────────────────────────────────────────────────

/**
 * Ce qu'un port sait dire d'un échec — un CODE stable, que l'écran traduit.
 * `conflict` : la version a bougé (ADR 0015) ; `invalid` : la saisie est
 * refusée, `detail` porte le motif (`payers-sum-mismatch`…) ; `local-mode` :
 * ce geste n'existe pas sans compte.
 */
export type BackendErrorCode =
  | 'conflict'
  | 'forbidden'
  | 'not-found'
  | 'invalid'
  | 'gone'
  | 'local-mode'
  | 'network'
  | 'unknown';

export class BackendError extends Error {
  constructor(
    readonly code: BackendErrorCode,
    message: string,
    readonly detail?: string
  ) {
    super(message);
    this.name = 'BackendError';
  }
}

export function isBackendError(
  error: unknown,
  code?: BackendErrorCode
): error is BackendError {
  return (
    error instanceof BackendError && (code === undefined || error.code === code)
  );
}

// ── Les ports ──────────────────────────────────────────────────────────────

export interface SpacesRepository {
  list(): Promise<Space[]>;
  get(id: string): Promise<Space | null>;
  create(input: SpaceInput): Promise<Space>;
  update(
    id: string,
    patch: SpacePatch,
    expectedVersion: number
  ): Promise<Space>;
  archive(
    id: string,
    archived: boolean,
    expectedVersion: number
  ): Promise<Space>;
  remove(id: string): Promise<void>;
  members(spaceId: string): Promise<Membership[]>;
  updateMemberRole(
    spaceId: string,
    userId: string,
    role: SpaceRole
  ): Promise<void>;
  removeMember(spaceId: string, userId: string): Promise<void>;
  transferOwnership(spaceId: string, userId: string): Promise<void>;
}

export interface ParticipantsRepository {
  list(spaceId: string): Promise<Participant[]>;
  create(input: ParticipantInput): Promise<Participant>;
  update(
    id: string,
    patch: ParticipantPatch,
    expectedVersion: number
  ): Promise<Participant>;
  archive(
    id: string,
    archived: boolean,
    expectedVersion: number
  ): Promise<Participant>;
  /** Me rattacher à cette personne. */
  link(participantId: string): Promise<void>;
  unlink(participantId: string): Promise<void>;
}

export interface GroupsRepository {
  list(spaceId: string): Promise<Group[]>;
  create(input: GroupInput): Promise<Group>;
  update(
    id: string,
    patch: GroupPatch,
    expectedVersion: number
  ): Promise<Group>;
  archive(
    id: string,
    archived: boolean,
    expectedVersion: number
  ): Promise<Group>;
  remove(id: string): Promise<void>;
}

export interface CategoriesRepository {
  /** Le catalogue commun, puis celles de l'espace. */
  list(spaceId: string): Promise<Category[]>;
  create(input: CategoryInput): Promise<Category>;
  archive(id: string, archived: boolean): Promise<void>;
}

export interface ExpenseFilter {
  status?: ExpenseStatus | 'all';
  participantId?: string;
  categoryId?: string;
  from?: string;
  to?: string;
  query?: string;
}

export interface ExpensesRepository {
  list(spaceId: string, filter?: ExpenseFilter): Promise<Expense[]>;
  get(id: string): Promise<Expense | null>;
  /** Enregistre la saisie ; décide du sort de la validation (ADR 0013). */
  save(
    input: ExpenseInput,
    expectedVersion: number | null
  ): Promise<SaveResult>;
  /** Recalcule, vérifie, valide. Lève `invalid` avec le motif. */
  validate(id: string, expectedVersion: number): Promise<SaveResult>;
  archive(
    id: string,
    archived: boolean,
    expectedVersion: number
  ): Promise<SaveResult>;
  /** Un brouillon seulement. */
  remove(id: string): Promise<void>;
  revisions(id: string): Promise<Revision[]>;
}

export interface SettlementsRepository {
  list(spaceId: string): Promise<Settlement[]>;
  record(input: SettlementInput): Promise<Settlement>;
  cancel(id: string, expectedVersion: number): Promise<Settlement>;
}

export interface InvitationsRepository {
  list(spaceId: string): Promise<Invitation[]>;
  /** Le jeton n'est rendu qu'ici, une fois. */
  create(
    input: InvitationInput
  ): Promise<{ invitation: Invitation; token: string }>;
  revoke(id: string): Promise<void>;
  accept(
    token: string,
    participantId?: string | null
  ): Promise<{
    spaceId: string;
    participantId: string | null;
    role: SpaceRole;
  }>;
}

export interface ActivityRepository {
  list(spaceId: string, limit?: number): Promise<ActivityEntry[]>;
}

export interface AttachmentsRepository {
  list(parent: {
    expenseId?: string;
    settlementId?: string;
  }): Promise<Attachment[]>;
  upload(
    spaceId: string,
    parent: { expenseId?: string; settlementId?: string },
    file: Blob,
    mime: string
  ): Promise<Attachment>;
  /** Une URL de consultation, courte. */
  url(attachment: Attachment): Promise<string>;
  remove(id: string): Promise<void>;
}

export interface Backend {
  spaces: SpacesRepository;
  participants: ParticipantsRepository;
  groups: GroupsRepository;
  categories: CategoriesRepository;
  expenses: ExpensesRepository;
  settlements: SettlementsRepository;
  invitations: InvitationsRepository;
  activity: ActivityRepository;
  attachments: AttachmentsRepository;
}
