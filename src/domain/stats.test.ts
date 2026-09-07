import { describe, expect, it } from 'vitest';
import type { Expense } from '../backend/ports.ts';
import {
  percentOf,
  totalsByCategory,
  totalsByMonth,
  totalsByPerson,
  validatedTotal,
} from './stats.ts';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const CAT = '00000000-0000-4000-8000-0000000000c1';

const expense = (
  id: string,
  amount: number,
  spentOn: string,
  status: Expense['status'],
  categoryId: string | null,
  payer: string,
  allocations: Array<[string, number]>
): Expense => ({
  id: `00000000-0000-4000-8000-0000000000${id}`,
  spaceId: '00000000-0000-4000-8000-000000000001',
  label: id,
  amount,
  currency: 'EUR',
  fxRateScaled: null,
  spentOn,
  categoryId,
  subcategoryId: null,
  note: '',
  splitMethod: 'equal',
  selectedGroupIds: [],
  payers: [{ participantId: payer, amount }],
  beneficiaries: allocations.map(([participantId], position) => ({
    participantId,
    viaGroupId: null,
    shares: null,
    amountInput: null,
    position,
  })),
  status,
  validatedAt: status === 'validated' ? '2026-09-01T00:00:00.000Z' : null,
  validatedBy: null,
  validatedFingerprint: null,
  version: 1,
  createdBy: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  allocations: allocations.map(([participantId, a]) => ({
    participantId,
    amount: a,
  })),
  groupSnapshots: [],
});

const expenses = [
  expense('e1', 3000, '2026-09-01', 'validated', CAT, A, [
    [A, 1500],
    [B, 1500],
  ]),
  expense('e2', 1000, '2026-08-15', 'validated', null, B, [[A, 1000]]),
  expense('e3', 9999, '2026-09-02', 'draft', CAT, A, [[A, 9999]]),
];

describe('statistiques', () => {
  it('ne compte que les dépenses validées, par catégorie — « sans » en dernier', () => {
    expect(totalsByCategory(expenses)).toEqual([
      { categoryId: CAT, total: 3000, count: 1 },
      { categoryId: null, total: 1000, count: 1 },
    ]);
    expect(validatedTotal(expenses)).toBe(4000);
  });

  it('par mois, le plus récent d’abord', () => {
    expect(totalsByMonth(expenses)).toEqual([
      { month: '2026-09', total: 3000, count: 1 },
      { month: '2026-08', total: 1000, count: 1 },
    ]);
  });

  it('par personne : avancé, dû, et le nombre de dépenses où elle apparaît', () => {
    expect(totalsByPerson(expenses, [A, B])).toEqual([
      { participantId: A, paid: 3000, owed: 2500, count: 2 },
      { participantId: B, paid: 1000, owed: 1500, count: 2 },
    ]);
  });

  it('donne des pourcentages entiers, jamais NaN', () => {
    expect(percentOf(3000, 4000)).toBe(75);
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(0, 0)).toBe(0);
  });
});
