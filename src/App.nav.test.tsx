import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentType } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import { I18nProvider } from './i18n/index.ts';
import { authAdapter } from './auth/index.ts';

/**
 * LE DÉFAUT QUE CES TESTS VERROUILLENT : un clic sans aucun effet visible.
 *
 * Diagnostiqué sur miss-badminton le 20/09/2026 (PR #80), puis retrouvé sur
 * onze dépôts du parc. MESURÉ ICI MÊME, à froid, sur
 * https://mister-guiiug.github.io/mister-settle/ — première visite, service
 * worker pas encore installé, 188 échantillons du DOM toutes les 16 ms :
 *
 *   t=+8 ms   `SettingsScreen` part sur le réseau — 1 644 octets, 133 ms
 *   t=17 ms   l'URL dit déjà `/reglages` ; à l'écran, « Mes espaces »
 *   t=150 ms  « Réglages » paraît enfin
 *
 * Aucun squelette, aucun `aria-busy` entre les deux. La cause n'est pas une
 * lenteur anormale : react-router 7 enveloppe tout changement d'URL dans
 * `startTransition`, et React 19 garde alors délibérément l'écran déjà affiché
 * plutôt que de montrer le repli de `Suspense`. Le repli existait bien — il n'a
 * simplement jamais pu paraître sur un clic.
 *
 * Ces tests tiennent le CONTRAT, pas la mise en forme : tant que l'écran n'est
 * pas là, l'entrée cliquée se dit occupée et la barre reste à l'écran pour le
 * montrer.
 */

/**
 * L'ÉCRAN DONT NOUS DÉCIDONS DE L'ARRIVÉE. `Shell` porte ses propres `<Routes>` :
 * on ne peut pas y glisser une route à nous comme on le ferait avec un
 * `<Outlet />`. C'est donc le MODULE qu'on tient en attente — la promesse est
 * créée avant le montage (`vi.hoisted`), si bien que `livre()` est disponible
 * même si personne ne l'a encore importé.
 */
const differe = vi.hoisted(() => {
  let resous: (module: unknown) => void = () => {};
  const promesse = new Promise<unknown>(r => {
    resous = r;
  });
  return { promesse, resous: (module: unknown) => resous(module) };
});

vi.mock('./features/settings/SettingsScreen.tsx', () => differe.promesse);

const { Shell } = await import('./App.tsx');

function monter() {
  render(
    <I18nProvider>
      {/* Les mêmes fournisseurs que `main.tsx` : `Shell` lit la session et
          pousse des notifications. `authAdapter()` rend `null` sans backend
          distant, donc le fournisseur reste en mode local. */}
      <AuthProvider adapter={authAdapter()}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/']}>
            <Shell />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </I18nProvider>
  );
  return {
    // Une expression régulière, pas une chaîne : le socle ajoute « Page
    // actuelle » au nom accessible de l'entrée courante.
    entree: (nom: RegExp) => screen.getByRole('link', { name: nom }),
    livreLEcran: async () => {
      const Ecran: ComponentType = () => <h1>Les réglages</h1>;
      await act(async () => {
        differe.resous({ SettingsScreen: Ecran });
      });
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  // `I18nProvider` ne passe pas de `storageKey` : c'est la clé famille
  // `dwc_locale`. Sans ça, jsdom rapporte `navigator.language = en-US` et les
  // libellés de la barre arrivent en anglais.
  localStorage.setItem('dwc_locale', 'fr');
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("le clic sur une entrée de la barre répond avant que l'écran soit là", () => {
  /*
   * EN PREMIER, et ce n'est pas un détail : le module différé n'est pas encore
   * réglé, donc l'écran des Réglages est réellement en attente. Placé après le
   * test suivant, il cliquerait sur un écran déjà chargé — et ne prouverait
   * plus rien.
   */
  it('laisse le navigateur faire quand le clic porte un modificateur', () => {
    const { entree } = monter();

    fireEvent.click(entree(/Réglages/), { ctrlKey: true });

    // Ouvrir dans un nouvel onglet n'est pas une navigation de cette page :
    // rien ne doit être mis en attente ici.
    expect(entree(/Réglages/)).not.toHaveAttribute('aria-busy');
  });
  /*
   * UN SEUL TEST POUR TOUTE LA FENÊTRE D'ATTENTE, et c'est délibéré : le module
   * différé ci-dessus ne se règle qu'UNE FOIS. Un second test qui le rejouerait
   * trouverait l'écran déjà arrivé — donc aucune attente à observer, et une
   * assertion verte qui ne prouve rien.
   */
  it("dit l'entrée occupée, garde l'écran précédent, puis rend la main", async () => {
    const { entree, livreLEcran } = monter();

    fireEvent.click(entree(/Réglages/));

    expect(entree(/Réglages/)).toHaveAttribute('aria-busy', 'true');
    // Les autres entrées ne se disent pas occupées : c'est celle qu'on a
    // cliquée qui travaille, pas la barre entière.
    expect(entree(/Compte/)).not.toHaveAttribute('aria-busy');

    // CE QUE LE REPLI DE `Suspense` NE FERA PAS. React 19 garde l'écran déjà
    // affiché pendant la transition : l'écran des Réglages n'est pas rendu, et
    // aucun squelette n'a paru. C'est exactement pourquoi la barre doit parler
    // — elle seule le peut.
    expect(screen.queryByText('Les réglages')).toBeNull();

    // Le chargement est annoncé HORS des liens, pour ne pas changer leur nom
    // accessible en cours de route sous le doigt d'un lecteur d'écran.
    expect(
      screen.getAllByRole('status').some(z => z.textContent === 'Chargement…')
    ).toBe(true);
    expect(entree(/Réglages/)).toHaveAccessibleName(/^Réglages/);

    await livreLEcran();

    expect(
      screen.getByRole('heading', { name: 'Les réglages' })
    ).toBeInTheDocument();
    expect(entree(/Réglages/)).not.toHaveAttribute('aria-busy');
    expect(
      screen.getAllByRole('status').some(z => z.textContent === 'Chargement…')
    ).toBe(false);
  });
});
