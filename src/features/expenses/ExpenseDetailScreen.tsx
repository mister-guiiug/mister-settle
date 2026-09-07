import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@mister-guiiug/dev-pwa-config/react/badge';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { ConfirmDialog } from '@mister-guiiug/dev-pwa-config/react/confirm-dialog';
import { EmptyState } from '@mister-guiiug/dev-pwa-config/react/empty-state';
import { ErrorBanner } from '@mister-guiiug/dev-pwa-config/react/error-banner';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { Stat } from '@mister-guiiug/dev-pwa-config/react/stat';
import { useI18n } from '../../i18n/index.ts';
import type { Expense, Revision } from '../../backend/ports.ts';
import { localDate } from '../../domain/dates.ts';
import { checkExpense, computeAllocations } from '../../domain/expense.ts';
import { expenseInputFromLines } from '../../domain/expense-form.ts';
import { sharesToDecimalString, toDisplayNumber } from '../../domain/money.ts';
import { Avatar } from '../../components/Avatar.tsx';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { can, useCurrentSpace } from '../spaces/useCurrentSpace.ts';
import { usePeople, usePeopleOf } from '../people/store.ts';
import { categoryName } from './category-label.ts';
import { IssueList } from './IssueList.tsx';
import { AttachmentsCard } from '../attachments/AttachmentsCard.tsx';
import { useExpenses, useExpensesOf } from './store.ts';

const soft = { color: 'var(--dwc-text-soft)' } as const;

/**
 * LE DÉTAIL D'UNE DÉPENSE : ce qui a été enregistré, et ce que ça vaut par
 * personne. Pour une dépense validée, les allocations sont celles que la
 * base a ÉCRITES ; pour un brouillon, un aperçu recalculé — marqué comme tel,
 * jamais compté (R11). Les gestes : valider, modifier, dupliquer, archiver,
 * supprimer un brouillon ; l'historique des révisions se déplie (R12).
 */
export function ExpenseDetailScreen() {
  const { t, fmt } = useI18n();
  const space = useCurrentSpace();
  const { expenseId } = useParams();
  const navigate = useNavigate();
  usePeopleOf(space?.id);
  useExpensesOf(space?.id);
  const participants = usePeople(state => state.participants);
  const groups = usePeople(state => state.groups);
  const expenses = useExpenses(state => state.expenses);
  const categories = useExpenses(state => state.categories);
  const ready = useExpenses(state => state.ready);
  const error = useExpenses(state => state.error);
  const archive = useExpenses(state => state.archive);
  const remove = useExpenses(state => state.remove);
  const loadRevisions = useExpenses(state => state.revisions);
  const [confirming, setConfirming] = useState(false);
  const [history, setHistory] = useState<Revision[] | null>(null);
  const [busy, setBusy] = useState(false);

  if (!space) return null;
  const listPath = `/e/${space.id}/depenses`;
  if (!ready) return <SkeletonGroup label={t('expenses.loading')} lines={4} />;
  const expense = expenses.find(e => e.id === expenseId);
  if (!expense) {
    return (
      <EmptyState
        title={t('expense.notFound')}
        action={
          <Link to={listPath} className="no-underline">
            <Button variant="outline">{t('expense.backToList')}</Button>
          </Link>
        }
      />
    );
  }

  const rights = can(space.myRole);
  const editable =
    rights.contribute && !space.archivedAt && expense.status !== 'archived';
  const nameOf = (id: string) =>
    participants.find(p => p.id === id)?.displayName ?? '?';
  const avatarOf = (id: string) => {
    const person = participants.find(p => p.id === id);
    return (
      <Avatar
        size="sm"
        name={person?.displayName ?? '?'}
        initials={person?.initials ?? ''}
        color={person?.avatarColor ?? ''}
      />
    );
  };
  const money = (minor: number) =>
    fmt.currency(toDisplayNumber(minor, space.minorUnit), space.currency);
  const category = categories.find(c => c.id === expense.categoryId);
  const subcategory = categories.find(c => c.id === expense.subcategoryId);
  const domainInput = expenseInputFromLines(expense);
  const issues = expense.status === 'draft' ? checkExpense(domainInput) : [];
  const allocations =
    expense.status === 'validated'
      ? expense.allocations
      : (computeAllocations(domainInput) ?? []);
  const groupNames =
    expense.groupSnapshots.length > 0
      ? expense.groupSnapshots.map(s => s.groupName)
      : expense.selectedGroupIds.map(
          id => groups.find(g => g.id === id)?.name ?? '?'
        );

  const toggleArchive = async () => {
    setBusy(true);
    await archive(expense.id, expense.status !== 'archived', expense.version);
    setBusy(false);
  };
  const destroy = async () => {
    setConfirming(false);
    const done = await remove(expense.id);
    if (done) void navigate(listPath, { replace: true });
  };
  const showHistory = async () => {
    setHistory(await loadRevisions(expense.id));
  };

  return (
    <div className="flex flex-col gap-4">
      {error ? <ErrorBanner message={<ErrorMessage error={error} />} /> : null}
      {expense.status === 'draft' ? (
        <ErrorBanner tone="warning" message={t('expense.draftBanner')} />
      ) : null}
      {expense.status === 'archived' ? (
        <ErrorBanner tone="info" message={t('expense.archivedBanner')} />
      ) : null}

      <Card>
        <CardHeader
          title={expense.label}
          subtitle={`${fmt.date(localDate(expense.spentOn))}${
            category ? ` · ${categoryName(category, t)}` : ''
          }${subcategory ? ` › ${subcategory.name}` : ''}`}
          action={<StatusBadge expense={expense} />}
        />
        <dl className="m-0 grid grid-cols-2 gap-3">
          <Stat label={t('expense.amount')} value={money(expense.amount)} />
          <Stat
            label={t('expense.payers')}
            value={fmt.list(expense.payers.map(p => nameOf(p.participantId)))}
          />
        </dl>
        {expense.payers.length > 1 ? (
          <ul className="m-0 mt-3 flex list-none flex-col gap-1 p-0 text-sm">
            {expense.payers.map(payer => (
              <li key={payer.participantId} className="flex items-center gap-2">
                {avatarOf(payer.participantId)}
                <span className="min-w-0 flex-1 truncate">
                  {nameOf(payer.participantId)}
                </span>
                <span>{money(payer.amount)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {expense.note ? (
          <p className="m-0 mt-3 whitespace-pre-wrap text-sm">{expense.note}</p>
        ) : null}
        {expense.validatedAt ? (
          <p className="m-0 mt-3 text-xs" style={soft}>
            {t('expense.validatedOn', {
              date: fmt.dateTime(expense.validatedAt),
            })}
          </p>
        ) : null}
      </Card>

      <IssueList
        issues={issues}
        participants={participants}
        currency={space.currency}
        minorUnit={space.minorUnit}
      />

      <Card>
        <CardHeader
          title={t('expense.beneficiaries')}
          subtitle={t(`expense.method.${expense.splitMethod}`)}
        />
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
          {expense.beneficiaries.map(line => {
            const allocation = allocations.find(
              a => a.participantId === line.participantId
            );
            const via = line.viaGroupId
              ? (expense.groupSnapshots.find(s => s.groupId === line.viaGroupId)
                  ?.groupName ??
                groups.find(g => g.id === line.viaGroupId)?.name)
              : null;
            return (
              <li key={line.participantId} className="flex items-center gap-2">
                {avatarOf(line.participantId)}
                <span className="min-w-0 flex-1 truncate">
                  {nameOf(line.participantId)}
                  {via ? (
                    <span className="text-xs" style={soft}>
                      {' '}
                      {t('wizard.viaGroup', { group: via })}
                    </span>
                  ) : null}
                </span>
                {line.shares !== null && Number.isFinite(line.shares) ? (
                  <span className="text-xs" style={soft}>
                    {t('expense.shares', {
                      shares: sharesToDecimalString(line.shares),
                    })}
                  </span>
                ) : null}
                <span className="font-medium">
                  {allocation ? money(allocation.amount) : '—'}
                </span>
              </li>
            );
          })}
        </ul>
        {groupNames.length > 0 ? (
          <p className="m-0 mt-3 text-xs" style={soft}>
            {t('expense.groupsUsed')} : {fmt.list(groupNames)}
          </p>
        ) : null}
      </Card>

      <AttachmentsCard
        spaceId={space.id}
        parent={{ expenseId: expense.id }}
        editable={editable}
      />

      {!rights.contribute ? (
        <p className="m-0 text-xs" style={soft}>
          {t('expense.contributorOnly')}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {editable && expense.status === 'draft' ? (
          <Link
            to={`${listPath}/${expense.id}/repartition`}
            className="no-underline"
          >
            <Button variant="primary">{t('expense.validate')}</Button>
          </Link>
        ) : null}
        {editable ? (
          <Link
            to={`${listPath}/${expense.id}/modifier`}
            className="no-underline"
          >
            <Button variant="outline">{t('expense.edit')}</Button>
          </Link>
        ) : null}
        {rights.contribute && !space.archivedAt ? (
          <Link
            to={`${listPath}/nouvelle?depuis=${expense.id}`}
            className="no-underline"
          >
            <Button variant="outline">{t('expense.duplicate')}</Button>
          </Link>
        ) : null}
        {rights.contribute && !space.archivedAt ? (
          <Button
            variant="outline"
            loading={busy}
            onClick={() => void toggleArchive()}
          >
            {expense.status === 'archived'
              ? t('expense.unarchive')
              : t('expense.archive')}
          </Button>
        ) : null}
        {editable && expense.status === 'draft' ? (
          <Button variant="danger" onClick={() => setConfirming(true)}>
            {t('expense.remove')}
          </Button>
        ) : null}
      </div>

      <div>
        {history === null ? (
          <Button variant="ghost" size="sm" onClick={() => void showHistory()}>
            {t('expense.history')}
          </Button>
        ) : (
          <Card>
            <CardHeader title={t('expense.history')} />
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
              {history.map(revision => (
                <li key={revision.id}>
                  {t('expense.revision', {
                    version: revision.version,
                    reason: reasonLabel(revision.reason, t),
                    date: fmt.dateTime(revision.changedAt),
                  })}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        destructive
        title={t('expense.removeConfirm', { label: expense.label })}
        message={t('expense.removeBody')}
        onConfirm={() => void destroy()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

const REASONS = [
  'created',
  'saved',
  'validated',
  'archived',
  'unarchived',
] as const;
type Reason = (typeof REASONS)[number];
const isReason = (reason: string): reason is Reason =>
  (REASONS as readonly string[]).includes(reason);

/** Le motif d'une révision, traduit quand il est connu, tel quel sinon. */
function reasonLabel(
  reason: string,
  t: (key: `expense.reasons.${Reason}`) => string
): string {
  return isReason(reason) ? t(`expense.reasons.${reason}`) : reason;
}

function StatusBadge({ expense }: { expense: Expense }) {
  const { t } = useI18n();
  if (expense.status === 'draft') {
    return (
      <Badge tone="warning" size="sm">
        {t('expenses.draft')}
      </Badge>
    );
  }
  if (expense.status === 'archived') {
    return (
      <Badge tone="muted" size="sm">
        {t('expenses.archived')}
      </Badge>
    );
  }
  return (
    <Badge tone="success" size="sm">
      {t('expenses.validated')}
    </Badge>
  );
}
