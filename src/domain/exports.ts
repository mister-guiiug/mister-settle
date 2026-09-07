import type { Expense } from '../backend/ports.ts';
import type { BalanceLine, GroupBalance } from './balances.ts';
import { toDisplayNumber } from './money.ts';

/**
 * LES EXPORTS, CÔTÉ DOMAINE : des lignes plates, prêtes pour le CSV
 * (dialecte Excel français du socle) ou le XLSX. Les montants deviennent
 * des nombres d'affichage — c'est le seul endroit où un flottant apparaît,
 * et il ne sert qu'à être écrit. Les libellés (noms, catégories, statuts)
 * sont fournis par l'écran, dans la langue de l'utilisateur.
 */

export interface ExportLabels {
  nameOf: (participantId: string) => string;
  categoryOf: (categoryId: string | null) => string;
  statusOf: (status: Expense['status']) => string;
}

export interface ExpenseRow {
  date: string;
  label: string;
  category: string;
  amount: number;
  currency: string;
  status: string;
  payers: string;
  beneficiaries: string;
}

/** Une ligne par dépense, la plus récente d'abord ; les parts en clair. */
export function expenseRows(
  expenses: readonly Expense[],
  minorUnit: number,
  labels: ExportLabels
): ExpenseRow[] {
  const money = (minor: number) => toDisplayNumber(minor, minorUnit);
  const part = (participantId: string, amount: number) =>
    `${labels.nameOf(participantId)} (${money(amount)})`;
  return [...expenses]
    .sort((a, b) =>
      a.spentOn < b.spentOn ? 1 : a.spentOn > b.spentOn ? -1 : 0
    )
    .map(expense => ({
      date: expense.spentOn,
      label: expense.label,
      category: labels.categoryOf(expense.categoryId),
      amount: money(expense.amount),
      currency: expense.currency,
      status: labels.statusOf(expense.status),
      payers: expense.payers
        .map(p => part(p.participantId, p.amount))
        .join(' ; '),
      beneficiaries:
        expense.allocations.length > 0
          ? expense.allocations
              .map(a => part(a.participantId, a.amount))
              .join(' ; ')
          : expense.beneficiaries
              .map(b => labels.nameOf(b.participantId))
              .join(' ; '),
    }));
}

export interface BalanceRow {
  person: string;
  paid: number;
  owed: number;
  sent: number;
  received: number;
  net: number;
}

/** Une ligne par personne — l'individuel. */
export function balanceRows(
  lines: readonly BalanceLine[],
  minorUnit: number,
  nameOf: (participantId: string) => string
): BalanceRow[] {
  const money = (minor: number) => toDisplayNumber(minor, minorUnit);
  return lines.map(line => ({
    person: nameOf(line.participantId),
    paid: money(line.paid),
    owed: money(line.owed),
    sent: money(line.sent),
    received: money(line.received),
    net: money(line.net),
  }));
}

export interface GroupRow {
  group: string;
  members: string;
  paid: number;
  owed: number;
  net: number;
}

/** Une ligne par regroupement — le consolidé, tel qu'il est composé aujourd'hui. */
export function groupRows(
  groups: readonly GroupBalance[],
  minorUnit: number,
  labels: {
    groupOf: (groupId: string) => string;
    nameOf: (id: string) => string;
  }
): GroupRow[] {
  const money = (minor: number) => toDisplayNumber(minor, minorUnit);
  return groups.map(group => ({
    group: labels.groupOf(group.groupId),
    members: group.members.map(m => labels.nameOf(m.participantId)).join(' ; '),
    paid: money(group.paid),
    owed: money(group.owed),
    net: money(group.net),
  }));
}

/** Un nom de fichier sûr : minuscules, tirets, rien d'autre. */
export function fileSlug(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'espace'
  );
}
