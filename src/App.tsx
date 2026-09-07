import { Suspense, lazy } from 'react';
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  matchPath,
  useLocation,
} from 'react-router-dom';
import {
  Home,
  Info,
  LayoutDashboard,
  Settings,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import { AppHeader } from '@mister-guiiug/dev-pwa-config/react/app-header';
import { PageContainer } from '@mister-guiiug/dev-pwa-config/react/page-container';
import { BottomNav } from '@mister-guiiug/dev-pwa-config/react/bottom-nav';
import { ThemeToggle } from '@mister-guiiug/dev-pwa-config/react/theme-toggle';
import { ObservabilityBoundary } from '@mister-guiiug/dev-pwa-config/react/error-boundary';
import { ConnectionBanner } from '@mister-guiiug/dev-pwa-config/react/connection-banner';
import { AppUpdates } from '@mister-guiiug/dev-pwa-config/react/app-updates';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { registerSW } from 'virtual:pwa-register';
import { useI18n } from './i18n/index.ts';
import { HomeScreen } from './features/spaces/HomeScreen.tsx';
import { SpaceShell } from './features/spaces/SpaceShell.tsx';
import { useSpaces } from './features/spaces/store.ts';

// UN CHUNK PAR ÉCRAN, hors l'accueil : le budget de poids du socle borne le
// chunk principal, et chaque écran qui s'y ajouterait le ferait déborder. Ce
// qu'on ne voit pas au premier rendu n'a pas à être téléchargé au premier
// rendu.
const NewSpaceScreen = lazy(() =>
  import('./features/spaces/NewSpaceScreen.tsx').then(m => ({
    default: m.NewSpaceScreen,
  }))
);
const SpaceDashboardScreen = lazy(() =>
  import('./features/spaces/SpaceDashboardScreen.tsx').then(m => ({
    default: m.SpaceDashboardScreen,
  }))
);
const SpaceSettingsScreen = lazy(() =>
  import('./features/spaces/SpaceSettingsScreen.tsx').then(m => ({
    default: m.SpaceSettingsScreen,
  }))
);
const SettingsScreen = lazy(() =>
  import('./features/settings/SettingsScreen.tsx').then(m => ({
    default: m.SettingsScreen,
  }))
);
const AboutScreen = lazy(() =>
  import('./features/about/AboutScreen.tsx').then(m => ({
    default: m.AboutScreen,
  }))
);
const AccountScreen = lazy(() =>
  import('./features/account/AccountScreen.tsx').then(m => ({
    default: m.AccountScreen,
  }))
);

/**
 * LE CADRE : en-tête, contenu borné, barre basse — les trois viennent du socle
 * (squelette). Ce qui est propre à l'application : DEUX barres basses. Hors
 * d'un espace, celle de l'application (espaces, réglages, compte, à propos) ;
 * dans un espace, celle de l'espace (tableau de bord, réglages de l'espace —
 * et, lot après lot, dépenses, soldes, personnes).
 *
 * LE PIED DE PAGE N'EST PAS ICI, ET C'EST LA RÈGLE (06/09/2026) : sur
 * l'accueil et « À propos », une ligne dans chacun. `pwa-doctor` refuse la
 * coquille depuis.
 */
function Shell() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  // `end: false` PLUTÔT QU'UN JOKER DE FIN DE CHEMIN : le docteur du socle lit
  // le source sans ses commentaires, et une barre suivie d'une étoile dans une
  // chaîne ouvre pour lui un commentaire bloc — qui avale les routes jusqu'au
  // prochain commentaire fermé, et fait passer l'accueil pour la coquille.
  const inSpace = matchPath({ path: '/e/:spaceId', end: false }, pathname);
  const spaceId = inSpace?.params.spaceId;
  const space = useSpaces(state => state.spaces.find(s => s.id === spaceId));

  const appNav = [
    {
      href: '/',
      label: t('nav.home'),
      icon: <Home aria-hidden="true" />,
      end: true,
    },
    {
      href: '/reglages',
      label: t('nav.settings'),
      icon: <Settings aria-hidden="true" />,
    },
    {
      href: '/compte',
      label: t('nav.account'),
      icon: <UserRound aria-hidden="true" />,
    },
    {
      href: '/a-propos',
      label: t('nav.about'),
      icon: <Info aria-hidden="true" />,
    },
  ];
  const spaceNav = spaceId
    ? [
        {
          href: `/e/${spaceId}`,
          label: t('nav.dashboard'),
          icon: <LayoutDashboard aria-hidden="true" />,
          end: true,
        },
        {
          href: `/e/${spaceId}/reglages`,
          label: t('nav.settings'),
          icon: <SlidersHorizontal aria-hidden="true" />,
        },
      ]
    : appNav;

  const title = (() => {
    if (matchPath('/', pathname)) return t('spaces.title');
    if (matchPath('/espaces/nouveau', pathname)) return t('newSpace.title');
    if (matchPath('/reglages', pathname)) return t('settings.title');
    if (matchPath('/compte', pathname)) return t('account.title');
    if (matchPath('/a-propos', pathname)) return t('about.title');
    if (matchPath('/e/:spaceId/reglages', pathname))
      return t('spaceSettings.title');
    if (spaceId) return space?.name ?? t('nav.dashboard');
    return t('app.name');
  })();

  const backHref = (() => {
    if (pathname === '/') return undefined;
    if (matchPath('/e/:spaceId', pathname)) return '/';
    if (spaceId) return `/e/${spaceId}`;
    return '/';
  })();

  return (
    <>
      <a href="#contenu" className="sr-only focus:not-sr-only">
        Aller au contenu
      </a>

      <AppHeader
        title={title}
        actions={<ThemeToggle />}
        {...(backHref ? { backHref } : {})}
        linkComponent={Link}
        hrefProp="to"
      />

      <ConnectionBanner />

      <PageContainer as="main" id="contenu" width="md" reserve="bottom-nav">
        <Suspense
          fallback={<SkeletonGroup label={t('space.loading')} lines={4} />}
        >
          <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/espaces/nouveau" element={<NewSpaceScreen />} />
            <Route path="/e/:spaceId" element={<SpaceShell />}>
              <Route index element={<SpaceDashboardScreen />} />
              <Route path="reglages" element={<SpaceSettingsScreen />} />
            </Route>
            <Route path="/reglages" element={<SettingsScreen />} />
            <Route path="/compte" element={<AccountScreen />} />
            <Route path="/a-propos" element={<AboutScreen />} />
            {/* Le repli de route rend l'accueil ; le repli de SERVEUR est le
              `404.html` posé par `spaFallbackPlugin`. */}
            <Route path="*" element={<HomeScreen />} />
          </Routes>
        </Suspense>
      </PageContainer>

      <BottomNav
        items={spaceNav}
        linkComponent={Link}
        hrefProp="to"
        placement="fixed"
      />
    </>
  );
}

export function App() {
  return (
    <ObservabilityBoundary>
      {/* `registerType: 'prompt'` : une nouvelle version ne recharge JAMAIS la
          page toute seule (ADR 0005). */}
      <AppUpdates registerSW={registerSW} checkEvery="1h">
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Shell />
        </BrowserRouter>
      </AppUpdates>
    </ObservabilityBoundary>
  );
}
