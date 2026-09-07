import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
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
import { isRemote } from '../../backend/index.ts';
import type { Space } from '../../backend/ports.ts';
import { useSpaces } from './store.ts';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { Fab } from '../../components/Fab.tsx';

/**
 * L'ACCUEIL : mes espaces, ouverts d'abord, archivés dessous.
 *
 * Avec une base partagée et SANS SESSION, il n'y a rien à lister — la base
 * refuserait, et « pas le droit » n'est pas un accueil. On invite à se
 * connecter, et on ne demande rien à la base avant.
 *
 * C'est l'un des deux écrans qui portent le pied de page de la famille (règle
 * du 06/09/2026, contrôlée par `pwa-doctor`) — l'autre est « À propos ».
 */
export function HomeScreen() {
  const { t, m, fmt } = useI18n();
  const { signedIn, ready: authReady } = useAuthContext();
  const spaces = useSpaces(state => state.spaces);
  const ready = useSpaces(state => state.ready);
  const error = useSpaces(state => state.error);
  const load = useSpaces(state => state.load);
  const navigate = useNavigate();
  const createSpace = () => void navigate('/espaces/nouveau');
  const needsSignIn = isRemote && authReady && !signedIn;
  const canLoad = !isRemote || (authReady && signedIn);

  useEffect(() => {
    if (canLoad) void load();
  }, [canLoad, load]);

  const open = spaces.filter(s => !s.archivedAt);
  const archived = spaces.filter(s => s.archivedAt);

  if (needsSignIn) {
    return (
      <>
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
      <div className="flex items-center justify-between gap-3">
        <p className="m-0 text-sm" style={{ color: 'var(--dwc-text-soft)' }}>
          {ready
            ? fmt.plural(open.length, m.spaces.count, { count: open.length })
            : ''}
        </p>
        <Button variant="primary" onClick={createSpace}>
          <Plus size={18} aria-hidden="true" />
          {t('spaces.create')}
        </Button>
      </div>

      {error ? (
        <ErrorBanner
          message={<ErrorMessage error={error} />}
          className="mt-4"
        />
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
        <ul className="mt-4 flex list-none flex-col gap-2 p-0">
          {open.map(space => (
            <SpaceRow key={space.id} space={space} />
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
              <SpaceRow key={space.id} space={space} />
            ))}
          </ul>
        </details>
      ) : null}

      <AppFooter repoUrl={REPO_URL} issues className="mt-8" />

      {/*
        Le geste principal de cet écran, sous le pouce. Le bouton d'en-tête
        reste : il porte le mot « Créer un espace », celui-ci porte le geste.
      */}
      <Fab to="/espaces/nouveau" label={t('spaces.create')} />
    </>
  );
}

function SpaceRow({ space }: { space: Space }) {
  const { t } = useI18n();
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
              {space.currency}
              {space.description ? ` · ${space.description}` : ''}
            </p>
          </div>
          {space.myRole ? (
            <Badge
              tone={space.myRole === 'reader' ? 'muted' : 'brand'}
              size="xs"
            >
              {t(`spaces.role.${space.myRole}`)}
            </Badge>
          ) : null}
        </Card>
      </Link>
    </li>
  );
}
