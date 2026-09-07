import { Link, Outlet } from 'react-router-dom';
import { Button } from '@mister-guiiug/dev-pwa-config/react/button';
import { EmptyState } from '@mister-guiiug/dev-pwa-config/react/empty-state';
import { ErrorBanner } from '@mister-guiiug/dev-pwa-config/react/error-banner';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { useI18n } from '../../i18n/index.ts';
import { useCurrentSpace } from './useCurrentSpace.ts';

/**
 * LE CADRE D'UN ESPACE : il charge l'espace de la route, dit s'il n'existe
 * pas, prévient s'il est archivé, et laisse la place aux écrans enfants.
 */
export function SpaceShell() {
  const { t } = useI18n();
  const space = useCurrentSpace();

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
  return (
    <>
      {space.archivedAt ? (
        <ErrorBanner
          tone="warning"
          message={t('space.archivedBanner')}
          className="mb-4"
        />
      ) : null}
      <Outlet />
    </>
  );
}
