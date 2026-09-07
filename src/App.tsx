import { Suspense, lazy, useEffect } from 'react';
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
  Activity,
  ArrowLeftRight,
  BarChart3,
  Receipt,
  Scale,
  Settings,
  SlidersHorizontal,
  UserRound,
  Users,
} from 'lucide-react';
import { AppHeader } from '@mister-guiiug/dev-pwa-config/react/app-header';
import { PageContainer } from '@mister-guiiug/dev-pwa-config/react/page-container';
import { BottomNav } from '@mister-guiiug/dev-pwa-config/react/bottom-nav';
import { ThemeToggle } from '@mister-guiiug/dev-pwa-config/react/theme-toggle';
import { ObservabilityBoundary } from '@mister-guiiug/dev-pwa-config/react/error-boundary';
import { ConnectionBanner } from '@mister-guiiug/dev-pwa-config/react/connection-banner';
import { AppUpdates } from '@mister-guiiug/dev-pwa-config/react/app-updates';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { SyncStatusBadge } from '@mister-guiiug/dev-pwa-config/react/sync-status-badge';
import { useOnline } from '@mister-guiiug/dev-pwa-config/react/use-online';
import { registerSW } from 'virtual:pwa-register';
import { useI18n } from './i18n/index.ts';
import { isRemote } from './backend/index.ts';
import { syncStatusOf, useSyncState } from './backend/sync-state.ts';
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
const ParticipantsScreen = lazy(() =>
  import('./features/people/ParticipantsScreen.tsx').then(m => ({
    default: m.ParticipantsScreen,
  }))
);
const GroupsScreen = lazy(() =>
  import('./features/people/GroupsScreen.tsx').then(m => ({
    default: m.GroupsScreen,
  }))
);
const ExpensesScreen = lazy(() =>
  import('./features/expenses/ExpensesScreen.tsx').then(m => ({
    default: m.ExpensesScreen,
  }))
);
const ExpenseWizardScreen = lazy(() =>
  import('./features/expenses/ExpenseWizardScreen.tsx').then(m => ({
    default: m.ExpenseWizardScreen,
  }))
);
const ExpenseDetailScreen = lazy(() =>
  import('./features/expenses/ExpenseDetailScreen.tsx').then(m => ({
    default: m.ExpenseDetailScreen,
  }))
);
const BalancesScreen = lazy(() =>
  import('./features/balances/BalancesScreen.tsx').then(m => ({
    default: m.BalancesScreen,
  }))
);
const SettlementsScreen = lazy(() =>
  import('./features/balances/SettlementsScreen.tsx').then(m => ({
    default: m.SettlementsScreen,
  }))
);
const InvitationsScreen = lazy(() =>
  import('./features/invitations/InvitationsScreen.tsx').then(m => ({
    default: m.InvitationsScreen,
  }))
);
const AcceptInvitationScreen = lazy(() =>
  import('./features/invitations/AcceptInvitationScreen.tsx').then(m => ({
    default: m.AcceptInvitationScreen,
  }))
);
const ActivityScreen = lazy(() =>
  import('./features/activity/ActivityScreen.tsx').then(m => ({
    default: m.ActivityScreen,
  }))
);
const OfflineScreen = lazy(() =>
  import('./features/sync/OfflineScreen.tsx').then(m => ({
    default: m.OfflineScreen,
  }))
);
const StatsScreen = lazy(() =>
  import('./features/stats/StatsScreen.tsx').then(m => ({
    default: m.StatsScreen,
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
  // Le réseau vu par le navigateur alimente l'état de synchronisation : la
  // cache de lecture et la file s'y réfèrent hors de tout rendu (ADR 0015).
  const online = useOnline();
  const setOnline = useSyncState(state => state.setOnline);
  const pending = useSyncState(state => state.pending);
  const dead = useSyncState(state => state.dead);
  useEffect(() => {
    setOnline(online);
  }, [online, setOnline]);
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
          href: `/e/${spaceId}/depenses`,
          label: t('nav.expenses'),
          icon: <Receipt aria-hidden="true" />,
        },
        {
          href: `/e/${spaceId}/soldes`,
          label: t('nav.balances'),
          icon: <Scale aria-hidden="true" />,
        },
        {
          href: `/e/${spaceId}/personnes`,
          label: t('nav.people'),
          icon: <Users aria-hidden="true" />,
        },
        {
          href: `/e/${spaceId}/remboursements`,
          label: t('nav.settle'),
          icon: <ArrowLeftRight aria-hidden="true" />,
        },
        // Au-delà de cinq entrées, la barre du socle replie la suite sous
        // « Plus » : l'activité et les réglages y vivent.
        {
          href: `/e/${spaceId}/activite`,
          label: t('nav.activity'),
          icon: <Activity aria-hidden="true" />,
        },
        {
          href: `/e/${spaceId}/statistiques`,
          label: t('nav.stats'),
          icon: <BarChart3 aria-hidden="true" />,
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
    if (matchPath('/hors-ligne', pathname)) return t('offline.title');
    if (matchPath('/a-propos', pathname)) return t('about.title');
    if (matchPath('/e/:spaceId/depenses', pathname)) return t('expenses.title');
    if (matchPath('/e/:spaceId/depenses/nouvelle', pathname))
      return t('wizard.newTitle');
    if (matchPath('/e/:spaceId/depenses/:expenseId/modifier', pathname))
      return t('wizard.editTitle');
    if (matchPath('/e/:spaceId/depenses/:expenseId/repartition', pathname))
      return t('wizard.splitTitle');
    if (matchPath('/e/:spaceId/depenses/:expenseId', pathname))
      return t('expense.title');
    if (matchPath('/invitation/:token', pathname)) return t('accept.title');
    if (matchPath('/e/:spaceId/invitations', pathname))
      return t('invitations.title');
    if (matchPath('/e/:spaceId/activite', pathname)) return t('activity.title');
    if (matchPath('/e/:spaceId/statistiques', pathname))
      return t('stats.title');
    if (matchPath('/e/:spaceId/soldes', pathname)) return t('balances.title');
    if (matchPath('/e/:spaceId/remboursements', pathname))
      return t('settlements.title');
    if (matchPath('/e/:spaceId/personnes', pathname)) return t('people.title');
    if (matchPath('/e/:spaceId/regroupements', pathname))
      return t('groups.title');
    if (matchPath('/e/:spaceId/reglages', pathname))
      return t('spaceSettings.title');
    if (spaceId) return space?.name ?? t('nav.dashboard');
    return t('app.name');
  })();

  const backHref = (() => {
    if (pathname === '/') return undefined;
    if (matchPath('/e/:spaceId', pathname)) return '/';
    // Sous la liste des dépenses (détail, assistant), on remonte à la liste.
    if (
      spaceId &&
      matchPath({ path: '/e/:spaceId/depenses', end: false }, pathname) &&
      !matchPath('/e/:spaceId/depenses', pathname)
    )
      return `/e/${spaceId}/depenses`;
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
        actions={
          <>
            {isRemote ? (
              <Link
                to="/hors-ligne"
                aria-label={t('sync.badge')}
                className="no-underline"
              >
                <SyncStatusBadge
                  status={syncStatusOf({ online, pending, dead })}
                  pending={pending}
                  labels={{
                    synced: t('sync.status.synced'),
                    pending: t('sync.status.pending'),
                    offline: t('sync.status.offline'),
                    error: t('sync.status.error'),
                  }}
                />
              </Link>
            ) : null}
            <ThemeToggle />
          </>
        }
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
              <Route path="depenses" element={<ExpensesScreen />} />
              <Route
                path="depenses/nouvelle"
                element={<ExpenseWizardScreen mode="new" />}
              />
              <Route
                path="depenses/:expenseId"
                element={<ExpenseDetailScreen />}
              />
              <Route
                path="depenses/:expenseId/modifier"
                element={<ExpenseWizardScreen mode="edit" />}
              />
              <Route
                path="depenses/:expenseId/repartition"
                element={<ExpenseWizardScreen mode="split" />}
              />
              <Route path="soldes" element={<BalancesScreen />} />
              <Route path="remboursements" element={<SettlementsScreen />} />
              <Route path="activite" element={<ActivityScreen />} />
              <Route path="statistiques" element={<StatsScreen />} />
              <Route path="personnes" element={<ParticipantsScreen />} />
              <Route path="regroupements" element={<GroupsScreen />} />
              <Route path="reglages" element={<SpaceSettingsScreen />} />
              <Route path="invitations" element={<InvitationsScreen />} />
            </Route>
            <Route
              path="/invitation/:token"
              element={<AcceptInvitationScreen />}
            />
            <Route path="/reglages" element={<SettingsScreen />} />
            <Route path="/compte" element={<AccountScreen />} />
            <Route path="/hors-ligne" element={<OfflineScreen />} />
            <Route path="/a-propos" element={<AboutScreen />} />
            {/* Le repli de route rend l'accueil ; le repli de SERVEUR est le
              `404.html` posé par `spaFallbackPlugin`. */}
            <Route path="*" element={<HomeScreen />} />
          </Routes>
        </Suspense>
      </PageContainer>

      <BottomNav
        items={spaceNav}
        moreLabel={t('nav.more')}
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
