import { assertMinor, type Minor } from './money.ts';

/**
 * LA RÉPARTITION, EN ENTIERS, DÉTERMINISTE.
 *
 * Trois modèles, une seule garantie commune : la somme des montants
 * individuels est **exactement** le total, sans jamais passer par un flottant.
 * Le reliquat de centimes qu'une division laisse est attribué par une règle
 * écrite — et la même règle vit en SQL dans `validate_expense`, qui recalcule
 * tout côté serveur. Les deux implémentations sont éprouvées sur les mêmes
 * cas : si elles divergent un jour, c'est un test qui le dira, pas un solde.
 *
 * L'ORDRE STABLE de l'espace décide de qui reçoit le centime en trop : la
 * `position` de la personne dans l'espace, puis son identifiant. C'est ce qui
 * rend le résultat le même sur tous les appareils et à toutes les heures.
 */

/** Ce qu'il faut savoir d'une personne pour la ranger. */
export interface Party {
  participantId: string;
  /** Sa place dans l'espace, celle que l'écran « Personnes » montre. */
  position: number;
}

export interface Allocation {
  participantId: string;
  amount: Minor;
}

/** Lève sur un identifiant en double : une personne compte une seule fois. */
export function assertUnique(parties: readonly Party[]): void {
  const seen = new Set<string>();
  for (const party of parties) {
    if (seen.has(party.participantId)) {
      throw new Error(`personne comptée deux fois : ${party.participantId}`);
    }
    seen.add(party.participantId);
  }
}

/** L'ordre stable : position croissante, puis identifiant. Ne mute pas. */
export function orderParties<T extends Party>(parties: readonly T[]): T[] {
  return [...parties].sort(
    (a, b) =>
      a.position - b.position ||
      (a.participantId < b.participantId
        ? -1
        : a.participantId > b.participantId
          ? 1
          : 0)
  );
}

/**
 * RÉPARTITION ÉQUITABLE. Quotient entier pour tous, puis les `r` premiers dans
 * l'ordre stable reçoivent un centime de plus, `r` étant le reste. 90 € à
 * trois : 30 chacun. 100 € à trois : 33,34 · 33,33 · 33,33.
 */
export function splitEqual(
  total: Minor,
  parties: readonly Party[]
): Allocation[] {
  assertMinor(total, 'total');
  if (parties.length === 0) throw new Error('aucun bénéficiaire');
  assertUnique(parties);
  const ordered = orderParties(parties);
  const base = Math.floor(total / ordered.length);
  const remainder = total - base * ordered.length;
  return ordered.map((party, index) => ({
    participantId: party.participantId,
    amount: base + (index < remainder ? 1 : 0),
  }));
}

export interface AmountEntry extends Party {
  amount: Minor;
}

/**
 * RÉPARTITION PAR MONTANT. Les montants sont ceux qu'on a tapés ; `remainder`
 * est ce qui manque (positif) ou dépasse (négatif) pour atteindre le total.
 * L'écran l'affiche en direct ; la validation refuse tant qu'il n'est pas nul.
 */
export function splitByAmount(
  total: Minor,
  entries: readonly AmountEntry[]
): { allocations: Allocation[]; remainder: Minor } {
  assertMinor(total, 'total');
  assertUnique(entries);
  let sum = 0;
  const allocations = orderParties(entries).map(entry => {
    sum += assertMinor(entry.amount);
    return { participantId: entry.participantId, amount: entry.amount };
  });
  return { allocations, remainder: total - sum };
}

export interface ShareEntry extends Party {
  /** Parts mises à l'échelle (`SHARES_SCALE`), entier ≥ 0. */
  shares: number;
}

/**
 * RÉPARTITION PAR PARTS — la méthode des plus forts restes (Hamilton).
 *
 * Chaque personne reçoit le plancher de `total × parts / Σparts`, calculé en
 * `BigInt` pour que des parts à quatre décimales ne débordent jamais. Ce qui
 * reste — moins d'un centime par personne, strictement moins que le nombre de
 * personnes en tout — va, un centime chacun, à celles dont la partie
 * fractionnaire était la plus grande ; à égalité, l'ordre stable tranche.
 *
 * C'est la seule règle qui donne le résultat « naturel » sur les cas simples
 * (2 · 1 · 1 parts de 120 € → 60 · 30 · 30) ET un résultat déterministe sur
 * les autres.
 */
export function splitByShares(
  total: Minor,
  entries: readonly ShareEntry[]
): Allocation[] {
  assertMinor(total, 'total');
  if (entries.length === 0) throw new Error('aucun bénéficiaire');
  assertUnique(entries);
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.shares) || entry.shares < 0) {
      throw new Error(`parts invalides pour ${entry.participantId}`);
    }
  }
  const ordered = orderParties(entries);
  const totalShares = ordered.reduce((sum, e) => sum + e.shares, 0);
  if (totalShares <= 0) throw new Error('aucune part positive');

  const bigTotal = BigInt(total);
  const bigShares = BigInt(totalShares);
  const rows = ordered.map((entry, index) => {
    const numerator = bigTotal * BigInt(entry.shares);
    return {
      index,
      participantId: entry.participantId,
      floor: Number(numerator / bigShares),
      // Le reste de la division, comparable entre personnes : plus il est
      // grand, plus la personne était « proche » du centime suivant.
      rest: numerator % bigShares,
    };
  });

  let remainder = total - rows.reduce((sum, r) => sum + r.floor, 0);
  const byRest = [...rows].sort((a, b) =>
    a.rest === b.rest ? a.index - b.index : a.rest > b.rest ? -1 : 1
  );
  const bonus = new Set<number>();
  for (const row of byRest) {
    if (remainder <= 0) break;
    bonus.add(row.index);
    remainder -= 1;
  }
  return rows.map(row => ({
    participantId: row.participantId,
    amount: row.floor + (bonus.has(row.index) ? 1 : 0),
  }));
}

/** Somme des montants d'une répartition — pour affirmer l'invariant. */
export function allocationTotal(allocations: readonly Allocation[]): Minor {
  return allocations.reduce((sum, a) => sum + assertMinor(a.amount), 0);
}
