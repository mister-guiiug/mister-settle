import {
  Suspense,
  createContext,
  lazy,
  useCallback,
  useContext,
  useEffect,
  useState,
  useTransition,
  type ComponentProps,
  type MouseEvent,
} from 'react';
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  matchPath,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import {
  Home,
  Info,
  LoaderCircle,
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
import { ConsentBanner } from '@mister-guiiug/dev-pwa-config/react/consent-banner';
import { usePageViews } from '@mister-guiiug/dev-pwa-config/react/use-page-views';
import { BottomNav } from '@mister-guiiug/dev-pwa-config/react/bottom-nav';
import { ThemeToggle } from '@mister-guiiug/dev-pwa-config/react/theme-toggle';
import { ObservabilityBoundary } from '@mister-guiiug/dev-pwa-config/react/error-boundary';
import { ConnectionBanner } from '@mister-guiiug/dev-pwa-config/react/connection-banner';
import { AppUpdates } from '@mister-guiiug/dev-pwa-config/react/app-updates';
import { SkeletonGroup } from '@mister-guiiug/dev-pwa-config/react/skeleton';
import { SyncStatusBadge } from '@mister-guiiug/dev-pwa-config/react/sync-status-badge';
import { useOnline } from '@mister-guiiug/dev-pwa-config/react/use-online';
import { useIdlePrefetch } from '@mister-guiiug/dev-pwa-config/react/use-prefetch';
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
// CHAQUE IMPORT D'UN ÉCRAN DU MENU EST NOMMÉ, parce qu'il sert DEUX FOIS : à
// `lazy` ci-dessous, et aux chargeurs composés `chargeLesEcrans…`, que le
// socle lance à l'inactivité. Deux `import()` du même spécificateur ne
// téléchargent qu'une fois — le registre de modules dédoublonne — mais encore
// faut-il que ce soit LITTÉRALEMENT le même spécificateur, sinon le bundler
// émet deux morceaux et le préchargement ne sert plus à rien.
const chargeSpaceSettings = () =>
  import('./features/spaces/SpaceSettingsScreen.tsx');
const chargeSettings = () => import('./features/settings/SettingsScreen.tsx');
const chargeAbout = () => import('./features/about/AboutScreen.tsx');
const chargeAccount = () => import('./features/account/AccountScreen.tsx');
const chargeParticipants = () =>
  import('./features/people/ParticipantsScreen.tsx');
const chargeExpenses = () => import('./features/expenses/ExpensesScreen.tsx');
const chargeBalances = () => import('./features/balances/BalancesScreen.tsx');
const chargeSettlements = () =>
  import('./features/balances/SettlementsScreen.tsx');
const chargeActivity = () => import('./features/activity/ActivityScreen.tsx');
const chargeStats = () => import('./features/stats/StatsScreen.tsx');

/**
 * LA BARRE BASSE CHANGE DE CONTENU, LE PRÉCHARGEMENT AUSSI. Hors d'un espace
 * elle porte quatre entrées (l'accueil est déjà dans le bundle d'entrée) ;
 * dedans, sept. On ne tire que celles qui sont SOUS LE POUCE à cet instant :
 * précharger les sept écrans d'espace depuis « Mes espaces » ferait payer à
 * tout le monde ce que personne n'a encore demandé.
 */
const CHARGEURS_HORS_ESPACE = [chargeSettings, chargeAccount, chargeAbout];
const CHARGEURS_DANS_UN_ESPACE = [
  chargeExpenses,
  chargeBalances,
  chargeParticipants,
  chargeSettlements,
  chargeActivity,
  chargeStats,
  chargeSpaceSettings,
];

/**
 * UN CHARGEUR PAR BARRE POUR LE SOCLE, ET DES CONSTANTES DE MODULE :
 * `prefetch()` ne lance un chargeur qu'une fois et le reconnaît à son IDENTITÉ
 * de fonction — une fonction recréée à chaque montage serait un chargeur neuf à
 * chaque fois. `allSettled` : un morceau qui manque n'empêche pas les autres
 * d'arriver.
 */
const chargeLesEcransHorsEspace = () =>
  Promise.allSettled(CHARGEURS_HORS_ESPACE.map(charge => charge()));
const chargeLesEcransDansUnEspace = () =>
  Promise.allSettled(CHARGEURS_DANS_UN_ESPACE.map(charge => charge()));

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
  chargeSpaceSettings().then(m => ({ default: m.SpaceSettingsScreen }))
);
const SettingsScreen = lazy(() =>
  chargeSettings().then(m => ({ default: m.SettingsScreen }))
);
const AboutScreen = lazy(() =>
  chargeAbout().then(m => ({ default: m.AboutScreen }))
);
const AccountScreen = lazy(() =>
  chargeAccount().then(m => ({ default: m.AccountScreen }))
);
const ParticipantsScreen = lazy(() =>
  chargeParticipants().then(m => ({ default: m.ParticipantsScreen }))
);
const GroupsScreen = lazy(() =>
  import('./features/people/GroupsScreen.tsx').then(m => ({
    default: m.GroupsScreen,
  }))
);
const ExpensesScreen = lazy(() =>
  chargeExpenses().then(m => ({ default: m.ExpensesScreen }))
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
  chargeBalances().then(m => ({ default: m.BalancesScreen }))
);
const SettlementsScreen = lazy(() =>
  chargeSettlements().then(m => ({ default: m.SettlementsScreen }))
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
  chargeActivity().then(m => ({ default: m.ActivityScreen }))
);
const OfflineScreen = lazy(() =>
  import('./features/sync/OfflineScreen.tsx').then(m => ({
    default: m.OfflineScreen,
  }))
);
const StatsScreen = lazy(() =>
  chargeStats().then(m => ({ default: m.StatsScreen }))
);

/**
 * Le geste de navigation de la barre, porté jusqu'au `linkComponent` du socle.
 *
 * POURQUOI UN CONTEXTE. `BottomNav` construit lui-même le `onClick` de chaque
 * lien — `onClick: () => { setMoreOpen(false); onNavigate?.(item); }`, SANS
 * l'événement — donc ni `preventDefault`, ni touche de modification, ni
 * transition ne peuvent passer par `onNavigate`. Le seul point d'entrée qui
 * reçoit l'événement est le composant de lien. Un contexte l'atteint sans
 * redéfinir le composant à chaque rendu (ce qui le remonterait, et perdrait le
 * focus au clavier).
 */
const NavigationDuMenu = createContext<{
  versLaVue: (e: MouseEvent<HTMLAnchorElement>, to: string) => void;
  enAttente: string | null;
} | null>(null);

function LienDeMenu({ to, onClick, ...reste }: ComponentProps<typeof Link>) {
  const menu = useContext(NavigationDuMenu);
  const cible = typeof to === 'string' ? to : '';
  return (
    <Link
      to={to}
      aria-busy={menu?.enAttente === cible || undefined}
      onClick={e => {
        onClick?.(e);
        menu?.versLaVue(e, cible);
      }}
      {...reste}
    />
  );
}

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
/**
 * Exportée POUR ÊTRE ÉPROUVÉE : `App.nav.test.tsx` la monte face à un écran
 * dont il décide lui-même de l'arrivée, ce qu'on ne peut pas faire à travers
 * `App` sans mettre la main dans le registre de modules.
 */
export function Shell() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  // Une vue de page par navigation — ni zéro, ni deux. `initAnalytics` pose
  // `capture_pageview: false` pour que toutes passent par ici, la première
  // comprise : laissé à lui-même, PostHog compterait chaque navigation deux
  // fois. Rien sans consentement.
  usePageViews(pathname);
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
  // PRÉCHARGE LES ÉCRANS DE LA BARRE DÈS QUE LE FIL PRINCIPAL SOUFFLE — et
  // seulement ceux SOUS LE POUCE : `enabled` bascule d'une barre à l'autre
  // avec la route. Sans ça, le morceau d'un écran n'est demandé qu'AU CLIC :
  // mesuré à froid le 20/09/2026 sur le site publié, « Réglages » coûtait
  // 133 ms pour 1 644 octets — pas du poids, un aller-retour réseau payé au
  // pire moment. Le socle décide du reste : une seule fois par chargeur,
  // rejets avalés, rien sous `saveData` ni en 2g, un délai en repli là où
  // `requestIdleCallback` manque (Safari avant la 17). N'entre PAS dans
  // `bundleBudget.preloadGzipKb`, qui ne compte que ce qui est `modulepreload`
  // dans le document.
  const dansUnEspace = Boolean(spaceId);
  useIdlePrefetch(chargeLesEcransHorsEspace, { enabled: !dansUnEspace });
  useIdlePrefetch(chargeLesEcransDansUnEspace, { enabled: dansUnEspace });

  const navigate = useNavigate();
  const [enCours, demarreLaTransition] = useTransition();
  const [ciblePendante, setCiblePendante] = useState<string | null>(null);

  /**
   * LA TRANSITION EST LA NÔTRE, et c'est tout l'intérêt.
   *
   * react-router 7 en ouvre déjà une de son côté — `startTransition(() =>
   * setStateImpl(newState))` dans son `BrowserRouter` — mais ne l'expose nulle
   * part hors d'un routeur de données. Or React 19 garde délibérément l'écran
   * déjà affiché pendant une transition : le repli de `<Suspense>` ne paraît
   * donc JAMAIS sur un clic, seulement sur un atterrissage direct. Mesuré sur
   * le site publié le 20/09/2026 : 133 ms d'écran figé, `aria-busy` faux d'un
   * bout à l'autre.
   *
   * En pilotant `navigate` depuis ici, `enCours` reste vrai tant que le morceau
   * de l'écran n'est pas arrivé : c'est la seule information qui manquait.
   */
  const versLaVue = useCallback(
    (e: MouseEvent<HTMLAnchorElement>, to: string) => {
      // On laisse le navigateur faire son travail quand le visiteur le lui
      // demande : nouvel onglet, nouvelle fenêtre, enregistrement de la cible.
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      e.preventDefault();
      setCiblePendante(to);
      demarreLaTransition(() => navigate(to));
    },
    [navigate]
  );

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
            {/*
              LE RETOUR À L'ACCUEIL, EN UN GESTE — ET SEULEMENT DANS UN ESPACE.
              Là, la barre basse ne montre que les onglets de l'espace, et la
              flèche de l'en-tête ne remonte que d'un cran (le détail vers la
              liste, la liste vers l'espace) : revenir à « Mes espaces »
              demandait deux ou trois retours. Ailleurs, la barre porte déjà
              l'entrée « Espaces » — deux liens du même nom vers la même page,
              c'est ce que le parcours e2e a refusé, à raison.
            */}
            {spaceId ? (
              <Link
                to="/"
                aria-label={t('nav.home')}
                title={t('nav.home')}
                className="flex items-center no-underline"
                style={{ color: 'var(--dwc-text)' }}
              >
                <Home size={20} aria-hidden="true" />
              </Link>
            ) : null}
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
        {/* Une `region`, pas une boîte modale : elle ne recouvre rien et ne
            piège pas le focus. Ne rend RIEN sans `VITE_POSTHOG_KEY`. */}
        <ConsentBanner
          posthogKey={import.meta.env.VITE_POSTHOG_KEY}
          loader={() => import('posthog-js/dist/module.slim.js')}
        />
      </PageContainer>

      <NavigationDuMenu.Provider
        value={{ versLaVue, enAttente: enCours ? ciblePendante : null }}
      >
        <BottomNav
          // LA PASTILLE DE L'ENTRÉE CLIQUÉE TOURNE pendant que son morceau
          // arrive. C'est le seul retour visible : le repli de `Suspense` ne
          // paraîtra pas, React 19 gardant l'écran courant le temps de la
          // transition.
          items={spaceNav.map(item =>
            enCours && ciblePendante === item.href
              ? {
                  ...item,
                  icon: (
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                  ),
                }
              : item
          )}
          moreLabel={t('nav.more')}
          // `LienDeMenu` — le `Link` de react-router, plus le geste qui ouvre
          // la transition. Le socle ne passe pas l'événement à `onNavigate` :
          // le composant de lien est le seul endroit qui l'ait.
          linkComponent={LienDeMenu}
          hrefProp="to"
          placement="fixed"
        />
      </NavigationDuMenu.Provider>
      {/* HORS DES LIENS, pour ne pas changer leur nom accessible en cours de
          route : un lecteur d'écran annoncerait « Dépenses, chargement… » puis
          « Dépenses », sur le lien qui a le focus. */}
      <span className="sr-only" role="status" aria-live="polite">
        {enCours ? t('nav.loading') : ''}
      </span>
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
