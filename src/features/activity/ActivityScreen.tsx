import { useEffect, useState } from 'react';
import { Card } from '@mister-guiiug/dev-pwa-config/react/card';
import { EmptyState } from '@mister-guiiug/dev-pwa-config/react/empty-state';
import { ErrorBanner } from '@mister-guiiug/dev-pwa-config/react/error-banner';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { useI18n } from '../../i18n/index.ts';
import { backend } from '../../backend/index.ts';
import type { ActivityEntry, SpaceRole } from '../../backend/ports.ts';
import { describeActivity } from '../../domain/activity.ts';
import { toDisplayNumber, type Minor } from '../../domain/money.ts';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { toUiError, type UiError } from '../spaces/store.ts';
import { useCurrentSpace, useMyUserId } from '../spaces/useCurrentSpace.ts';
import { usePeople, usePeopleOf } from '../people/store.ts';

const soft = { color: 'var(--dwc-text-soft)' } as const;
const ROLES: readonly SpaceRole[] = ['owner', 'admin', 'contributor', 'reader'];
const isRole = (value: string): value is SpaceRole =>
  (ROLES as readonly string[]).includes(value);

/**
 * LE JOURNAL D'UN ESPACE : ce que la base a consigné (déclencheurs et
 * fonctions, 0007) ou l'adaptateur local — les cent dernières entrées, les
 * plus récentes d'abord, chacune dite en une phrase. L'auteur est « moi »,
 * la personne rattachée au compte, ou quelqu'un.
 */
export function ActivityScreen() {
  const { t, fmt } = useI18n();
  const space = useCurrentSpace();
  const me = useMyUserId();
  usePeopleOf(space?.id);
  const participants = usePeople(state => state.participants);
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  const spaceId = space?.id;

  useEffect(() => {
    if (!spaceId) return;
    let cancelled = false;
    backend.activity.list(spaceId, 100).then(
      list => {
        if (!cancelled) setEntries(list);
      },
      cause => {
        if (!cancelled) setError(toUiError(cause));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  if (!space) return null;
  const money = (minor: Minor) =>
    fmt.currency(toDisplayNumber(minor, space.minorUnit), space.currency);
  const actorName = (id: string | null) => {
    if (id === null) return t('activity.someone');
    if (id === me) return t('activity.me');
    return (
      participants.find(p => p.linkedUserId === id)?.displayName ??
      t('activity.someone')
    );
  };
  const sentence = (entry: ActivityEntry) => {
    const described = describeActivity(entry, space.minorUnit);
    return t(`activity.${described.key}`, {
      label: described.label,
      amount: described.amount === null ? '—' : money(described.amount),
      role: isRole(described.role)
        ? t(`spaces.role.${described.role}`)
        : described.role,
      entity: described.entity,
      action: described.action,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {error ? <ErrorBanner message={<ErrorMessage error={error} />} /> : null}
      {entries === null ? (
        <SkeletonGroup label={t('activity.title')} lines={4} />
      ) : entries.length === 0 ? (
        <EmptyState title={t('activity.empty')} />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {entries.map(entry => (
            <li key={entry.id}>
              <Card>
                <p className="m-0 text-sm">{sentence(entry)}</p>
                <p className="m-0 mt-1 text-xs" style={soft}>
                  <time dateTime={entry.at} title={fmt.dateTime(entry.at)}>
                    {t('activity.by', {
                      actor: actorName(entry.actorUserId),
                      when: fmt.relative(entry.at),
                    })}
                  </time>
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
