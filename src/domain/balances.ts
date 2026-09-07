import { assertMinor, type Minor } from './money.ts';

/**
 * LES SOLDES SE RECALCULENT, ILS NE SE STOCKENT PAS.
 *
 * `solde(p) = payé(p) − dû(p) + remboursements émis(p) − remboursements
 * reçus(p)`, sur les seules dépenses **validées** et les remboursements
 * **enregistrés**. Un brouillon n'existe pas pour ce module. La somme des
 * soldes d'un espace vaut zéro par construction : chaque centime payé est dû
 * par quelqu'un, chaque remboursement sort d'une poche pour entrer dans une
 * autre.
 *
 * Signe : positif = on me doit ; négatif = je dois.
 */

export interface PayerLine {
  participantId: string;
  amount: Minor;
}

export interface ExpenseForBalance {
  status: 'draft' | 'validated' | 'archived';
  payers: readonly PayerLine[];
  allocations: readonly PayerLine[];
}

export interface SettlementForBalance {
  status: 'recorded' | 'cancelled';
  fromParticipantId: string;
  toParticipantId: string;
  amount: Minor;
}

export interface BalanceLine {
  participantId: string;
  paid: Minor;
  owed: Minor;
  sent: Minor;
  received: Minor;
  net: Minor;
}

export function computeBalances(input: {
  participantIds: readonly string[];
  expenses: readonly ExpenseForBalance[];
  settlements: readonly SettlementForBalance[];
}): BalanceLine[] {
  const lines = new Map<string, BalanceLine>();
  for (const participantId of input.participantIds) {
    lines.set(participantId, {
      participantId,
      paid: 0,
      owed: 0,
      sent: 0,
      received: 0,
      net: 0,
    });
  }
  // Une personne archivée, ou disparue de la liste donnée, garde ses
  // montants : les faire disparaître déséquilibrerait l'espace en silence.
  const line = (participantId: string): BalanceLine => {
    let found = lines.get(participantId);
    if (!found) {
      found = { participantId, paid: 0, owed: 0, sent: 0, received: 0, net: 0 };
      lines.set(participantId, found);
    }
    return found;
  };

  for (const expense of input.expenses) {
    if (expense.status !== 'validated') continue;
    for (const payer of expense.payers) {
      line(payer.participantId).paid += assertMinor(payer.amount);
    }
    for (const allocation of expense.allocations) {
      line(allocation.participantId).owed += assertMinor(allocation.amount);
    }
  }
  for (const settlement of input.settlements) {
    if (settlement.status !== 'recorded') continue;
    const amount = assertMinor(settlement.amount);
    line(settlement.fromParticipantId).sent += amount;
    line(settlement.toParticipantId).received += amount;
  }
  for (const l of lines.values()) {
    l.net = l.paid - l.owed + l.sent - l.received;
  }
  return [...lines.values()];
}

/** Zéro, ou l'espace est incohérent : l'assertion que les tests répètent. */
export function balanceSum(lines: readonly BalanceLine[]): Minor {
  return lines.reduce((sum, l) => sum + l.net, 0);
}

export interface GroupForBalance {
  id: string;
  memberIds: readonly string[];
}

export interface GroupBalance {
  groupId: string;
  net: Minor;
  paid: Minor;
  owed: Minor;
  /** Le détail individuel, sous le total consolidé. */
  members: BalanceLine[];
}

/**
 * LE CONSOLIDÉ EST UNE SOMME D'AFFICHAGE, PAS UNE COMPTABILITÉ. Il additionne
 * les soldes des membres du regroupement tel qu'il est composé AUJOURD'HUI ;
 * une personne dans deux regroupements est comptée dans les deux, parce
 * qu'on compare des regroupements, on ne les additionne pas entre eux.
 */
export function consolidateByGroup(
  lines: readonly BalanceLine[],
  groups: readonly GroupForBalance[]
): GroupBalance[] {
  const byId = new Map(lines.map(l => [l.participantId, l] as const));
  return groups.map(group => {
    const members = group.memberIds
      .map(id => byId.get(id))
      .filter((l): l is BalanceLine => l !== undefined);
    return {
      groupId: group.id,
      net: members.reduce((s, l) => s + l.net, 0),
      paid: members.reduce((s, l) => s + l.paid, 0),
      owed: members.reduce((s, l) => s + l.owed, 0),
      members,
    };
  });
}
