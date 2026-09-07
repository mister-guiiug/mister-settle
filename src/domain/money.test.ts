import { describe, expect, it } from 'vitest';
import {
  fromDecimalString,
  minorUnitOf,
  parseAmount,
  parseShares,
  sharesFromDecimalString,
  sharesToDecimalString,
  sumMinor,
  toDecimalString,
  toDisplayNumber,
} from './money.ts';

/**
 * Ce que ces tests figent : aucun montant ne passe par un flottant, une saisie
 * humaine est comprise dans les deux écritures françaises et anglaises, et ce
 * qu'on écrit vers la base se relit exactement.
 */
describe('parseAmount', () => {
  it('comprend les écritures humaines courantes', () => {
    expect(parseAmount('90')).toBe(9000);
    expect(parseAmount('90,00')).toBe(9000);
    expect(parseAmount('12.5')).toBe(1250);
    expect(parseAmount('12,5')).toBe(1250);
    expect(parseAmount('1 234,50')).toBe(123450);
    expect(parseAmount('1 234,50')).toBe(123450);
    expect(parseAmount("1'234.50")).toBe(123450);
    expect(parseAmount(',5')).toBe(50);
    expect(parseAmount('0')).toBe(0);
  });

  it('rend le signe, sans décider s’il a un sens', () => {
    expect(parseAmount('-3,10')).toBe(-310);
    expect(parseAmount('+3,10')).toBe(310);
  });

  it('refuse ce qui n’est pas un montant', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('   ')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('12,')).toBe(1200);
    expect(parseAmount('1.234.567')).toBeNull();
    expect(parseAmount('1,2,3')).toBeNull();
  });

  it('refuse plus de décimales que la devise n’en a, sans arrondir', () => {
    expect(parseAmount('12,345')).toBeNull();
    expect(parseAmount('12.5', 0)).toBeNull();
    expect(parseAmount('1200', 0)).toBe(1200);
    expect(parseAmount('1,234', 3)).toBe(1234);
  });
});

describe('unités mineures', () => {
  it('connaît les devises sans décimales et celles à trois', () => {
    expect(minorUnitOf('EUR')).toBe(2);
    expect(minorUnitOf('usd')).toBe(2);
    expect(minorUnitOf('JPY')).toBe(0);
    expect(minorUnitOf('KWD')).toBe(3);
  });
});

describe('toDecimalString / fromDecimalString', () => {
  it('écrit ce qu’une colonne numeric attend', () => {
    expect(toDecimalString(1250)).toBe('12.50');
    expect(toDecimalString(5)).toBe('0.05');
    expect(toDecimalString(0)).toBe('0.00');
    expect(toDecimalString(-1250)).toBe('-12.50');
    expect(toDecimalString(1200, 0)).toBe('1200');
    expect(toDecimalString(12345, 3)).toBe('12.345');
  });

  it('relit ce que numeric rend, y compris sans zéros de fin', () => {
    expect(fromDecimalString('12.50')).toBe(1250);
    expect(fromDecimalString('12.5')).toBe(1250);
    expect(fromDecimalString('12')).toBe(1200);
    expect(fromDecimalString('12.500')).toBe(1250);
    expect(fromDecimalString('-0.05')).toBe(-5);
    expect(fromDecimalString('1200', 0)).toBe(1200);
  });

  it('refuse une base incohérente ou une écriture humaine', () => {
    expect(fromDecimalString('12.505')).toBeNull();
    expect(fromDecimalString('12,50')).toBeNull();
    expect(fromDecimalString('1 250')).toBeNull();
    expect(fromDecimalString('')).toBeNull();
  });

  it('fait l’aller-retour exact sur un échantillon déterministe', () => {
    // Un générateur congruentiel suffit : la reproductibilité compte plus que
    // l'aléa, et un cas qui casse doit pouvoir être rejoué à l'identique.
    let seed = 42;
    const next = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed;
    };
    for (let i = 0; i < 2_000; i += 1) {
      const value = (next() % 20_000_000) - 10_000_000;
      expect(fromDecimalString(toDecimalString(value))).toBe(value);
      expect(fromDecimalString(toDecimalString(value, 0), 0)).toBe(value);
      expect(fromDecimalString(toDecimalString(value, 3), 3)).toBe(value);
    }
  });
});

describe('toDisplayNumber', () => {
  it('ne sert qu’à Intl, et rend la valeur attendue', () => {
    expect(toDisplayNumber(1250)).toBe(12.5);
    expect(toDisplayNumber(1200, 0)).toBe(1200);
  });
});

describe('sumMinor', () => {
  it('additionne des entiers, et refuse un flottant', () => {
    expect(sumMinor([1, 2, 3])).toBe(6);
    expect(() => sumMinor([1, 0.5])).toThrow(/entier attendu/);
  });
});

describe('parts', () => {
  it('met à l’échelle à quatre décimales, dans les deux écritures', () => {
    expect(parseShares('1')).toBe(10_000);
    expect(parseShares('1,5')).toBe(15_000);
    expect(parseShares('2.25')).toBe(22_500);
    expect(parseShares('0')).toBe(0);
    expect(parseShares(',5')).toBe(5_000);
  });

  it('refuse le négatif, l’illisible et plus de quatre décimales', () => {
    expect(parseShares('-1')).toBeNull();
    expect(parseShares('')).toBeNull();
    expect(parseShares('1.23456')).toBeNull();
    expect(parseShares('abc')).toBeNull();
  });

  it('s’écrit et se relit sans perte', () => {
    expect(sharesToDecimalString(15_000)).toBe('1.5');
    expect(sharesToDecimalString(20_000)).toBe('2');
    expect(sharesToDecimalString(12_345)).toBe('1.2345');
    expect(sharesToDecimalString(0)).toBe('0');
    expect(sharesFromDecimalString('1.5000')).toBe(15_000);
    expect(sharesFromDecimalString('2')).toBe(20_000);
    expect(sharesFromDecimalString('1.2345')).toBe(12_345);
    expect(sharesFromDecimalString('1.23456')).toBeNull();
  });
});
