import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { Card } from '@mister-guiiug/dev-pwa-config/react/card';
import { Badge } from '@mister-guiiug/dev-pwa-config/react/badge';
import { EmptyState } from '@mister-guiiug/dev-pwa-config/react/empty-state';
import { ErrorBanner } from '@mister-guiiug/dev-pwa-config/react/error-banner';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { AppFooter } from '@mister-guiiug/dev-pwa-config/react/app-footer';
import { useAuthContext } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { useI18n } from '../../i18n/index.ts';
import { REPO_URL } from '../../app/links.ts';
import { backend, isRemote } from '../../backend/index.ts';
import type { Space } from '../../backend/ports.ts';
import { localDate } from '../../domain/dates.ts';
import { toDisplayNumber } from '../../domain/money.ts';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { Fab } from '../../components/Fab.tsx';
import { spaceSummaryOf, type SpaceSummary } from './space-summary.ts';
import { useSpaces } from './store.ts';
import { useMyUserId } from './useCurrentSpace.ts';

/**
 * L'ACCUEIL Ledger : cartes avec solde perso + dernière activité, bandeau
 * « Attention » pour les brouillons. Pied de page famille (pwa-doctor).
 */
export function HomeScreen() {
  const { t, m, fmt } = useI18n();
  const { signedIn, ready: authReady } = useAuthContext();
  const me = useMyUserId();
  const spaces = useSpaces(state => state.spaces);
  const ready = useSpaces(state => state.ready);
  const error = useSpaces(state => state.error);
  const load = useSpaces(state => state.load);
  const navigate = useNavigate();
  const createSpace = () => void navigate('/espaces/nouveau');
  const needsSignIn = isRemote && authReady && !signedIn;
  const canLoad = !isRemote || (authReady && signedIn);
  const [summaries, setSummaries] = useState<Record<string, SpaceSummary>>({});

  useEffect(() => {
    if (canLoad) void load();
  }, [canLoad, load]);

  const open = spaces.filter(s => !s.archivedAt);
  const archived = spaces.filter(s => s.archivedAt);
  const openIds = open.map(s => s.id).join(',');

  useEffect(() => {
    if (!ready || openIds === '') {
      setSummaries({});
      return;
    }
    const ids = openIds.split(',');
    let cancelled = false;
    void Promise.all(
      ids.map(async id => {
        const [participants, expenses, settlements] = await Promise.all([
          backend.participants.list(id),
          backend.expenses.list(id),
          backend.settlements.list(id),
        ]);
        return [
          id,
          spaceSummaryOf({
            participants,
            expenses,
            settlements,
            myUserId: me,
          }),
        ] as const;
      })
    ).then(entries => {
      if (!cancelled) setSummaries(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [ready, openIds, me]);

  const draftTotal = Object.values(summaries).reduce(
    (sum, s) => sum + s.drafts,
    0
  );

  if (needsSignIn) {
    return (
      <>
        <p className="m-0 text-base">{t('spaces.pitch')}</p>
        <EmptyState
          title={t('spaces.signInTitle')}
          description={t('spaces.signInBody')}
          className="mt-8"
          action={
            <Link to="/compte" className="no-underline">
              <Button variant="primary">{t('spaces.signInAction')}</Button>
            </Link>
          }
        />
        <AppFooter repoUrl={REPO_URL} issues className="mt-8" />
      </>
    );
  }

  return (
    <>
      <p className="m-0 text-sm" style={{ color: 'var(--dwc-text-soft)' }}>
        {ready
          ? fmt.plural(open.length, m.spaces.count, { count: open.length })
          : ''}
      </p>

      {error ? (
        <ErrorBanner
          message={<ErrorMessage error={error} />}
          className="mt-4"
        />
      ) : null}

      {draftTotal > 0 ? (
        <Card className="mt-4">
          <p
            className="m-0 text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--dwc-text-soft)' }}
          >
            {t('spaces.attention')}
          </p>
          <p className="m-0 mt-1 font-medium">
            {fmt.plural(draftTotal, m.spaces.attentionDrafts, {
              count: draftTotal,
            })}
          </p>
        </Card>
      ) : null}

      {!ready ? (
        <SkeletonGroup label={t('spaces.loading')} lines={3} className="mt-6" />
      ) : open.length === 0 ? (
        <EmptyState
          title={t('spaces.empty')}
          description={t('spaces.emptyHint')}
          className="mt-8"
          action={
            <Button variant="primary" onClick={createSpace}>
              {t('spaces.create')}
            </Button>
          }
        />
      ) : (
        <ul className="mt-4 flex list-none flex-col gap-2 p-0 settle-liste">
          {open.map(space => (
            <SpaceRow
              key={space.id}
              space={space}
              summary={summaries[space.id] ?? null}
              draftsLabel={m.space.drafts}
            />
          ))}
        </ul>
      )}

      {archived.length > 0 ? (
        <details className="mt-8">
          <summary
            className="cursor-pointer text-sm"
            style={{ color: 'var(--dwc-text-soft)' }}
          >
            {t('spaces.archived')} ({archived.length})
          </summary>
          <ul className="mt-2 flex list-none flex-col gap-2 p-0">
            {archived.map(space => (
              <SpaceRow key={space.id} space={space} summary={null} />
            ))}
          </ul>
        </details>
      ) : null}

      <AppFooter repoUrl={REPO_URL} issues className="mt-8" />
      <Fab to="/espaces/nouveau" label={t('spaces.create')} />
    </>
  );
}

function SpaceRow({
  space,
  summary,
  draftsLabel,
}: {
  space: Space;
  summary: SpaceSummary | null;
  draftsLabel?: { one: string; other: string };
}) {
  const { t, fmt } = useI18n();
  const money =
    summary?.myNet === null || summary?.myNet === undefined
      ? null
      : fmt.currency(
          toDisplayNumber(summary.myNet, space.minorUnit),
          space.currency
        );
  const activity =
    summary === null
      ? space.currency
      : summary.lastSpentOn
        ? t('spaces.lastActivity', {
            date: fmt.date(localDate(summary.lastSpentOn)),
          })
        : t('spaces.noActivity');
  const netTone =
    summary?.myNet == null || summary.myNet === 0
      ? undefined
      : summary.myNet > 0
        ? 'var(--dwc-success)'
        : 'var(--dwc-danger)';
  const draftBit =
    summary && summary.drafts > 0 && draftsLabel
      ? ` · ${fmt.plural(summary.drafts, draftsLabel, {
          count: summary.drafts,
        })}`
      : '';

  return (
    <li>
      <Link
        to={`/e/${space.id}`}
        aria-label={t('spaces.open', { name: space.name })}
        className="block no-underline text-inherit"
      >
        <Card className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl"
            style={{ background: space.color || 'var(--dwc-surface-2)' }}
          >
            {space.icon || space.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate font-medium">{space.name}</p>
            <p
              className="m-0 truncate text-xs"
              style={{ color: 'var(--dwc-text-soft)' }}
            >
              {activity}
              {draftBit}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {money !== null ? (
              <span
                className="settle-amount"
                style={netTone ? { color: netTone } : undefined}
              >
                {money}
              </span>
            ) : null}
            {space.myRole ? (
              <Badge
                tone={space.myRole === 'reader' ? 'muted' : 'brand'}
                size="xs"
              >
                {t(`spaces.role.${space.myRole}`)}
              </Badge>
            ) : null}
          </div>
        </Card>
      </Link>
    </li>
  );
}
