import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@mister-guiiug/dev-pwa-config/react/badge';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { Card } from '@mister-guiiug/dev-pwa-config/react/card';
import { EmptyState } from '@mister-guiiug/dev-pwa-config/react/empty-state';
import { ErrorBanner } from '@mister-guiiug/dev-pwa-config/react/error-banner';
import { SegmentedControl } from '@mister-guiiug/dev-pwa-config/react/segmented-control';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { useI18n } from '../../i18n/index.ts';
import {
  computeBalances,
  consolidateByGroup,
  type BalanceLine,
} from '../../domain/balances.ts';
import { toDisplayNumber, type Minor } from '../../domain/money.ts';
import { byPosition } from '../../domain/people.ts';
import { Avatar } from '../../components/Avatar.tsx';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { useCurrentSpace } from '../spaces/useCurrentSpace.ts';
import { usePeople, usePeopleOf } from '../people/store.ts';
import { useExpenses, useExpensesOf } from '../expenses/store.ts';

const soft = { color: 'var(--dwc-text-soft)' } as const;

/**
 * LES SOLDES : recalculés à chaque rendu depuis les dépenses VALIDÉES et
 * les remboursements déclarés (R11, R17), jamais lus d'une valeur stockée
 * (ADR 0011). Par personne, ou consolidés par regroupement — une lecture,
 * pas une comptabilité (ADR 0012). Une personne archivée reste là tant que
 * son solde n'est pas nul (R16).
 */
export function BalancesScreen() {
  const { t, m, fmt } = useI18n();
  const space = useCurrentSpace();
  usePeopleOf(space?.id);
  useExpensesOf(space?.id);
  const participants = usePeople(state => state.participants);
  const groups = usePeople(state => state.groups);
  const peopleReady = usePeople(state => state.ready);
  const expenses = useExpenses(state => state.expenses);
  const settlements = useExpenses(state => state.settlements);
  const expensesReady = useExpenses(state => state.ready);
  const error = useExpenses(state => state.error);
  const [view, setView] = useState<'people' | 'groups'>('people');

  if (!space) return null;
  if (!peopleReady || !expensesReady) {
    return <SkeletonGroup label={t('expenses.loading')} lines={4} />;
  }
  const money = (minor: Minor) =>
    fmt.currency(toDisplayNumber(minor, space.minorUnit), space.currency);
  const ordered = [...participants].sort(byPosition);
  const validated = expenses.filter(e => e.status === 'validated');
  const lines = computeBalances({
    participantIds: ordered.map(p => p.id),
    expenses: validated,
    settlements,
  });
  const byId = new Map(lines.map(line => [line.participantId, line]));
  const visible = ordered.filter(p => {
    const line = byId.get(p.id);
    return line !== undefined && (!p.archivedAt || line.net !== 0);
  });
  const groupLines = consolidateByGroup(
    lines,
    groups
      .filter(g => !g.archivedAt)
      .map(g => ({ id: g.id, memberIds: g.memberIds }))
  );

  const netBadge = (net: Minor) => (
    <Badge tone={net > 0 ? 'success' : net < 0 ? 'danger' : 'muted'} size="sm">
      {money(net)}
    </Badge>
  );
  const personRow = (line: BalanceLine) => {
    const person = ordered.find(p => p.id === line.participantId);
    if (!person) return null;
    return (
      <li key={line.participantId}>
        <Card className="flex items-center gap-3">
          <Avatar
            name={person.displayName}
            initials={person.initials}
            color={person.avatarColor}
          />
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate font-medium">{person.displayName}</p>
            <p className="m-0 text-xs" style={soft}>
              {t('balances.detail', {
                paid: money(line.paid),
                owed: money(line.owed),
              })}
              {line.sent !== 0 || line.received !== 0
                ? ` · ${t('balances.settled', {
                    sent: money(line.sent),
                    received: money(line.received),
                  })}`
                : ''}
            </p>
          </div>
          {netBadge(line.net)}
        </Card>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-xs" style={soft}>
          {t('balances.hint')}
        </p>
        <Link to={`/e/${space.id}/remboursements`} className="no-underline">
          <Button variant="outline" size="sm">
            {t('balances.settle')}
          </Button>
        </Link>
      </div>

      {error ? <ErrorBanner message={<ErrorMessage error={error} />} /> : null}

      {validated.length === 0 ? (
        <EmptyState
          title={t('balances.empty')}
          description={t('balances.emptyHint')}
          action={
            <Link to={`/e/${space.id}/depenses`} className="no-underline">
              <Button variant="primary">{t('expenses.title')}</Button>
            </Link>
          }
        />
      ) : (
        <>
          <SegmentedControl
            value={view}
            ariaLabel={t('balances.view')}
            fullWidth
            size="sm"
            options={[
              { value: 'people', label: t('balances.people') },
              { value: 'groups', label: t('balances.groups') },
            ]}
            onChange={value =>
              setView(value === 'groups' ? 'groups' : 'people')
            }
          />
          {view === 'people' ? (
            <ul className="settle-liste m-0 flex list-none flex-col gap-2 p-0">
              {visible.map(p => personRow(byId.get(p.id) as BalanceLine))}
            </ul>
          ) : groupLines.length === 0 ? (
            <p className="m-0 text-sm" style={soft}>
              {t('balances.noGroups')}
            </p>
          ) : (
            <>
              <p className="m-0 text-xs" style={soft}>
                {t('balances.groupHint')}
              </p>
              <ul className="settle-liste m-0 flex list-none flex-col gap-2 p-0">
                {groupLines.map(group => {
                  const meta = groups.find(g => g.id === group.groupId);
                  return (
                    <li key={group.groupId}>
                      <Card className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="m-0 truncate font-medium">
                              {meta?.name ?? '?'}
                            </p>
                            <p className="m-0 text-xs" style={soft}>
                              {fmt.plural(
                                group.members.length,
                                m.balances.members,
                                { count: group.members.length }
                              )}
                              {' · '}
                              {t('balances.detail', {
                                paid: money(group.paid),
                                owed: money(group.owed),
                              })}
                            </p>
                          </div>
                          {netBadge(group.net)}
                        </div>
                        <details>
                          <summary
                            className="cursor-pointer text-xs"
                            style={soft}
                          >
                            {t('balances.people')}
                          </summary>
                          <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 text-sm">
                            {group.members.map(member => (
                              <li
                                key={member.participantId}
                                className="flex items-center justify-between gap-2"
                              >
                                <span className="min-w-0 truncate">
                                  {ordered.find(
                                    p => p.id === member.participantId
                                  )?.displayName ?? '?'}
                                </span>
                                <span>{money(member.net)}</span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
