import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { Home, Info, Settings, UserRound } from 'lucide-react';
import { AppHeader } from '@mister-guiiug/dev-pwa-config/react/app-header';
import { PageContainer } from '@mister-guiiug/dev-pwa-config/react/page-container';
import { BottomNav } from '@mister-guiiug/dev-pwa-config/react/bottom-nav';
import { ThemeToggle } from '@mister-guiiug/dev-pwa-config/react/theme-toggle';
import { ObservabilityBoundary } from '@mister-guiiug/dev-pwa-config/react/error-boundary';
import { ConnectionBanner } from '@mister-guiiug/dev-pwa-config/react/connection-banner';
import { AppUpdates } from '@mister-guiiug/dev-pwa-config/react/app-updates';
import { registerSW } from 'virtual:pwa-register';
import { useI18n } from './i18n/index.ts';
import { HomeScreen } from './features/home/HomeScreen.tsx';
import { SettingsScreen } from './features/settings/SettingsScreen.tsx';
import { AboutScreen } from './features/about/AboutScreen.tsx';
import { AccountScreen } from './features/account/AccountScreen.tsx';

/**
 * LE CADRE : en-tête, contenu borné, barre basse.
 *
 * Les trois côtés viennent du socle. Neuf apps avaient écrit leur en-tête (de
 * 36 à 377 lignes) et la mise en page était la même partout — seul le CONTENU
 * différait. `AppHeader` ne décide rien de ce contenu : il pose le collant, la
 * zone sûre iOS, le titre en `h1` et la rangée d'actions.
 *
 * LE PIED DE PAGE N'EST PAS ICI, ET C'EST LA RÈGLE. Rendu dans la coquille,
 * hors des routes, `<AppFooter>` suivait chaque écran — trois liens sortants
 * sous une saisie. La règle famille du 06/09/2026 le veut sur deux écrans, et
 * deux seulement : l'accueil et À propos — c'est là qu'il est rendu, une ligne
 * dans chacun. `pwa-doctor` (`liens-famille`) refuse la coquille depuis.
 *
 * `linkComponent={Link}` avec `hrefProp="to"` : les composants de navigation
 * sont agnostiques de routeur, et c'est ainsi qu'on leur donne celui de l'app.
 * Un `<BottomNav />` sans `items` rend une barre VIDE — c'est le piège que la
 * campagne d'adoption a rencontré, et il ne produit aucune erreur de type.
 */
function Shell() {
  const { t } = useI18n();
  const { pathname } = useLocation();

  const nav = [
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

  const titles: Record<string, string> = {
    '/': t('home.title'),
    '/reglages': t('settings.title'),
    '/compte': t('account.title'),
    '/a-propos': t('about.title'),
  };

  return (
    <>
      {/* Premier élément focalisable de la page : sans lui, atteindre le
          contenu au clavier demande de traverser toute la navigation. */}
      <a href="#contenu" className="sr-only focus:not-sr-only">
        Aller au contenu
      </a>

      <AppHeader
        title={titles[pathname] ?? t('app.name')}
        actions={<ThemeToggle />}
        backHref={pathname === '/' ? undefined : '/'}
        linkComponent={Link}
        hrefProp="to"
      />

      <ConnectionBanner />

      <PageContainer as="main" id="contenu" width="md" reserve="bottom-nav">
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/reglages" element={<SettingsScreen />} />
          <Route path="/compte" element={<AccountScreen />} />
          <Route path="/a-propos" element={<AboutScreen />} />
          {/* Le repli de route rend l'accueil ; le repli de SERVEUR est le
              `404.html` posé par `spaFallbackPlugin`. Les deux sont
              nécessaires : sans le second, GitHub Pages sert sa propre page
              d'erreur avant que ce routeur n'existe. */}
          <Route path="*" element={<HomeScreen />} />
        </Routes>
      </PageContainer>

      <BottomNav
        items={nav}
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
          page toute seule. Trois apps du parc étaient en `autoUpdate` et
          pouvaient recharger au milieu d'une saisie. `checkEvery` fait
          découvrir une version à une PWA installée restée ouverte plusieurs
          jours, qui autrement ne verrait rien avant un démarrage à froid. */}
      <AppUpdates registerSW={registerSW} checkEvery="1h">
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Shell />
        </BrowserRouter>
      </AppUpdates>
    </ObservabilityBoundary>
  );
}
