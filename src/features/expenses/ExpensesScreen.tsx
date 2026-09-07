import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Badge } from '@mister-guiiug/dev-pwa-config/react/badge';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { Card } from '@mister-guiiug/dev-pwa-config/react/card';
import { EmptyState } from '@mister-guiiug/dev-pwa-config/react/empty-state';
import { ErrorBanner } from '@mister-guiiug/dev-pwa-config/react/error-banner';
import {
  SelectField,
  TextField,
} from '@mister-guiiug/dev-pwa-config/react/field';
import { SegmentedControl } from '@mister-guiiug/dev-pwa-config/react/segmented-control';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { useI18n } from '../../i18n/index.ts';
import type { Expense } from '../../backend/ports.ts';
import { localDate } from '../../domain/dates.ts';
import { toDisplayNumber } from '../../domain/money.ts';
import { byPosition } from '../../domain/people.ts';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { can, useCurrentSpace } from '../spaces/useCurrentSpace.ts';
import { usePeople, usePeopleOf } from '../people/store.ts';
import { categoryName } from './category-label.ts';
import { useExpenses, useExpensesOf } from './store.ts';

type StatusFilter = 'all' | 'draft' | 'validated';
const soft = { color: 'var(--dwc-text-soft)' } as const;

/**
 * LA LISTE DES DÉPENSES : les plus récentes d'abord, les brouillons marqués
 * — visibles, jamais comptés (R11) —, les archivées repliées. Recherche et
 * filtres se combinent, sur l'appareil : la liste est déjà là.
 */
export function ExpensesScreen() {
  const { t, m, fmt } = useI18n();
  const space = useCurrentSpace();
  const navigate = useNavigate();
  usePeopleOf(space?.id);
  useExpensesOf(space?.id);
  const participants = usePeople(state => state.participants);
  const expenses = useExpenses(state => state.expenses);
  const categories = useExpenses(state => state.categories);
  const ready = useExpenses(state => state.ready);
  const error = useExpenses(state => state.error);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [personId, setPersonId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [query, setQuery] = useState('');

  if (!space) return null;
  const rights = can(space.myRole);
  const editable = rights.contribute && !space.archivedAt;
  const people = participants.filter(p => !p.archivedAt).sort(byPosition);
  const needle = query.trim().toLowerCase();
  const matches = (expense: Expense) =>
    (status === 'all' || expense.status === status) &&
    (!personId ||
      expense.payers.some(p => p.participantId === personId) ||
      expense.beneficiaries.some(b => b.participantId === personId)) &&
    (!categoryId ||
      expense.categoryId === categoryId ||
      expense.subcategoryId === categoryId) &&
    (!needle ||
      expense.label.toLowerCase().includes(needle) ||
      expense.note.toLowerCase().includes(needle));
  const live = expenses.filter(e => e.status !== 'archived').filter(matches);
  const archived = expenses
    .filter(e => e.status === 'archived')
    .filter(matches);
  const filtering = status !== 'all' || personId || categoryId || needle;
  const nameOf = (id: string) =>
    participants.find(p => p.id === id)?.displayName ?? '?';
  const money = (minor: number) =>
    fmt.currency(toDisplayNumber(minor, space.minorUnit), space.currency);

  const row = (expense: Expense) => {
    const category = categories.find(
      c => c.id === (expense.subcategoryId ?? expense.categoryId)
    );
    return (
      <li key={expense.id}>
        <Link
          to={`/e/${space.id}/depenses/${expense.id}`}
          aria-label={t('expenses.open', { label: expense.label })}
          className="block no-underline text-inherit"
        >
          <Card className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate font-medium">{expense.label}</p>
              <p className="m-0 truncate text-xs" style={soft}>
                {fmt.date(localDate(expense.spentOn))} ·{' '}
                {t('expenses.paidBy', {
                  names: fmt.list(
                    expense.payers.map(p => nameOf(p.participantId))
                  ),
                })}
                {category ? ` · ${categoryName(category, t)}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="font-semibold">{money(expense.amount)}</span>
              {expense.status === 'draft' ? (
                <Badge tone="warning" size="xs">
                  {t('expenses.draft')}
                </Badge>
              ) : expense.status === 'archived' ? (
                <Badge tone="muted" size="xs">
                  {t('expenses.archived')}
                </Badge>
              ) : null}
            </div>
          </Card>
        </Link>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="m-0 text-sm" style={soft}>
          {ready
            ? fmt.plural(live.length, m.expenses.count, { count: live.length })
            : ''}
        </p>
        {editable ? (
          <Button
            variant="primary"
            onClick={() => void navigate(`/e/${space.id}/depenses/nouvelle`)}
          >
            <Plus size={18} aria-hidden="true" />
            {t('expenses.add')}
          </Button>
        ) : null}
      </div>

      {!rights.contribute ? (
        <p className="m-0 text-xs" style={soft}>
          {t('expenses.readerHint')}
        </p>
      ) : null}

      {error ? <ErrorBanner message={<ErrorMessage error={error} />} /> : null}

      {ready && expenses.length > 0 ? (
        <Card className="flex flex-col gap-3">
          <TextField
            label={t('expenses.search')}
            placeholder={t('expenses.searchPlaceholder')}
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
          <SegmentedControl
            value={status}
            ariaLabel={t('expenses.statusLabel')}
            fullWidth
            size="sm"
            options={(['all', 'draft', 'validated'] as const).map(value => ({
              value,
              label: t(`expenses.status.${value}`),
            }))}
            onChange={value =>
              setStatus(
                value === 'draft' || value === 'validated' ? value : 'all'
              )
            }
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SelectField
              label={t('expenses.person')}
              value={personId}
              onChange={event => setPersonId(event.target.value)}
            >
              <option value="">{t('expenses.anyone')}</option>
              {people.map(p => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={t('expenses.category')}
              value={categoryId}
              onChange={event => setCategoryId(event.target.value)}
            >
              <option value="">{t('expenses.anyCategory')}</option>
              {categories
                .filter(c => !c.archivedAt)
                .map(c => (
                  <option key={c.id} value={c.id}>
                    {c.parentId ? '— ' : ''}
                    {categoryName(c, t)}
                  </option>
                ))}
            </SelectField>
          </div>
        </Card>
      ) : null}

      {!ready ? (
        <SkeletonGroup label={t('expenses.loading')} lines={4} />
      ) : expenses.length === 0 ? (
        <EmptyState
          title={t('expenses.empty')}
          description={t('expenses.emptyHint')}
          {...(editable
            ? {
                action: (
                  <Button
                    variant="primary"
                    onClick={() =>
                      void navigate(`/e/${space.id}/depenses/nouvelle`)
                    }
                  >
                    {t('expenses.add')}
                  </Button>
                ),
              }
            : {})}
        />
      ) : live.length === 0 && filtering ? (
        <p className="m-0 text-sm" style={soft}>
          {t('expenses.noMatch')}
        </p>
      ) : (
        <ul className="settle-liste m-0 flex list-none flex-col gap-2 p-0">
          {live.map(row)}
        </ul>
      )}

      {archived.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-sm" style={soft}>
            {t('expenses.archivedList')} ({archived.length})
          </summary>
          <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
            {archived.map(row)}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
