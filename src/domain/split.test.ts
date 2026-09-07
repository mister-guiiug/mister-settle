import { describe, expect, it } from 'vitest';
import { SHARES_SCALE } from './money.ts';
import {
  allocationTotal,
  orderParties,
  splitByAmount,
  splitByShares,
  splitEqual,
  type Party,
} from './split.ts';

const p = (id: string, position: number): Party => ({
  participantId: id,
  position,
});
const [alice, bob, charlie] = [p('alice', 0), p('bob', 1), p('charlie', 2)];

/**
 * Ce que ces tests figent : la somme est TOUJOURS le total, le reliquat suit
 * l'ordre stable de l'espace et non l'ordre des clics, et les parts décimales
 * se calculent sans flottant.
 */
describe('splitEqual', () => {
  it('répartit 90 € à trois en 30 € chacun', () => {
    expect(splitEqual(9000, [alice, bob, charlie])).toEqual([
      { participantId: 'alice', amount: 3000 },
      { participantId: 'bob', amount: 3000 },
      { participantId: 'charlie', amount: 3000 },
    ]);
  });

  it('donne le centime en trop aux premiers dans l’ordre de l’espace', () => {
    // Saisis dans le désordre : c'est la position qui commande.
    const result = splitEqual(10000, [charlie, alice, bob]);
    expect(result).toEqual([
      { participantId: 'alice', amount: 3334 },
      { participantId: 'bob', amount: 3333 },
      { participantId: 'charlie', amount: 3333 },
    ]);
    expect(allocationTotal(result)).toBe(10000);
  });

  it('gère le reliquat d’un centime, et un centime à deux', () => {
    expect(splitEqual(100, [alice, bob, charlie]).map(a => a.amount)).toEqual([
      34, 33, 33,
    ]);
    expect(splitEqual(1, [alice, bob]).map(a => a.amount)).toEqual([1, 0]);
  });

  it('refuse une liste vide et une personne comptée deux fois', () => {
    expect(() => splitEqual(100, [])).toThrow(/aucun bénéficiaire/);
    expect(() => splitEqual(100, [alice, alice])).toThrow(/deux fois/);
  });
});

describe('splitByAmount', () => {
  it('rend les montants saisis et l’écart restant', () => {
    const { allocations, remainder } = splitByAmount(9000, [
      { ...alice, amount: 4000 },
      { ...bob, amount: 3000 },
      { ...charlie, amount: 2000 },
    ]);
    expect(allocations.map(a => a.amount)).toEqual([4000, 3000, 2000]);
    expect(remainder).toBe(0);
  });

  it('dit ce qui manque, et ce qui dépasse', () => {
    expect(
      splitByAmount(9000, [
        { ...alice, amount: 4000 },
        { ...bob, amount: 3000 },
      ]).remainder
    ).toBe(2000);
    expect(
      splitByAmount(9000, [
        { ...alice, amount: 5000 },
        { ...bob, amount: 5000 },
      ]).remainder
    ).toBe(-1000);
  });
});

describe('splitByShares', () => {
  const shares = (party: Party, value: number) => ({
    ...party,
    shares: value * SHARES_SCALE,
  });

  it('répartit 120 € en 2 · 1 · 1 parts : 60 · 30 · 30', () => {
    expect(
      splitByShares(12000, [
        shares(alice, 2),
        shares(bob, 1),
        shares(charlie, 1),
      ]).map(a => a.amount)
    ).toEqual([6000, 3000, 3000]);
  });

  it('accepte des parts décimales, sans flottant', () => {
    // 10 € en 1,5 part contre 1 : 6 € et 4 €.
    expect(
      splitByShares(1000, [
        { ...alice, shares: 15_000 },
        { ...bob, shares: 10_000 },
      ]).map(a => a.amount)
    ).toEqual([600, 400]);
    // 1 € en 1,3 · 1,3 · 1,4 parts : 32 · 33 · 35, somme 100.
    const result = splitByShares(100, [
      { ...alice, shares: 13_000 },
      { ...bob, shares: 13_000 },
      { ...charlie, shares: 14_000 },
    ]);
    expect(allocationTotal(result)).toBe(100);
    expect(result.map(a => a.amount)).toEqual([33, 32, 35]);
  });

  it('applique les plus forts restes, l’ordre tranchant les égalités', () => {
    expect(
      splitByShares(10000, [
        shares(alice, 1),
        shares(bob, 1),
        shares(charlie, 1),
      ]).map(a => a.amount)
    ).toEqual([3334, 3333, 3333]);
  });

  it('donne zéro à qui n’a pas de part, sans le retirer de la liste', () => {
    expect(
      splitByShares(9000, [shares(alice, 0), shares(bob, 3)]).map(a => a.amount)
    ).toEqual([0, 9000]);
  });

  it('refuse l’absence de part positive et les parts négatives', () => {
    expect(() =>
      splitByShares(9000, [shares(alice, 0), shares(bob, 0)])
    ).toThrow(/aucune part positive/);
    expect(() => splitByShares(9000, [{ ...alice, shares: -1 }])).toThrow(
      /parts invalides/
    );
  });

  it('garde la somme exacte sur un échantillon déterministe', () => {
    let seed = 7;
    const next = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed;
    };
    for (let i = 0; i < 500; i += 1) {
      const total = next() % 1_000_000;
      const count = 1 + (next() % 8);
      const entries = Array.from({ length: count }, (_, index) => ({
        participantId: `p${index}`,
        position: index,
        shares: next() % 50_000,
      }));
      if (entries.every(e => e.shares === 0)) continue;
      const result = splitByShares(total, entries);
      expect(allocationTotal(result)).toBe(total);
      for (const allocation of result)
        expect(allocation.amount).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('orderParties', () => {
  it('range par position puis par identifiant, sans muter', () => {
    const input = [p('b', 1), p('a', 1), p('z', 0)];
    expect(orderParties(input).map(x => x.participantId)).toEqual([
      'z',
      'a',
      'b',
    ]);
    expect(input.map(x => x.participantId)).toEqual(['b', 'a', 'z']);
  });
});
