import { describe, expect, it } from 'vitest';
import { toCsv } from '@mister-guiiug/dev-pwa-config/csv';
import type { Expense } from '../backend/ports.ts';
import { balanceRows, expenseRows, fileSlug, groupRows } from './exports.ts';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const G = '00000000-0000-4000-8000-0000000000aa';

const restaurant: Expense = {
  id: '00000000-0000-4000-8000-0000000000e1',
  spaceId: '00000000-0000-4000-8000-000000000001',
  label: 'Restaurant "Chez Lou"',
  amount: 3050,
  currency: 'EUR',
  fxRateScaled: null,
  spentOn: '2026-09-01',
  categoryId: null,
  subcategoryId: null,
  note: '',
  splitMethod: 'equal',
  selectedGroupIds: [],
  payers: [{ participantId: A, amount: 3050 }],
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
      viaGroupId: null,
      shares: null,
      amountInput: null,
      position: 1,
    },
  ],
  status: 'validated',
  validatedAt: '2026-09-01T10:00:00.000Z',
  validatedBy: null,
  validatedFingerprint: null,
  version: 2,
  createdBy: null,
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
  allocations: [
    { participantId: A, amount: 1525 },
    { participantId: B, amount: 1525 },
  ],
  groupSnapshots: [],
};

const names: Record<string, string> = { [A]: 'Alice', [B]: 'Bob' };
const labels = {
  nameOf: (id: string) => names[id] ?? '?',
  categoryOf: (id: string | null) => (id === null ? 'Sans catégorie' : id),
  statusOf: (status: Expense['status']) =>
    status === 'validated' ? 'Validée' : status,
};

describe('exports', () => {
  it('aplatit une dépense, parts en clair, montants d’affichage', () => {
    const [row] = expenseRows([restaurant], 2, labels);
    expect(row).toEqual({
      date: '2026-09-01',
      label: 'Restaurant "Chez Lou"',
      category: 'Sans catégorie',
      amount: 30.5,
      currency: 'EUR',
      status: 'Validée',
      payers: 'Alice (30.5)',
      beneficiaries: 'Alice (15.25) ; Bob (15.25)',
    });
  });

  it('sort un CSV Excel français : point-virgule, virgule décimale, guillemets doublés, BOM', () => {
    const csv = toCsv(expenseRows([restaurant], 2, labels), {
      dialect: 'excel-fr',
      columns: [
        { key: 'date', header: 'Date' },
        { key: 'label', header: 'Libellé' },
        { key: 'amount', header: 'Montant' },
      ],
    });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('Date;Libellé;Montant');
    expect(csv).toContain('"Restaurant ""Chez Lou"""');
    expect(csv).toContain(';30,5');
  });

  it('aplatit les soldes, par personne et par regroupement', () => {
    expect(
      balanceRows(
        [
          {
            participantId: A,
            paid: 3050,
            owed: 1525,
            sent: 0,
            received: 0,
            net: 1525,
          },
        ],
        2,
        labels.nameOf
      )
    ).toEqual([
      {
        person: 'Alice',
        paid: 30.5,
        owed: 15.25,
        sent: 0,
        received: 0,
        net: 15.25,
      },
    ]);
    expect(
      groupRows(
        [
          {
            groupId: G,
            net: 0,
            paid: 3050,
            owed: 3050,
            members: [
              {
                participantId: A,
                paid: 3050,
                owed: 1525,
                sent: 0,
                received: 0,
                net: 1525,
              },
              {
                participantId: B,
                paid: 0,
                owed: 1525,
                sent: 0,
                received: 0,
                net: -1525,
              },
            ],
          },
        ],
        2,
        { groupOf: () => 'Nous', nameOf: labels.nameOf }
      )
    ).toEqual([
      { group: 'Nous', members: 'Alice ; Bob', paid: 30.5, owed: 30.5, net: 0 },
    ]);
  });

  it('fait un nom de fichier sûr', () => {
    expect(fileSlug('Vacances à Été 2026 !')).toBe('vacances-a-ete-2026');
    expect(fileSlug('***')).toBe('espace');
  });
});
