import type { Expense } from '../backend/ports.ts';
import type { Minor } from './money.ts';

/**
 * LES STATISTIQUES, CÔTÉ DOMAINE : des sommes d'entiers d'unités mineures
 * sur les seules dépenses VALIDÉES (R11) — par catégorie, par mois, par
 * personne. Aucun flottant, aucune valeur stockée : tout se recalcule.
 */

export interface CategoryTotal {
  /** `null` : sans catégorie. */
  categoryId: string | null;
  total: Minor;
  count: number;
}

export interface MonthTotal {
  /** `AAAA-MM`. */
  month: string;
  total: Minor;
  count: number;
}

export interface PersonTotal {
  participantId: string;
  /** Ce que la personne a avancé. */
  paid: Minor;
  /** Ce qui lui revient. */
  owed: Minor;
  /** Les dépenses où elle apparaît, payeuse ou bénéficiaire. */
  count: number;
}

const validated = (expenses: readonly Expense[]) =>
  expenses.filter(e => e.status === 'validated');

/** Par catégorie principale, la plus lourde d'abord ; « sans » en dernier. */
export function totalsByCategory(
  expenses: readonly Expense[]
): CategoryTotal[] {
  const map = new Map<string | null, CategoryTotal>();
  for (const expense of validated(expenses)) {
    const key = expense.categoryId;
    const line = map.get(key) ?? { categoryId: key, total: 0, count: 0 };
    line.total += expense.amount;
    line.count += 1;
    map.set(key, line);
  }
  return [...map.values()].sort((a, b) => {
    if (a.categoryId === null) return 1;
    if (b.categoryId === null) return -1;
    return b.total - a.total || a.categoryId.localeCompare(b.categoryId);
  });
}

/** Par mois de dépense, le plus récent d'abord. */
export function totalsByMonth(expenses: readonly Expense[]): MonthTotal[] {
  const map = new Map<string, MonthTotal>();
  for (const expense of validated(expenses)) {
    const month = expense.spentOn.slice(0, 7);
    const line = map.get(month) ?? { month, total: 0, count: 0 };
    line.total += expense.amount;
    line.count += 1;
    map.set(month, line);
  }
  return [...map.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
}

/**
 * Par personne, dans l'ordre donné : avancé (payeurs) et dû (allocations
 * écrites par la base à la validation). Les personnes absentes de toute
 * dépense restent, à zéro — un tableau sans trou se lit mieux.
 */
export function totalsByPerson(
  expenses: readonly Expense[],
  participantIds: readonly string[]
): PersonTotal[] {
  const map = new Map<string, PersonTotal>(
    participantIds.map(id => [
      id,
      { participantId: id, paid: 0, owed: 0, count: 0 },
    ])
  );
  for (const expense of validated(expenses)) {
    const seen = new Set<string>();
    for (const payer of expense.payers) {
      const line = map.get(payer.participantId);
      if (!line) continue;
      line.paid += payer.amount;
      seen.add(payer.participantId);
    }
    for (const allocation of expense.allocations) {
      const line = map.get(allocation.participantId);
      if (!line) continue;
      line.owed += allocation.amount;
      seen.add(allocation.participantId);
    }
    for (const id of seen) {
      const line = map.get(id);
      if (line) line.count += 1;
    }
  }
  return [...map.values()];
}

/** Le total validé, la somme sur laquelle les parts se lisent. */
export function validatedTotal(expenses: readonly Expense[]): Minor {
  return validated(expenses).reduce((sum, e) => sum + e.amount, 0);
}

/** Une part en pourcentage entier, jamais NaN. */
export function percentOf(part: Minor, total: Minor): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}
