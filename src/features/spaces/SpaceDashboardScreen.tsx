import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { Badge } from '@mister-guiiug/dev-pwa-config/react/badge';
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
import { toDisplayNumber } from '../../domain/money.ts';
import { spaceSummaryOf } from './space-summary.ts';
import { useCurrentSpace, useMyUserId } from './useCurrentSpace.ts';

interface Overview {
  participants: Participant[];
  expenses: Expense[];
  settlements: Settlement[];
}

/**
 * LE TABLEAU DE BORD Ledger : mon solde en héros, le prochain geste
 * (remboursements), puis ce qu'il reste à traiter. Les chiffres viennent du
 * domaine, jamais d'une valeur stockée (ADR 0011).
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
  const drafts = overview.expenses
    .filter(e => e.status === 'draft')
    .slice()
    .sort(
      (a, b) =>
        b.spentOn.localeCompare(a.spentOn) || b.label.localeCompare(a.label)
    );
  const total = validated.reduce((sum, e) => sum + e.amount, 0);
  const summary = spaceSummaryOf({
    participants: overview.participants,
    expenses: overview.expenses,
    settlements: overview.settlements,
    myUserId: me,
  });
  const money = (minor: number) =>
    fmt.currency(toDisplayNumber(minor, space.minorUnit), space.currency);
  const net = summary.myNet;
  const balanceTone =
    net === null || net === 0 ? 'flat' : net > 0 ? 'up' : 'down';
  const balanceHint =
    net === null
      ? t('space.noMe')
      : net > 0
        ? t('space.owedToYou')
        : net < 0
          ? t('space.youOwe')
          : t('space.settled');

  return (
    <div className="flex flex-col gap-4">
      <div className="settle-hero">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="m-0 settle-hero-muted text-sm">
              {space.icon ? (
                <span aria-hidden="true" className="mr-1">
                  {space.icon}
                </span>
              ) : null}
              {space.name}
            </p>
            <p className="m-0 mt-1 text-sm settle-hero-muted">
              {t('space.myBalance')}
            </p>
            <p className="settle-amount-lg m-0 mt-1" data-tone={balanceTone}>
              {net === null ? '—' : money(net)}
            </p>
            <p className="m-0 mt-1 text-xs settle-hero-muted">{balanceHint}</p>
          </div>
        </div>
        {net !== null && net !== 0 ? (
          <Link
            to={`/e/${space.id}/remboursements`}
            className="no-underline self-start"
          >
            <Button
              variant="primary"
              size="sm"
              style={{
                background: 'var(--settle-header-fg)',
                color: 'var(--settle-header-bg)',
              }}
            >
              {t('space.settleCta')}
            </Button>
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <Stat label={t('space.total')} value={money(total)} />
        </Card>
        <Card>
          <Stat
            label={t('nav.people')}
            value={String(
              overview.participants.filter(p => !p.archivedAt).length
            )}
          />
        </Card>
      </div>

      <Card>
        <ul className="m-0 list-none p-0 text-sm">
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

      {drafts.length > 0 ? (
        <section>
          <CardHeader title={t('space.todo')} />
          <ul className="settle-liste m-0 mt-2 flex list-none flex-col gap-2 p-0">
            {drafts.slice(0, 5).map(expense => (
              <li key={expense.id}>
                <Link
                  to={`/e/${space.id}/depenses/${expense.id}`}
                  aria-label={t('space.openDraft', { label: expense.label })}
                  className="block no-underline text-inherit"
                >
                  <Card className="flex items-center gap-3 settle-row-dense">
                    <div className="min-w-0 flex-1">
                      <p className="m-0 truncate font-medium">
                        {expense.label}
                      </p>
                      <p
                        className="m-0 text-xs"
                        style={{ color: 'var(--dwc-text-soft)' }}
                      >
                        {money(expense.amount)}
                      </p>
                    </div>
                    <Badge tone="warning" size="xs">
                      {t('expenses.draft')}
                    </Badge>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
