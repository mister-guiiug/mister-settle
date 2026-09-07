import { describe, expect, it } from 'vitest';
import type { Expense } from '../backend/ports.ts';
import {
  addMember,
  allocationsOf,
  amountsGap,
  assignRemainder,
  beneficiaryLines,
  emptyForm,
  formFromExpense,
  impactOf,
  issuesOf,
  membersOf,
  payerLines,
  payersGap,
  removeMember,
  toPortInput,
  toggleGroupIn,
  type ExpenseForm,
  type FormContext,
} from './expense-form.ts';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';
const D = '00000000-0000-4000-8000-00000000000d';
const G = '00000000-0000-4000-8000-0000000000aa';
const SPACE = '00000000-0000-4000-8000-000000000001';

const ctx: FormContext = {
  orderedParticipantIds: [A, B, C],
  groups: [{ id: G, memberIds: [B, C] }],
  minorUnit: 2,
};

const fresh = () =>
  emptyForm({
    spaceId: SPACE,
    currency: 'EUR',
    today: '2026-09-07',
    payerId: A,
    participantIds: [A, B, C],
  });

describe('emptyForm', () => {
  it('part d’aujourd’hui, payée par moi, pour tout le monde, à parts égales', () => {
    const form = fresh();
    expect(form.spentOn).toBe('2026-09-07');
    expect(form.singlePayerId).toBe(A);
    expect(membersOf(form, ctx).map(m => m.participantId)).toEqual([A, B, C]);
    expect(form.splitMethod).toBe('equal');
  });
});

describe('payeurs', () => {
  it('un seul payeur porte le total', () => {
    const form = { ...fresh(), amountText: '30' };
    expect(payerLines(form, ctx)).toEqual([{ participantId: A, amount: 3000 }]);
    expect(payersGap(form, ctx)).toBe(0);
  });

  it('plusieurs payeurs : chacun sa part, et l’écart en direct', () => {
    const form = {
      ...fresh(),
      amountText: '30',
      payerMode: 'multi' as const,
      payerTexts: { [A]: '10', [B]: '12,5' },
    };
    expect(payerLines(form, ctx)).toEqual([
      { participantId: A, amount: 1000 },
      { participantId: B, amount: 1250 },
    ]);
    expect(payersGap(form, ctx)).toBe(750);
    expect(issuesOf(form, ctx)).toContainEqual({
      code: 'payers-sum-mismatch',
      severity: 'error',
      params: { difference: 750 },
    });
  });
});

describe('sélection', () => {
  it('retire une personne venue d’un regroupement, et la garde retirée', () => {
    let form = { ...fresh(), directIds: [A] };
    form = toggleGroupIn(form, ctx, G);
    expect(membersOf(form, ctx).map(m => m.participantId)).toEqual([A, B, C]);
    form = removeMember(form, ctx, C);
    expect(membersOf(form, ctx).map(m => m.participantId)).toEqual([A, B]);
    form = toggleGroupIn(form, ctx, G);
    form = toggleGroupIn(form, ctx, G);
    expect(membersOf(form, ctx).map(m => m.participantId)).toEqual([A, B]);
    form = addMember(form, ctx, C);
    expect(membersOf(form, ctx).map(m => m.participantId)).toEqual([A, B, C]);
  });

  it('compte une personne une seule fois, et note d’où elle vient', () => {
    const form = toggleGroupIn({ ...fresh(), directIds: [A, B] }, ctx, G);
    const lines = beneficiaryLines(form, ctx);
    expect(lines.map(l => l.participantId)).toEqual([A, B, C]);
    expect(lines[1]?.viaGroupId).toBe(G);
    expect(lines[0]?.viaGroupId).toBeNull();
  });
});

describe('répartition', () => {
  it('équitable : le reliquat aux premiers, dans l’ordre (R4)', () => {
    const form = { ...fresh(), amountText: '10' };
    expect(issuesOf(form, ctx).filter(i => i.severity === 'error')).toEqual([]);
    expect(allocationsOf(form, ctx)).toEqual([
      { participantId: A, amount: 334 },
      { participantId: B, amount: 333 },
      { participantId: C, amount: 333 },
    ]);
  });

  it('par montants : l’écart se voit, et se comble d’un geste (R5)', () => {
    let form: ExpenseForm = {
      ...fresh(),
      amountText: '10',
      splitMethod: 'amount' as const,
      amountTexts: { [A]: '5', [B]: '2' },
    };
    expect(amountsGap(form, ctx)).toBe(300);
    expect(issuesOf(form, ctx)).toContainEqual({
      code: 'amounts-sum-mismatch',
      severity: 'error',
      params: { difference: 300 },
    });
    form = assignRemainder(form, ctx, C);
    expect(form.amountTexts[C]).toBe('3.00');
    expect(amountsGap(form, ctx)).toBe(0);
    expect(allocationsOf(form, ctx)).toEqual([
      { participantId: A, amount: 500 },
      { participantId: B, amount: 200 },
      { participantId: C, amount: 300 },
    ]);
  });

  it('par parts : une part par défaut, et les plus forts restes (R6)', () => {
    const form = {
      ...fresh(),
      amountText: '100',
      splitMethod: 'shares' as const,
      sharesTexts: { [A]: '2' },
    };
    expect(beneficiaryLines(form, ctx).map(l => l.shares)).toEqual([
      20_000, 10_000, 10_000,
    ]);
    expect(allocationsOf(form, ctx)).toEqual([
      { participantId: A, amount: 5000 },
      { participantId: B, amount: 2500 },
      { participantId: C, amount: 2500 },
    ]);
  });
});

describe('impact', () => {
  it('le payeur remonte de ce que les autres lui doivent', () => {
    const form = { ...fresh(), amountText: '30' };
    expect(impactOf(form, ctx, [])).toEqual([
      { participantId: A, before: 0, after: 2000 },
      { participantId: B, before: 0, after: -1000 },
      { participantId: C, before: 0, after: -1000 },
    ]);
  });
});

describe('formFromExpense', () => {
  const expense: Expense = {
    id: '00000000-0000-4000-8000-0000000000e1',
    spaceId: SPACE,
    label: 'Restaurant',
    amount: 3000,
    currency: 'EUR',
    fxRateScaled: null,
    spentOn: '2026-09-01',
    categoryId: null,
    subcategoryId: null,
    note: '',
    splitMethod: 'equal',
    selectedGroupIds: [G],
    payers: [{ participantId: A, amount: 3000 }],
    beneficiaries: [
      {
        participantId: A,
        viaGroupId: null,
        shares: null,
        amountInput: null,
        position: 0,
      },
      {
        participantId: B,
        viaGroupId: G,
        shares: null,
        amountInput: null,
        position: 1,
      },
    ],
    status: 'validated',
    validatedAt: '2026-09-01T10:00:00.000Z',
    validatedBy: 'local',
    validatedFingerprint: 'x',
    version: 2,
    createdBy: 'local',
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    allocations: [
      { participantId: A, amount: 1500 },
      { participantId: B, amount: 1500 },
    ],
    groupSnapshots: [],
  };

  it('rouvre exactement ce qui a été enregistré, même si le regroupement a grossi', () => {
    // C est entré dans G depuis : il ne doit PAS apparaître en douce.
    const form = formFromExpense(expense, ctx);
    expect(form.id).toBe(expense.id);
    expect(form.amountText).toBe('30.00');
    expect(form.excludedIds).toEqual([C]);
    const input = toPortInput(form, ctx);
    expect(input.payers).toEqual(expense.payers);
    expect(input.beneficiaries).toEqual(expense.beneficiaries);
    expect(input.selectedGroupIds).toEqual([G]);
  });

  it('duplique sans identifiant, à la date du jour', () => {
    const form = formFromExpense(expense, ctx, {
      duplicate: true,
      today: '2026-09-07',
    });
    expect(form.id).toBeNull();
    expect(form.spentOn).toBe('2026-09-07');
    expect(form.label).toBe('Restaurant');
  });

  it('ignore une personne inconnue de l’espace dans la position', () => {
    const other: FormContext = { ...ctx, orderedParticipantIds: [A, B, D] };
    const form = formFromExpense(expense, other);
    expect(membersOf(form, other).map(m => m.participantId)).toEqual([A, B]);
  });
});
