import { useEffect, useState } from 'react';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { Stat } from '@mister-guiiug/dev-pwa-config/react/stat';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { useI18n } from '../../i18n/index.ts';
import { backend } from '../../backend/index.ts';
import type {
  Expense,
  Participant,
  Settlement,
  Space,
} from '../../backend/ports.ts';
import { computeBalances } from '../../domain/balances.ts';
import { toDisplayNumber } from '../../domain/money.ts';
import { useCurrentSpace, useMyUserId } from './useCurrentSpace.ts';

interface Overview {
  participants: Participant[];
  expenses: Expense[];
  settlements: Settlement[];
}

/**
 * LE TABLEAU DE BORD : ce que je dois savoir en ouvrant l'espace — mon
 * solde, ce qui a été dépensé, combien de personnes. Les chiffres viennent du
 * domaine (`computeBalances`), jamais d'une valeur stockée (ADR 0011).
 */
export function SpaceDashboardScreen() {
  const { t, m, fmt } = useI18n();
  const space = useCurrentSpace();
  const me = useMyUserId();
  const [overview, setOverview] = useState<Overview | null>(null);

  useEffect(() => {
    if (!space) return;
    let cancelled = false;
    void Promise.all([
      backend.participants.list(space.id),
      backend.expenses.list(space.id),
      backend.settlements.list(space.id),
    ]).then(([participants, expenses, settlements]) => {
      if (!cancelled) setOverview({ participants, expenses, settlements });
    });
    return () => {
      cancelled = true;
    };
  }, [space]);

  if (!space) return null;
  if (!overview) return <SkeletonGroup label={t('space.loading')} lines={4} />;

  return (
    <Dashboard
      space={space}
      overview={overview}
      me={me}
      t={t}
      m={m}
      fmt={fmt}
    />
  );
}

function Dashboard({
  space,
  overview,
  me,
  t,
  m,
  fmt,
}: {
  space: Space;
  overview: Overview;
  me: string | null;
  t: ReturnType<typeof useI18n>['t'];
  m: ReturnType<typeof useI18n>['m'];
  fmt: ReturnType<typeof useI18n>['fmt'];
}) {
  const validated = overview.expenses.filter(e => e.status === 'validated');
  const drafts = overview.expenses.filter(e => e.status === 'draft');
  const total = validated.reduce((sum, e) => sum + e.amount, 0);
  const balances = computeBalances({
    participantIds: overview.participants.map(p => p.id),
    expenses: validated,
    settlements: overview.settlements,
  });
  const myParticipant = overview.participants.find(p => p.linkedUserId === me);
  const mine = balances.find(b => b.participantId === myParticipant?.id);
  const money = (minor: number) =>
    fmt.currency(toDisplayNumber(minor, space.minorUnit), space.currency);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              {space.icon ? <span aria-hidden="true">{space.icon}</span> : null}
              {space.name}
            </span>
          }
          subtitle={space.description || space.currency}
        />
        <dl className="m-0 grid grid-cols-2 gap-3">
          <Stat
            label={t('space.myBalance')}
            value={mine ? money(mine.net) : '—'}
            trend={
              mine
                ? mine.net > 0
                  ? 'up'
                  : mine.net < 0
                    ? 'down'
                    : 'flat'
                : 'flat'
            }
            trendLabel={t('space.myBalanceHint')}
          />
          <Stat label={t('space.total')} value={money(total)} />
        </dl>
        {!myParticipant ? (
          <p
            className="m-0 mt-3 text-sm"
            style={{ color: 'var(--dwc-text-soft)' }}
          >
            {t('space.noMe')}
          </p>
        ) : null}
      </Card>

      <Card>
        <ul className="m-0 list-none p-0 text-sm">
          <li className="py-1">
            {fmt.plural(
              overview.participants.filter(p => !p.archivedAt).length,
              m.space.people,
              {
                count: overview.participants.filter(p => !p.archivedAt).length,
              }
            )}
          </li>
          <li className="py-1">
            {fmt.plural(validated.length, m.space.expenses, {
              count: validated.length,
            })}
          </li>
          {drafts.length > 0 ? (
            <li className="py-1">
              {fmt.plural(drafts.length, m.space.drafts, {
                count: drafts.length,
              })}
            </li>
          ) : null}
        </ul>
      </Card>
    </div>
  );
}
