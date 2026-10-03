import type { Participant } from '../../backend/ports.ts';
import {
  computeBalances,
  type ExpenseForBalance,
  type SettlementForBalance,
} from '../../domain/balances.ts';

export interface SpaceSummary {
  /** `null` si je ne suis rattaché·e à aucune personne. */
  myNet: number | null;
  drafts: number;
  /** Jour ISO de la dépense non archivée la plus récente, ou `null`. */
  lastSpentOn: string | null;
}

type ExpenseForSummary = ExpenseForBalance & { spentOn: string };

/**
 * Aperçu d'un espace pour l'accueil / le tableau de bord : mon solde, les
 * brouillons, la dernière activité. Recalculé à partir des listes — jamais
 * d'une valeur stockée (ADR 0011).
 */
export function spaceSummaryOf({
  participants,
  expenses,
  settlements,
  myUserId,
}: {
  participants: readonly Participant[];
  expenses: readonly ExpenseForSummary[];
  settlements: readonly SettlementForBalance[];
  myUserId: string | null;
}): SpaceSummary {
  const validated = expenses.filter(e => e.status === 'validated');
  const drafts = expenses.filter(e => e.status === 'draft').length;
  const live = expenses.filter(e => e.status !== 'archived');
  const lastSpentOn =
    live.length === 0
      ? null
      : live.reduce(
          (latest, expense) =>
            expense.spentOn > latest ? expense.spentOn : latest,
          live[0]!.spentOn
        );
  const me = myUserId
    ? participants.find(p => p.linkedUserId === myUserId)
    : undefined;
  if (!me) {
    return { myNet: null, drafts, lastSpentOn };
  }
  const balances = computeBalances({
    participantIds: participants.map(p => p.id),
    expenses: validated,
    settlements,
  });
  const mine = balances.find(b => b.participantId === me.id);
  return { myNet: mine?.net ?? 0, drafts, lastSpentOn };
}
