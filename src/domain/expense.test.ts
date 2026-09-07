import { describe, expect, it } from 'vitest';
import { SHARES_SCALE } from './money.ts';
import {
  calculationFingerprint,
  checkExpense,
  computeAllocations,
  hasBlockingIssue,
  isValidationCurrent,
  previewImpact,
  type ExpenseInput,
} from './expense.ts';

const alice = { participantId: 'alice', position: 0 };
const bob = { participantId: 'bob', position: 1 };
const charlie = { participantId: 'charlie', position: 2 };

const quatreVingtDix: ExpenseInput = {
  amount: 9000,
  currency: 'EUR',
  fxRateScaled: null,
  method: 'equal',
  payers: [{ participantId: 'alice', amount: 9000 }],
  beneficiaries: [alice, bob, charlie],
  selectedGroupIds: [],
};

const codes = (input: ExpenseInput) => checkExpense(input).map(i => i.code);

/**
 * Les cas prioritaires du cahier des charges, un par un : reliquat d'un
 * centime, somme incorrecte, parts décimales, plusieurs payeurs — et ce qui
 * fait tomber une validation.
 */
describe('checkExpense', () => {
  it('accepte la dépense de référence sans un mot', () => {
    expect(checkExpense(quatreVingtDix)).toEqual([]);
  });

  it('exige un montant strictement positif', () => {
    expect(codes({ ...quatreVingtDix, amount: 0 })).toContain(
      'amount-not-positive'
    );
    expect(codes({ ...quatreVingtDix, amount: -100 })).toContain(
      'amount-not-positive'
    );
  });

  it('exige au moins un payeur, et une somme des payeurs égale au montant', () => {
    expect(codes({ ...quatreVingtDix, payers: [] })).toContain('no-payer');
    const issues = checkExpense({
      ...quatreVingtDix,
      payers: [
        { participantId: 'alice', amount: 5000 },
        { participantId: 'bob', amount: 3000 },
      ],
    });
    expect(issues).toContainEqual({
      code: 'payers-sum-mismatch',
      severity: 'error',
      params: { difference: 1000 },
    });
  });

  it('accepte plusieurs payeurs dont la somme est exacte', () => {
    expect(
      checkExpense({
        ...quatreVingtDix,
        payers: [
          { participantId: 'alice', amount: 5000 },
          { participantId: 'bob', amount: 4000 },
        ],
      })
    ).toEqual([]);
  });

  it('exige au moins un bénéficiaire, chacun une seule fois', () => {
    expect(codes({ ...quatreVingtDix, beneficiaries: [] })).toContain(
      'no-beneficiary'
    );
    expect(
      codes({ ...quatreVingtDix, beneficiaries: [alice, alice] })
    ).toContain('beneficiary-duplicate');
  });

  it('par montant : refuse une somme incorrecte et dit l’écart', () => {
    const issues = checkExpense({
      ...quatreVingtDix,
      method: 'amount',
      beneficiaries: [
        { ...alice, amount: 4000 },
        { ...bob, amount: 3000 },
        { ...charlie, amount: 1000 },
      ],
    });
    expect(issues).toContainEqual({
      code: 'amounts-sum-mismatch',
      severity: 'error',
      params: { difference: 1000 },
    });
    expect(hasBlockingIssue(issues)).toBe(true);
  });

  it('par parts : refuse le négatif et l’absence de part positive', () => {
    expect(
      codes({
        ...quatreVingtDix,
        method: 'shares',
        beneficiaries: [
          { ...alice, shares: -1 },
          { ...bob, shares: 10_000 },
        ],
      })
    ).toContain('shares-negative');
    expect(
      codes({
        ...quatreVingtDix,
        method: 'shares',
        beneficiaries: [
          { ...alice, shares: 0 },
          { ...bob, shares: 0 },
        ],
      })
    ).toContain('shares-none-positive');
  });

  it('avertit sans bloquer : payeur hors bénéficiaires, dépense pour soi seul', () => {
    const horsListe = checkExpense({
      ...quatreVingtDix,
      beneficiaries: [bob, charlie],
    });
    expect(horsListe).toEqual([
      {
        code: 'payer-not-beneficiary',
        severity: 'warning',
        params: { participantId: 'alice' },
      },
    ]);
    expect(hasBlockingIssue(horsListe)).toBe(false);

    const seul = checkExpense({ ...quatreVingtDix, beneficiaries: [alice] });
    expect(seul.map(i => i.code)).toEqual(['self-only']);
  });
});

describe('computeAllocations', () => {
  it('rend null tant qu’une erreur bloque', () => {
    expect(computeAllocations({ ...quatreVingtDix, payers: [] })).toBeNull();
  });

  it('répartit le reliquat d’un centime de façon déterministe', () => {
    expect(
      computeAllocations({
        ...quatreVingtDix,
        amount: 10000,
        payers: [{ participantId: 'alice', amount: 10000 }],
      })
    ).toEqual([
      { participantId: 'alice', amount: 3334 },
      { participantId: 'bob', amount: 3333 },
      { participantId: 'charlie', amount: 3333 },
    ]);
  });

  it('calcule les parts décimales', () => {
    expect(
      computeAllocations({
        ...quatreVingtDix,
        amount: 12000,
        payers: [{ participantId: 'alice', amount: 12000 }],
        method: 'shares',
        beneficiaries: [
          { ...alice, shares: 2 * SHARES_SCALE },
          { ...bob, shares: SHARES_SCALE },
          { ...charlie, shares: SHARES_SCALE },
        ],
      })
    ).toEqual([
      { participantId: 'alice', amount: 6000 },
      { participantId: 'bob', amount: 3000 },
      { participantId: 'charlie', amount: 3000 },
    ]);
  });
});

describe('empreinte de calcul', () => {
  it('ne dépend pas de l’ordre des clics', () => {
    const a = calculationFingerprint(quatreVingtDix);
    const b = calculationFingerprint({
      ...quatreVingtDix,
      beneficiaries: [charlie, alice, bob],
    });
    expect(a).toBe(b);
  });

  it('change dès qu’un élément du calcul change — et fait tomber la validation', () => {
    const validated = calculationFingerprint(quatreVingtDix);
    expect(isValidationCurrent(validated, quatreVingtDix)).toBe(true);
    expect(isValidationCurrent(null, quatreVingtDix)).toBe(false);

    const variantes: ExpenseInput[] = [
      {
        ...quatreVingtDix,
        amount: 9001,
        payers: [{ participantId: 'alice', amount: 9001 }],
      },
      { ...quatreVingtDix, currency: 'USD' },
      { ...quatreVingtDix, fxRateScaled: 110_000_000 },
      { ...quatreVingtDix, payers: [{ participantId: 'bob', amount: 9000 }] },
      { ...quatreVingtDix, beneficiaries: [alice, bob] },
      {
        ...quatreVingtDix,
        method: 'shares',
        beneficiaries: [alice, bob, charlie].map(b => ({
          ...b,
          shares: SHARES_SCALE,
        })),
      },
      { ...quatreVingtDix, selectedGroupIds: ['martin'] },
    ];
    for (const variante of variantes) {
      expect(isValidationCurrent(validated, variante)).toBe(false);
    }
  });

  it('ignore ce qui n’influe pas sur le calcul : les regroupements figés d’une personne', () => {
    const avecVia = calculationFingerprint({
      ...quatreVingtDix,
      beneficiaries: [{ ...alice, viaGroupIds: ['martin'] }, bob, charlie],
    });
    expect(avecVia).toBe(calculationFingerprint(quatreVingtDix));
  });
});

describe('previewImpact', () => {
  it('montre ce que la dépense fait à chacun, à somme nulle', () => {
    const allocations = computeAllocations(quatreVingtDix);
    expect(allocations).not.toBeNull();
    const impact = previewImpact(quatreVingtDix.payers, allocations ?? []);
    expect(impact).toEqual([
      { participantId: 'alice', delta: 6000 },
      { participantId: 'bob', delta: -3000 },
      { participantId: 'charlie', delta: -3000 },
    ]);
    expect(impact.reduce((s, i) => s + i.delta, 0)).toBe(0);
  });
});
