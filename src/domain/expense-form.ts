import type {
  BeneficiaryLine,
  Expense,
  ExpenseInput,
  PayerLine,
  SplitMethod,
} from '../backend/ports.ts';
import type { BalanceLine } from './balances.ts';
import {
  checkExpense,
  computeAllocations,
  previewImpact,
  type ExpenseInput as DomainExpenseInput,
  type Issue,
} from './expense.ts';
import {
  parseAmount,
  parseShares,
  sharesToDecimalString,
  toDecimalString,
  type Minor,
} from './money.ts';
import {
  addToSelection,
  removeFromSelection,
  resolveSelection,
  toggleGroup,
  type GroupForSelection,
  type ResolvedMember,
  type SelectionInput,
} from './selection.ts';
import type { Allocation } from './split.ts';

/**
 * LE FORMULAIRE D'UNE DÉPENSE, CÔTÉ DOMAINE. L'écran tient des TEXTES — ce
 * que l'utilisateur tape — et ce module les traduit en lignes du port, puis
 * en entrée du moteur : vérifications, allocations, impact. Rien ici ne
 * touche React ; tout se teste à froid, et l'adaptateur local partage la
 * même traduction des lignes vers le moteur (`expenseInputFromLines`).
 */

/** Les lignes telles que le port les écrit, vers l'entrée du moteur. */
export function expenseInputFromLines(expense: {
  amount: number;
  currency: string;
  fxRateScaled: number | null;
  splitMethod: SplitMethod;
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

export type PayerMode = 'single' | 'multi';

/** Ce que l'écran tient : des textes, des cases cochées, un modèle. */
export interface ExpenseForm {
  /** `null` : une dépense qui n'existe pas encore. */
  id: string | null;
  spaceId: string;
  label: string;
  amountText: string;
  currency: string;
  /** Date ISO (AAAA-MM-JJ). */
  spentOn: string;
  categoryId: string | null;
  subcategoryId: string | null;
  note: string;
  payerMode: PayerMode;
  singlePayerId: string | null;
  /** Mode « plusieurs payeurs » : le texte saisi par personne. */
  payerTexts: Record<string, string>;
  directIds: string[];
  selectedGroupIds: string[];
  excludedIds: string[];
  splitMethod: SplitMethod;
  /** Modèle « montants » : le texte saisi par personne. */
  amountTexts: Record<string, string>;
  /** Modèle « parts » : le texte saisi par personne ; absent = une part. */
  sharesTexts: Record<string, string>;
}

/** Ce que l'espace apporte : ses personnes actives dans l'ordre, ses regroupements, sa devise. */
export interface FormContext {
  orderedParticipantIds: readonly string[];
  groups: readonly GroupForSelection[];
  minorUnit: number;
}

/** Le résultat complet de la traduction du formulaire, prêt pour le port. */
export interface CompleteInput extends ExpenseInput {
  amount: Minor;
  currency: string;
  fxRateScaled: null;
  splitMethod: SplitMethod;
  selectedGroupIds: string[];
  payers: PayerLine[];
  beneficiaries: BeneficiaryLine[];
}

/** Une dépense neuve : aujourd'hui, payée par moi, pour tout le monde. */
export function emptyForm(init: {
  spaceId: string;
  currency: string;
  today: string;
  payerId: string | null;
  participantIds: readonly string[];
}): ExpenseForm {
  return {
    id: null,
    spaceId: init.spaceId,
    label: '',
    amountText: '',
    currency: init.currency,
    spentOn: init.today,
    categoryId: null,
    subcategoryId: null,
    note: '',
    payerMode: 'single',
    singlePayerId: init.payerId,
    payerTexts: {},
    directIds: [...init.participantIds],
    selectedGroupIds: [],
    excludedIds: [],
    splitMethod: 'equal',
    amountTexts: {},
    sharesTexts: {},
  };
}

/**
 * Une dépense existante, rouverte — ou dupliquée (sans identifiant, datée
 * d'aujourd'hui). CE QUI A ÉTÉ ENREGISTRÉ EST CE QU'ON REVOIT : un membre
 * entré depuis dans un regroupement sélectionné est exclu d'office, pour
 * que rouvrir sans rien changer ne change rien — ni la liste, ni
 * l'empreinte, ni la validation (ADR 0013).
 */
export function formFromExpense(
  expense: Expense,
  ctx: FormContext,
  options: { duplicate?: boolean; today?: string } = {}
): ExpenseForm {
  const duplicate = options.duplicate === true;
  const beneficiaryIds = new Set(
    expense.beneficiaries.map(b => b.participantId)
  );
  const selectedGroupIds = [...expense.selectedGroupIds];
  const excludedIds = [
    ...new Set(
      ctx.groups
        .filter(g => selectedGroupIds.includes(g.id))
        .flatMap(g => g.memberIds)
        .filter(id => !beneficiaryIds.has(id))
    ),
  ];
  const payerTexts: Record<string, string> = {};
  for (const payer of expense.payers) {
    payerTexts[payer.participantId] = toDecimalString(
      payer.amount,
      ctx.minorUnit
    );
  }
  const amountTexts: Record<string, string> = {};
  const sharesTexts: Record<string, string> = {};
  for (const line of expense.beneficiaries) {
    if (line.amountInput !== null) {
      amountTexts[line.participantId] = toDecimalString(
        line.amountInput,
        ctx.minorUnit
      );
    }
    if (line.shares !== null) {
      sharesTexts[line.participantId] = sharesToDecimalString(line.shares);
    }
  }
  return {
    id: duplicate ? null : expense.id,
    spaceId: expense.spaceId,
    label: expense.label,
    amountText: toDecimalString(expense.amount, ctx.minorUnit),
    currency: expense.currency,
    spentOn: duplicate ? (options.today ?? expense.spentOn) : expense.spentOn,
    categoryId: expense.categoryId,
    subcategoryId: expense.subcategoryId,
    note: expense.note,
    payerMode: expense.payers.length > 1 ? 'multi' : 'single',
    singlePayerId: expense.payers[0]?.participantId ?? null,
    payerTexts,
    directIds: expense.beneficiaries
      .filter(b => b.viaGroupId === null)
      .map(b => b.participantId),
    selectedGroupIds,
    excludedIds,
    splitMethod: expense.splitMethod,
    amountTexts,
    sharesTexts,
  };
}

/** Le total saisi, ou `null` quand le texte n'est pas un montant. */
export function totalOf(form: ExpenseForm, ctx: FormContext): Minor | null {
  return parseAmount(form.amountText, ctx.minorUnit);
}

const asSelection = (form: ExpenseForm, ctx: FormContext): SelectionInput => ({
  orderedParticipantIds: ctx.orderedParticipantIds,
  directIds: form.directIds,
  selectedGroupIds: form.selectedGroupIds,
  groups: ctx.groups,
  excludedIds: form.excludedIds,
});

const fromSelection = (
  form: ExpenseForm,
  selection: SelectionInput
): ExpenseForm => ({
  ...form,
  directIds: [...selection.directIds],
  selectedGroupIds: [...selection.selectedGroupIds],
  excludedIds: [...selection.excludedIds],
});

/** Les personnes RÉELLEMENT retenues : dédoublonnées, dans l'ordre (R7). */
export function membersOf(
  form: ExpenseForm,
  ctx: FormContext
): ResolvedMember[] {
  return resolveSelection(asSelection(form, ctx));
}

export function removeMember(
  form: ExpenseForm,
  ctx: FormContext,
  participantId: string
): ExpenseForm {
  return fromSelection(
    form,
    removeFromSelection(asSelection(form, ctx), participantId)
  );
}

export function addMember(
  form: ExpenseForm,
  ctx: FormContext,
  participantId: string
): ExpenseForm {
  return fromSelection(
    form,
    addToSelection(asSelection(form, ctx), participantId)
  );
}

export function toggleGroupIn(
  form: ExpenseForm,
  ctx: FormContext,
  groupId: string
): ExpenseForm {
  return fromSelection(form, toggleGroup(asSelection(form, ctx), groupId));
}

/** Les payeurs : un seul, pour le total ; ou chacun pour sa part saisie. */
export function payerLines(form: ExpenseForm, ctx: FormContext): PayerLine[] {
  const total = totalOf(form, ctx) ?? 0;
  if (form.payerMode === 'single') {
    return form.singlePayerId
      ? [{ participantId: form.singlePayerId, amount: total }]
      : [];
  }
  return ctx.orderedParticipantIds.flatMap(participantId => {
    const text = form.payerTexts[participantId];
    if (!text || !text.trim()) return [];
    return [{ participantId, amount: parseAmount(text, ctx.minorUnit) ?? 0 }];
  });
}

/**
 * Les bénéficiaires, une ligne par personne retenue. Un texte illisible
 * devient un montant nul ou des parts NaN : le moteur le signale, et rien
 * ne s'enregistre tant qu'il le signale.
 */
export function beneficiaryLines(
  form: ExpenseForm,
  ctx: FormContext
): BeneficiaryLine[] {
  return membersOf(form, ctx).map(member => ({
    participantId: member.participantId,
    viaGroupId: member.viaGroupIds[0] ?? null,
    shares:
      form.splitMethod === 'shares'
        ? (parseShares(form.sharesTexts[member.participantId] ?? '1') ??
          Number.NaN)
        : null,
    amountInput:
      form.splitMethod === 'amount'
        ? (parseAmount(
            form.amountTexts[member.participantId] ?? '',
            ctx.minorUnit
          ) ?? 0)
        : null,
    position: ctx.orderedParticipantIds.indexOf(member.participantId),
  }));
}

/** Tout le formulaire, traduit pour le port. */
export function toPortInput(
  form: ExpenseForm,
  ctx: FormContext
): CompleteInput {
  return {
    ...(form.id ? { id: form.id } : {}),
    spaceId: form.spaceId,
    label: form.label.trim(),
    amount: totalOf(form, ctx) ?? 0,
    currency: form.currency,
    fxRateScaled: null,
    spentOn: form.spentOn,
    categoryId: form.categoryId,
    subcategoryId: form.subcategoryId,
    note: form.note.trim(),
    splitMethod: form.splitMethod,
    selectedGroupIds: [...form.selectedGroupIds].sort(),
    payers: payerLines(form, ctx),
    beneficiaries: beneficiaryLines(form, ctx),
  };
}

export function issuesOf(form: ExpenseForm, ctx: FormContext): Issue[] {
  return checkExpense(expenseInputFromLines(toPortInput(form, ctx)));
}

export function allocationsOf(
  form: ExpenseForm,
  ctx: FormContext
): Allocation[] | null {
  return computeAllocations(expenseInputFromLines(toPortInput(form, ctx)));
}

/** Ce qui manque aux parts payées pour faire le total (négatif : trop). */
export function payersGap(form: ExpenseForm, ctx: FormContext): Minor {
  const total = totalOf(form, ctx) ?? 0;
  return total - payerLines(form, ctx).reduce((sum, p) => sum + p.amount, 0);
}

/** Ce qui reste à répartir en modèle « montants » (négatif : trop). */
export function amountsGap(form: ExpenseForm, ctx: FormContext): Minor {
  const total = totalOf(form, ctx) ?? 0;
  return (
    total -
    beneficiaryLines(form, ctx).reduce(
      (sum, b) => sum + (b.amountInput ?? 0),
      0
    )
  );
}

/** « Affecter le reliquat à … » (R5) : la personne absorbe l'écart. */
export function assignRemainder(
  form: ExpenseForm,
  ctx: FormContext,
  participantId: string
): ExpenseForm {
  const gap = amountsGap(form, ctx);
  if (gap === 0) return form;
  const current =
    parseAmount(form.amountTexts[participantId] ?? '', ctx.minorUnit) ?? 0;
  return {
    ...form,
    amountTexts: {
      ...form.amountTexts,
      [participantId]: toDecimalString(current + gap, ctx.minorUnit),
    },
  };
}

export interface ImpactLine {
  participantId: string;
  before: Minor;
  after: Minor;
}

/** L'impact prévisionnel sur les soldes : avant → après, par personne. */
export function impactOf(
  form: ExpenseForm,
  ctx: FormContext,
  balances: readonly BalanceLine[]
): ImpactLine[] {
  const allocations = allocationsOf(form, ctx);
  if (!allocations) return [];
  const before = new Map(balances.map(b => [b.participantId, b.net]));
  return previewImpact(payerLines(form, ctx), allocations).map(
    ({ participantId, delta }) => {
      const net = before.get(participantId) ?? 0;
      return { participantId, before: net, after: net + delta };
    }
  );
}
