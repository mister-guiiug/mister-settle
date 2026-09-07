import { useState } from 'react';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { EmptyState } from '@mister-guiiug/dev-pwa-config/react/empty-state';
import { ErrorBanner } from '@mister-guiiug/dev-pwa-config/react/error-banner';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { Stat } from '@mister-guiiug/dev-pwa-config/react/stat';
import { useI18n } from '../../i18n/index.ts';
import type { Expense } from '../../backend/ports.ts';
import { computeBalances, consolidateByGroup } from '../../domain/balances.ts';
import { localDate } from '../../domain/dates.ts';
import {
  balanceRows,
  expenseRows,
  fileSlug,
  groupRows,
  type BalanceRow,
  type ExpenseRow,
  type GroupRow,
} from '../../domain/exports.ts';
import { toDisplayNumber, type Minor } from '../../domain/money.ts';
import { byPosition } from '../../domain/people.ts';
import {
  percentOf,
  totalsByCategory,
  totalsByMonth,
  totalsByPerson,
  validatedTotal,
} from '../../domain/stats.ts';
import { Avatar } from '../../components/Avatar.tsx';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { toUiError, type UiError } from '../spaces/store.ts';
import { useCurrentSpace } from '../spaces/useCurrentSpace.ts';
import { usePeople, usePeopleOf } from '../people/store.ts';
import { categoryName } from '../expenses/category-label.ts';
import { useExpenses, useExpensesOf } from '../expenses/store.ts';

const soft = { color: 'var(--dwc-text-soft)' } as const;

type ExpenseCol = keyof ExpenseRow;
type BalanceCol = keyof BalanceRow;
type GroupCol = keyof GroupRow;
const EXPENSE_COLS: readonly ExpenseCol[] = [
  'date',
  'label',
  'category',
  'amount',
  'currency',
  'status',
  'payers',
  'beneficiaries',
];
const BALANCE_COLS: readonly BalanceCol[] = [
  'person',
  'paid',
  'owed',
  'sent',
  'received',
  'net',
];
const GROUP_COLS: readonly GroupCol[] = [
  'group',
  'members',
  'paid',
  'owed',
  'net',
];

type ExportKind =
  'expenses-csv' | 'expenses-xlsx' | 'balances-csv' | 'balances-xlsx';

/**
 * LES STATISTIQUES ET LES EXPORTS. Les chiffres viennent du domaine, sur les
 * seules dépenses validées (R11), recalculés à chaque rendu. Les exports —
 * CSV pour Excel français, ou XLSX — chargent les modules du socle À LA
 * DEMANDE : l'écran reste léger, le fichier arrive au clic. Individuel par
 * personne, consolidé par regroupement.
 */
export function StatsScreen() {
  const { t, m, fmt } = useI18n();
  const space = useCurrentSpace();
  usePeopleOf(space?.id);
  useExpensesOf(space?.id);
  const participants = usePeople(state => state.participants);
  const groups = usePeople(state => state.groups);
  const peopleReady = usePeople(state => state.ready);
  const expenses = useExpenses(state => state.expenses);
  const categories = useExpenses(state => state.categories);
  const settlements = useExpenses(state => state.settlements);
  const expensesReady = useExpenses(state => state.ready);
  const error = useExpenses(state => state.error);
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [exportError, setExportError] = useState<UiError | null>(null);

  if (!space) return null;
  if (!peopleReady || !expensesReady) {
    return <SkeletonGroup label={t('expenses.loading')} lines={4} />;
  }
  const money = (minor: Minor) =>
    fmt.currency(toDisplayNumber(minor, space.minorUnit), space.currency);
  const ordered = [...participants].sort(byPosition);
  const personOf = (id: string) => ordered.find(p => p.id === id);
  const nameOf = (id: string) => personOf(id)?.displayName ?? '?';
  const categoryOf = (id: string | null) => {
    if (id === null) return t('stats.noCategory');
    const category = categories.find(c => c.id === id);
    return category ? categoryName(category, t) : '?';
  };
  const statusOf = (status: Expense['status']) =>
    status === 'validated'
      ? t('expenses.validated')
      : status === 'draft'
        ? t('expenses.draft')
        : t('expenses.archived');
  const validated = expenses.filter(e => e.status === 'validated');
  const total = validatedTotal(expenses);
  const byCategory = totalsByCategory(expenses);
  const byMonth = totalsByMonth(expenses);
  const byPerson = totalsByPerson(
    expenses,
    ordered.filter(p => !p.archivedAt).map(p => p.id)
  );
  const lines = computeBalances({
    participantIds: ordered.map(p => p.id),
    expenses: validated,
    settlements,
  });
  const groupLines = consolidateByGroup(
    lines,
    groups
      .filter(g => !g.archivedAt)
      .map(g => ({ id: g.id, memberIds: g.memberIds }))
  );
  const labels = { nameOf, categoryOf, statusOf };
  const header = (keys: readonly (ExpenseCol | BalanceCol | GroupCol)[]) =>
    keys.map(key => t(`stats.col.${key}`));
  const columns = (keys: readonly (ExpenseCol | BalanceCol | GroupCol)[]) =>
    keys.map(key => ({ key, header: t(`stats.col.${key}`) }));
  const filename = (kind: string, extension: string, slug: string) =>
    `mister-settle-${fileSlug(space.name)}-${kind}-${slug}.${extension}`;

  const run = async (kind: ExportKind, job: () => Promise<void>) => {
    setExporting(kind);
    setExportError(null);
    try {
      await job();
    } catch (cause) {
      setExportError(toUiError(cause));
    } finally {
      setExporting(null);
    }
  };
  const exportExpensesCsv = () =>
    run('expenses-csv', async () => {
      const [{ toCsv }, { downloadText, dateSlug }] = await Promise.all([
        import('@mister-guiiug/dev-pwa-config/csv'),
        import('@mister-guiiug/dev-pwa-config/download'),
      ]);
      const rows = expenseRows(validated, space.minorUnit, labels);
      downloadText(
        toCsv(rows, { dialect: 'excel-fr', columns: columns(EXPENSE_COLS) }),
        filename('depenses', 'csv', dateSlug()),
        'text/csv'
      );
    });
  const exportExpensesXlsx = () =>
    run('expenses-xlsx', async () => {
      const [{ buildXlsx, downloadXlsx }, { dateSlug }] = await Promise.all([
        import('@mister-guiiug/dev-pwa-config/xlsx'),
        import('@mister-guiiug/dev-pwa-config/download'),
      ]);
      const rows = expenseRows(validated, space.minorUnit, labels);
      downloadXlsx(
        buildXlsx({
          name: t('stats.sheetExpenses'),
          header: header(EXPENSE_COLS),
          rows: rows.map(row => EXPENSE_COLS.map(key => row[key])),
        }),
        filename('depenses', 'xlsx', dateSlug())
      );
    });
  const exportBalancesCsv = () =>
    run('balances-csv', async () => {
      const [{ toCsv }, { downloadText, dateSlug }] = await Promise.all([
        import('@mister-guiiug/dev-pwa-config/csv'),
        import('@mister-guiiug/dev-pwa-config/download'),
      ]);
      const rows = balanceRows(lines, space.minorUnit, nameOf);
      downloadText(
        toCsv(rows, { dialect: 'excel-fr', columns: columns(BALANCE_COLS) }),
        filename('soldes', 'csv', dateSlug()),
        'text/csv'
      );
    });
  const exportBalancesXlsx = () =>
    run('balances-xlsx', async () => {
      const [{ buildXlsx, downloadXlsx }, { dateSlug }] = await Promise.all([
        import('@mister-guiiug/dev-pwa-config/xlsx'),
        import('@mister-guiiug/dev-pwa-config/download'),
      ]);
      const people = balanceRows(lines, space.minorUnit, nameOf);
      const consolidated = groupRows(groupLines, space.minorUnit, {
        groupOf: id => groups.find(g => g.id === id)?.name ?? '?',
        nameOf,
      });
      downloadXlsx(
        buildXlsx([
          {
            name: t('stats.sheetPeople'),
            header: header(BALANCE_COLS),
            rows: people.map(row => BALANCE_COLS.map(key => row[key])),
          },
          {
            name: t('stats.sheetGroups'),
            header: header(GROUP_COLS),
            rows: consolidated.map(row => GROUP_COLS.map(key => row[key])),
          },
        ]),
        filename('soldes', 'xlsx', dateSlug())
      );
    });

  const exportButton = (
    kind: ExportKind,
    label: string,
    onClick: () => void
  ) => (
    <Button
      variant="outline"
      size="sm"
      loading={exporting === kind}
      aria-disabled={validated.length === 0}
      onClick={() => {
        if (validated.length > 0) onClick();
      }}
    >
      {label}
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      {error ? <ErrorBanner message={<ErrorMessage error={error} />} /> : null}

      {validated.length === 0 ? (
        <EmptyState title={t('stats.empty')} />
      ) : (
        <>
          <Card>
            <dl className="m-0 grid grid-cols-2 gap-3">
              <Stat label={t('stats.total')} value={money(total)} />
              <Stat
                label={t('expenses.title')}
                value={fmt.plural(validated.length, m.stats.count, {
                  count: validated.length,
                })}
              />
            </dl>
          </Card>

          <Card>
            <CardHeader title={t('stats.byCategory')} />
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
              {byCategory.map(line => (
                <li
                  key={line.categoryId ?? 'none'}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {categoryOf(line.categoryId)}
                    <span className="text-xs" style={soft}>
                      {' · '}
                      {fmt.plural(line.count, m.stats.count, {
                        count: line.count,
                      })}
                    </span>
                  </span>
                  <span className="text-xs" style={soft}>
                    {t('stats.share', {
                      percent: percentOf(line.total, total),
                    })}
                  </span>
                  <span className="font-medium">{money(line.total)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title={t('stats.byMonth')} />
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
              {byMonth.map(line => (
                <li
                  key={line.month}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="min-w-0 flex-1 truncate capitalize">
                    {fmt.date(localDate(`${line.month}-01`), {
                      month: 'long',
                      year: 'numeric',
                    })}
                    <span className="text-xs normal-case" style={soft}>
                      {' · '}
                      {fmt.plural(line.count, m.stats.count, {
                        count: line.count,
                      })}
                    </span>
                  </span>
                  <span className="font-medium">{money(line.total)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title={t('stats.byPerson')} />
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
              {byPerson.map(line => {
                const person = personOf(line.participantId);
                return (
                  <li
                    key={line.participantId}
                    className="flex items-center gap-2"
                  >
                    <Avatar
                      size="sm"
                      name={person?.displayName ?? '?'}
                      initials={person?.initials ?? ''}
                      color={person?.avatarColor ?? ''}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {nameOf(line.participantId)}
                    </span>
                    <span className="text-xs" style={soft}>
                      {t('stats.paid', { amount: money(line.paid) })}
                      {' · '}
                      {t('stats.owed', { amount: money(line.owed) })}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}

      <Card>
        <CardHeader
          title={t('stats.exports')}
          subtitle={t('stats.exportsHint')}
        />
        {exportError ? (
          <ErrorBanner
            message={<ErrorMessage error={exportError} />}
            className="mb-3"
          />
        ) : null}
        <div className="flex flex-wrap gap-2">
          {exportButton(
            'expenses-csv',
            t('stats.expensesCsv'),
            () => void exportExpensesCsv()
          )}
          {exportButton(
            'expenses-xlsx',
            t('stats.expensesXlsx'),
            () => void exportExpensesXlsx()
          )}
          {exportButton(
            'balances-csv',
            t('stats.balancesCsv'),
            () => void exportBalancesCsv()
          )}
          {exportButton(
            'balances-xlsx',
            t('stats.balancesXlsx'),
            () => void exportBalancesXlsx()
          )}
        </div>
      </Card>
    </div>
  );
}
