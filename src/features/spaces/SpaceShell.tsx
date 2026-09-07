import { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { EmptyState } from '@mister-guiiug/dev-pwa-config/react/empty-state';
import { ErrorBanner } from '@mister-guiiug/dev-pwa-config/react/error-banner';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { useI18n } from '../../i18n/index.ts';
import { isRemote } from '../../backend/index.ts';
import { useSyncState } from '../../backend/sync-state.ts';
import { useExpenses } from '../expenses/store.ts';
import { can, useCurrentSpace } from './useCurrentSpace.ts';
import { Fab } from '../../components/Fab.tsx';

/**
 * LE CADRE D'UN ESPACE : il charge l'espace de la route, dit s'il n'existe
 * pas, prévient s'il est archivé — ou si ce qu'on lit est une COPIE, faute
 * de réseau (ADR 0015) — et laisse la place aux écrans enfants. Quand une
 * création mise en file finit par partir, les dépenses se relisent.
 */
export function SpaceShell() {
  const { t, fmt } = useI18n();
  const space = useCurrentSpace();
  const { pathname } = useLocation();
  const staleAt = useSyncState(state => state.staleAt);
  const doneCount = useSyncState(state => state.doneCount);
  const reloadExpenses = useExpenses(state => state.load);
  const spaceId = space?.id;

  useEffect(() => {
    if (spaceId && doneCount > 0) void reloadExpenses(spaceId);
  }, [spaceId, doneCount, reloadExpenses]);

  if (space === null) {
    return <SkeletonGroup label={t('space.loading')} lines={4} />;
  }
  if (space === undefined) {
    return (
      <EmptyState
        title={t('space.notFound')}
        action={
          <Link to="/" className="no-underline">
            <Button variant="outline">{t('space.backToSpaces')}</Button>
          </Link>
        }
      />
    );
  }
  /*
   * LE BOUTON ROND N'APPARAÎT QUE LÀ OÙ « PLUS » NE VEUT DIRE QU'UNE CHOSE :
   * le tableau de bord de l'espace et la liste des dépenses. Sur les personnes
   * ou les regroupements, il voudrait dire « ajouter une personne » ; dans
   * l'assistant, il n'aurait rien à ajouter. Un geste flottant qui change de
   * sens selon l'onglet ne se retient pas.
   *
   * Il suit aussi les droits : un lecteur, ou un espace archivé, n'écrit pas —
   * et la base le refuserait de toute façon.
   */
  const racine = `/e/${space.id}`;
  const showFab =
    (pathname === racine ||
      pathname === `${racine}/` ||
      pathname === `${racine}/depenses`) &&
    can(space.myRole).contribute &&
    !space.archivedAt;
  return (
    <>
      {isRemote && staleAt ? (
        <ErrorBanner
          tone="info"
          message={t('sync.staleBanner', { date: fmt.dateTime(staleAt) })}
          className="mb-4"
        />
      ) : null}
      {space.archivedAt ? (
        <ErrorBanner
          tone="warning"
          message={t('space.archivedBanner')}
          className="mb-4"
        />
      ) : null}
      <Outlet />
      {showFab ? (
        <Fab
          to={`/e/${space.id}/depenses/nouvelle`}
          label={t('expenses.add')}
        />
      ) : null}
    </>
  );
}
