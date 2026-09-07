import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { SyncQueueEntry } from '@mister-guiiug/dev-pwa-config/sync-queue';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { Card, CardHeader } from '@mister-guiiug/dev-pwa-config/react/card';
import { SyncStatusBadge } from '@mister-guiiug/dev-pwa-config/react/sync-status-badge';
import { useI18n } from '../../i18n/index.ts';
import { isRemote } from '../../backend/index.ts';
import {
  dropDeadLetter,
  expenseQueue,
  type QueuedExpense,
} from '../../backend/sync.ts';
import { syncStatusOf, useSyncState } from '../../backend/sync-state.ts';
import type { ExpenseForm } from '../../domain/expense-form.ts';
import { writeDraft } from '../expenses/draft-store.ts';
import { useSpaces } from '../spaces/store.ts';

const soft = { color: 'var(--dwc-text-soft)' } as const;

/**
 * LA PAGE HORS LIGNE (`/hors-ligne`) : ce que l'application fait sans réseau,
 * ce qu'elle garde pour plus tard, et ce que la base a refusé. Une lettre
 * morte s'EXPLIQUE, avec deux issues (ADR 0015) : la rouvrir dans
 * l'assistant — le brouillon local reprend le formulaire tel qu'il était —
 * ou l'abandonner. Sur l'appareil seul, rien n'attend jamais.
 */
export function OfflineScreen() {
  const { t, fmt } = useI18n();
  const navigate = useNavigate();
  const online = useSyncState(state => state.online);
  const pending = useSyncState(state => state.pending);
  const dead = useSyncState(state => state.dead);
  const staleAt = useSyncState(state => state.staleAt);
  const spaces = useSpaces(state => state.spaces);
  const loadSpaces = useSpaces(state => state.load);
  const [, bump] = useState(0);

  useEffect(() => {
    void loadSpaces();
  }, [loadSpaces]);

  const queue = isRemote ? expenseQueue() : null;
  const entries: SyncQueueEntry<QueuedExpense>[] = queue ? queue.list() : [];
  const deadLetters: SyncQueueEntry<QueuedExpense>[] = queue
    ? queue.deadLetters()
    : [];
  const spaceName = (id: string) =>
    spaces.find(space => space.id === id)?.name ?? '?';
  const labels = {
    synced: t('sync.status.synced'),
    pending: t('sync.status.pending'),
    offline: t('sync.status.offline'),
    error: t('sync.status.error'),
  };
  const line = (entry: SyncQueueEntry<QueuedExpense>) =>
    t('offline.entry', {
      label: entry.payload.label,
      space: spaceName(entry.payload.spaceId),
      when: fmt.relative(entry.enqueuedAt),
    });

  const reopen = (entry: SyncQueueEntry<QueuedExpense>) => {
    const form = entry.payload.form;
    if (form && typeof form === 'object') {
      writeDraft({ ...(form as ExpenseForm), id: null });
    }
    dropDeadLetter(entry.id);
    bump(n => n + 1);
    void navigate(`/e/${entry.payload.spaceId}/depenses/nouvelle`);
  };
  const drop = (entry: SyncQueueEntry<QueuedExpense>, dead: boolean) => {
    if (dead) dropDeadLetter(entry.id);
    else queue?.remove(entry.id);
    bump(n => n + 1);
  };
  const retry = () => {
    if (!queue) return;
    queue.requeueDead();
    void queue.flush();
    bump(n => n + 1);
  };

  const list = (
    items: SyncQueueEntry<QueuedExpense>[],
    actions: (entry: SyncQueueEntry<QueuedExpense>) => ReactNode
  ) =>
    items.length === 0 ? (
      <p className="m-0 text-sm" style={soft}>
        {t('offline.none')}
      </p>
    ) : (
      <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
        {items.map(entry => (
          <li key={entry.id} className="flex flex-col gap-1">
            <span>{line(entry)}</span>
            {entry.lastError ? (
              <span className="text-xs" style={soft}>
                {t('offline.reason', { error: entry.lastError })}
              </span>
            ) : null}
            <div className="flex flex-wrap gap-2">{actions(entry)}</div>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title={t('offline.title')}
          subtitle={t('offline.intro')}
          action={
            <SyncStatusBadge
              status={syncStatusOf({ online, pending, dead })}
              pending={pending}
              labels={labels}
            />
          }
        />
        {staleAt ? (
          <p className="m-0 text-sm" style={soft}>
            {t('sync.staleBanner', { date: fmt.dateTime(staleAt) })}
          </p>
        ) : null}
      </Card>

      <Card>
        <CardHeader title={t('offline.works')} />
        <ul className="m-0 pl-4 text-sm">
          <li>{t('offline.worksRead')}</li>
          <li>{t('offline.worksDraft')}</li>
          <li>{t('offline.worksCreate')}</li>
        </ul>
        <p className="m-0 mt-2 text-xs" style={soft}>
          {t('offline.blocked')}
        </p>
      </Card>

      {!isRemote ? (
        <Card>
          <p className="m-0 text-sm">{t('offline.localAll')}</p>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader title={t('offline.pending')} />
            {list(entries, entry => (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => drop(entry, false)}
              >
                {t('offline.drop')}
              </Button>
            ))}
          </Card>
          <Card>
            <CardHeader
              title={t('offline.dead')}
              subtitle={t('offline.deadHint')}
              {...(deadLetters.length > 0
                ? {
                    action: (
                      <Button size="sm" variant="outline" onClick={retry}>
                        {t('offline.retry')}
                      </Button>
                    ),
                  }
                : {})}
            />
            {list(deadLetters, entry => (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => reopen(entry)}
                >
                  {t('offline.reopen')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => drop(entry, true)}
                >
                  {t('offline.drop')}
                </Button>
              </>
            ))}
          </Card>
        </>
      )}

      <div>
        <Link to="/" className="no-underline">
          <Button variant="ghost">{t('accept.home')}</Button>
        </Link>
      </div>
    </div>
  );
}
