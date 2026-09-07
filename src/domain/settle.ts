import type { Minor } from './money.ts';
import type { BalanceLine } from './balances.ts';

/**
 * LES REMBOURSEMENTS SUGGÉRÉS : informatifs, déterministes, bornés.
 *
 * L'algorithme est le glouton classique : le plus gros débiteur rembourse le
 * plus gros créancier du montant qui solde l'un des deux, et on recommence.
 * Il produit au plus `n − 1` opérations et il est **déterministe** — à
 * montant égal, l'identifiant tranche — donc identique sur tous les appareils.
 *
 * Il n'est pas OPTIMAL : minimiser le nombre d'opérations est NP-difficile
 * (partition des sous-ensembles), et une heuristique qui « trouve parfois
 * mieux » donnerait des suggestions qui changent d'un jour à l'autre sans
 * qu'aucune dette n'ait bougé. La régularité vaut plus que l'opération
 * économisée.
 *
 * Rien ici ne déplace d'argent. Ce sont des phrases : « Bob pourrait rendre
 * 30 € à Alice ».
 */

export interface Transfer {
  fromParticipantId: string;
  toParticipantId: string;
  amount: Minor;
}

function byAmountThenId(a: { id: string; amount: Minor }, b: typeof a) {
  return b.amount - a.amount || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function suggestTransfers(lines: readonly BalanceLine[]): Transfer[] {
  const debtors = lines
    .filter(l => l.net < 0)
    .map(l => ({ id: l.participantId, amount: -l.net }))
    .sort(byAmountThenId);
  const creditors = lines
    .filter(l => l.net > 0)
    .map(l => ({ id: l.participantId, amount: l.net }))
    .sort(byAmountThenId);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    if (!debtor || !creditor) break;
    const amount = Math.min(debtor.amount, creditor.amount);
    if (amount > 0) {
      transfers.push({
        fromParticipantId: debtor.id,
        toParticipantId: creditor.id,
        amount,
      });
    }
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount === 0) i += 1;
    if (creditor.amount === 0) j += 1;
  }
  return transfers;
}
