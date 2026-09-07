import { isCurrencyCode, isMinor, type Minor } from './money.ts';
import {
  splitByAmount,
  splitByShares,
  splitEqual,
  type Allocation,
  type Party,
} from './split.ts';

/**
 * LE CŒUR D'UNE DÉPENSE, sans écran ni base : ce qu'on a saisi, ce qui en
 * découle, et ce qui empêche de valider.
 *
 * Deux sorties distinctes, et c'est important :
 *  - `checkExpense` rend des **problèmes** typés par un code stable, avec une
 *    gravité. Une erreur bloque la validation ; un avertissement s'affiche et
 *    laisse passer. L'écran traduit les codes, il ne les invente pas.
 *  - `computeAllocations` rend la répartition calculée, ou `null` tant qu'une
 *    erreur subsiste.
 *
 * `calculationFingerprint` est ce qui rend la validation OBLIGATOIRE tenable :
 * la validation porte sur une empreinte de tout ce qui influe sur le calcul.
 * Si l'empreinte change, la validation tombe — client et serveur appliquent
 * la même règle.
 */

export type SplitMethod = 'equal' | 'amount' | 'shares';

export interface PayerInput {
  participantId: string;
  amount: Minor;
}

export interface BeneficiaryInput extends Party {
  /** Modèle `amount` : le montant saisi pour cette personne. */
  amount?: Minor;
  /** Modèle `shares` : les parts mises à l'échelle. */
  shares?: number;
  /** Les regroupements par lesquels elle est entrée dans la sélection. */
  viaGroupIds?: readonly string[];
}

export interface ExpenseInput {
  amount: Minor;
  currency: string;
  /** Taux figé, mis à l'échelle 10⁸, quand la devise n'est pas celle de l'espace. `null` sinon. */
  fxRateScaled: number | null;
  method: SplitMethod;
  payers: readonly PayerInput[];
  beneficiaries: readonly BeneficiaryInput[];
  /** Identifiants des regroupements utilisés pour sélectionner, triés. */
  selectedGroupIds: readonly string[];
}

export type IssueSeverity = 'error' | 'warning';

export interface Issue {
  /** Code stable : c'est lui qu'on traduit et qu'on teste. */
  code:
    | 'amount-not-positive'
    | 'currency-invalid'
    | 'no-payer'
    | 'payer-amount-not-positive'
    | 'payer-duplicate'
    | 'payers-sum-mismatch'
    | 'no-beneficiary'
    | 'beneficiary-duplicate'
    | 'amounts-sum-mismatch'
    | 'amount-negative'
    | 'shares-negative'
    | 'shares-none-positive'
    | 'shares-invalid'
    | 'payer-not-beneficiary'
    | 'self-only';
  severity: IssueSeverity;
  /** Ce que le message a besoin de dire (l'écart, la personne…). */
  params?: Record<string, string | number>;
}

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id) && !out.includes(id)) out.push(id);
    seen.add(id);
  }
  return out;
}

/**
 * TOUS les problèmes, pas le premier : l'écran de synthèse les liste, et un
 * utilisateur qui en corrige un ne doit pas en découvrir un autre après.
 */
export function checkExpense(input: ExpenseInput): Issue[] {
  const issues: Issue[] = [];
  const error = (code: Issue['code'], params?: Issue['params']) =>
    issues.push({ code, severity: 'error', ...(params ? { params } : {}) });
  const warning = (code: Issue['code'], params?: Issue['params']) =>
    issues.push({ code, severity: 'warning', ...(params ? { params } : {}) });

  if (!isMinor(input.amount) || input.amount <= 0) error('amount-not-positive');
  if (!isCurrencyCode(input.currency)) error('currency-invalid');

  // Payeurs.
  if (input.payers.length === 0) error('no-payer');
  for (const payer of input.payers) {
    if (!isMinor(payer.amount) || payer.amount <= 0) {
      error('payer-amount-not-positive', {
        participantId: payer.participantId,
      });
    }
  }
  for (const id of duplicates(input.payers.map(p => p.participantId))) {
    error('payer-duplicate', { participantId: id });
  }
  const paid = input.payers.reduce(
    (sum, p) => sum + (isMinor(p.amount) ? p.amount : 0),
    0
  );
  if (
    input.payers.length > 0 &&
    isMinor(input.amount) &&
    paid !== input.amount
  ) {
    error('payers-sum-mismatch', { difference: input.amount - paid });
  }

  // Bénéficiaires.
  if (input.beneficiaries.length === 0) error('no-beneficiary');
  for (const id of duplicates(input.beneficiaries.map(b => b.participantId))) {
    error('beneficiary-duplicate', { participantId: id });
  }

  if (input.method === 'amount') {
    let sum = 0;
    for (const b of input.beneficiaries) {
      const amount = b.amount ?? 0;
      if (!isMinor(amount) || amount < 0) {
        error('amount-negative', { participantId: b.participantId });
      } else {
        sum += amount;
      }
    }
    if (
      isMinor(input.amount) &&
      input.beneficiaries.length > 0 &&
      sum !== input.amount
    ) {
      error('amounts-sum-mismatch', { difference: input.amount - sum });
    }
  }

  if (input.method === 'shares') {
    let positive = 0;
    for (const b of input.beneficiaries) {
      const shares = b.shares ?? 0;
      if (!Number.isSafeInteger(shares)) {
        error('shares-invalid', { participantId: b.participantId });
      } else if (shares < 0) {
        error('shares-negative', { participantId: b.participantId });
      } else if (shares > 0) {
        positive += 1;
      }
    }
    if (input.beneficiaries.length > 0 && positive === 0) {
      error('shares-none-positive');
    }
  }

  // Avertissements : rien ne bloque, mais on le dit.
  const beneficiaryIds = new Set(input.beneficiaries.map(b => b.participantId));
  for (const payer of input.payers) {
    if (!beneficiaryIds.has(payer.participantId)) {
      warning('payer-not-beneficiary', { participantId: payer.participantId });
    }
  }
  if (
    input.beneficiaries.length === 1 &&
    input.payers.length === 1 &&
    input.payers[0]?.participantId === input.beneficiaries[0]?.participantId
  ) {
    warning('self-only');
  }

  return issues;
}

export function hasBlockingIssue(issues: readonly Issue[]): boolean {
  return issues.some(issue => issue.severity === 'error');
}

/**
 * La répartition calculée, ou `null` tant qu'une erreur bloque. Les
 * avertissements ne l'empêchent pas : c'est leur définition.
 */
export function computeAllocations(input: ExpenseInput): Allocation[] | null {
  if (hasBlockingIssue(checkExpense(input))) return null;
  switch (input.method) {
    case 'equal':
      return splitEqual(input.amount, input.beneficiaries);
    case 'amount':
      return splitByAmount(
        input.amount,
        input.beneficiaries.map(b => ({ ...b, amount: b.amount ?? 0 }))
      ).allocations;
    case 'shares':
      return splitByShares(
        input.amount,
        input.beneficiaries.map(b => ({ ...b, shares: b.shares ?? 0 }))
      );
  }
}

/**
 * L'EMPREINTE DU CALCUL. Tout ce qui, s'il change, doit faire retomber la
 * validation : montant, devise, taux, modèle, payeurs, bénéficiaires et leurs
 * saisies, regroupements utilisés. Rien d'autre — renommer le libellé ou
 * changer la note ne remet pas une répartition en cause.
 *
 * Forme canonique (listes triées par identifiant) : deux saisies équivalentes
 * ont la même empreinte quel que soit l'ordre des clics.
 */
export function calculationFingerprint(input: ExpenseInput): string {
  const byId = <T extends { participantId: string }>(items: readonly T[]) =>
    [...items].sort((a, b) =>
      a.participantId < b.participantId
        ? -1
        : a.participantId > b.participantId
          ? 1
          : 0
    );
  const canonical = {
    amount: input.amount,
    currency: input.currency,
    fx: input.fxRateScaled,
    method: input.method,
    payers: byId(input.payers).map(p => [p.participantId, p.amount]),
    beneficiaries: byId(input.beneficiaries).map(b => [
      b.participantId,
      input.method === 'amount' ? (b.amount ?? 0) : null,
      input.method === 'shares' ? (b.shares ?? 0) : null,
    ]),
    groups: [...input.selectedGroupIds].sort(),
  };
  return JSON.stringify(canonical);
}

export type ExpenseStatus = 'draft' | 'validated' | 'archived';

/**
 * Une validation ne tient que si l'empreinte validée est celle de la saisie
 * courante. C'est la règle R10, sous sa forme la plus simple à tester.
 */
export function isValidationCurrent(
  validatedFingerprint: string | null,
  input: ExpenseInput
): boolean {
  return (
    validatedFingerprint !== null &&
    validatedFingerprint === calculationFingerprint(input)
  );
}

/**
 * L'IMPACT PRÉVISIONNEL : ce qu'une dépense ferait aux soldes, personne par
 * personne — payé moins dû. C'est ce que l'écran de synthèse montre avant le
 * bouton, et c'est une somme nulle par construction.
 */
export function previewImpact(
  payers: readonly PayerInput[],
  allocations: readonly Allocation[]
): Array<{ participantId: string; delta: Minor }> {
  const deltas = new Map<string, number>();
  for (const p of payers) {
    deltas.set(p.participantId, (deltas.get(p.participantId) ?? 0) + p.amount);
  }
  for (const a of allocations) {
    deltas.set(a.participantId, (deltas.get(a.participantId) ?? 0) - a.amount);
  }
  return [...deltas.entries()]
    .map(([participantId, delta]) => ({ participantId, delta }))
    .sort((a, b) => (a.participantId < b.participantId ? -1 : 1));
}
