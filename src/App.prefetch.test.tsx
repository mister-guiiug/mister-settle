import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import { I18nProvider } from './i18n/index.ts';
import { authAdapter } from './auth/index.ts';
import { Shell } from './App.tsx';

/**
 * LE CONTRAT QUE CES TESTS VERROUILLENT : les écrans de la barre se
 * téléchargent PENDANT L'INACTIVITÉ — pas au montage, et pas au clic, où
 * l'attente se paie au pire moment (133 ms d'écran figé mesurés ici même le
 * 20/09/2026, première visite). Seulement ceux SOUS LE POUCE : hors d'un
 * espace, les trois de l'application ; dedans, les sept de l'espace. Et rien
 * du tout quand le visiteur a demandé d'épargner son forfait.
 *
 * Le préchargement lui-même est celui du socle (`useIdlePrefetch`), éprouvé
 * là-bas — une seule fois par chargeur, rejets avalés, repli sans
 * `requestIdleCallback`. Ce qui se joue ici est le BRANCHEMENT.
 */

/**
 * LES ÉCRANS SONT DOUBLÉS, ET C'EST LEUR FABRIQUE QUI TÉMOIGNE : Vitest ne
 * l'appelle qu'au premier `import()` du module — exactement le moment où le
 * morceau est demandé. Le registre ne la rejoue jamais dans un même fichier :
 * les tests s'enchaînent donc du plus restrictif (rien ne doit partir) au plus
 * large, sinon « rien ne part » serait vrai à vide.
 */
const demandes = vi.hoisted(() => ({ ecrans: [] as string[] }));

// Les trois écrans de la barre de l'application…
vi.mock('./features/settings/SettingsScreen.tsx', () => {
  demandes.ecrans.push('settings');
  return { SettingsScreen: () => null };
});
vi.mock('./features/account/AccountScreen.tsx', () => {
  demandes.ecrans.push('account');
  return { AccountScreen: () => null };
});
vi.mock('./features/about/AboutScreen.tsx', () => {
  demandes.ecrans.push('about');
  return { AboutScreen: () => null };
});
// … et les sept de la barre d'un espace.
vi.mock('./features/expenses/ExpensesScreen.tsx', () => {
  demandes.ecrans.push('expenses');
  return { ExpensesScreen: () => null };
});
vi.mock('./features/balances/BalancesScreen.tsx', () => {
  demandes.ecrans.push('balances');
  return { BalancesScreen: () => null };
});
vi.mock('./features/people/ParticipantsScreen.tsx', () => {
  demandes.ecrans.push('participants');
  return { ParticipantsScreen: () => null };
});
vi.mock('./features/balances/SettlementsScreen.tsx', () => {
  demandes.ecrans.push('settlements');
  return { SettlementsScreen: () => null };
});
vi.mock('./features/activity/ActivityScreen.tsx', () => {
  demandes.ecrans.push('activity');
  return { ActivityScreen: () => null };
});
vi.mock('./features/stats/StatsScreen.tsx', () => {
  demandes.ecrans.push('stats');
  return { StatsScreen: () => null };
});
vi.mock('./features/spaces/SpaceSettingsScreen.tsx', () => {
  demandes.ecrans.push('space-settings');
  return { SpaceSettingsScreen: () => null };
});

const ECRANS_DE_L_APPLICATION = ['about', 'account', 'settings'];
const ECRANS_D_UN_ESPACE = [
  'activity',
  'balances',
  'expenses',
  'participants',
  'settlements',
  'space-settings',
  'stats',
];

/**
 * jsdom n'a pas `requestIdleCallback` : on le pose, et on garde la main sur le
 * moment où « le navigateur souffle ».
 */
function tenirLeRepos() {
  const rappels: IdleRequestCallback[] = [];
  vi.stubGlobal(
    'requestIdleCallback',
    vi.fn((rappel: IdleRequestCallback) => rappels.push(rappel))
  );
  vi.stubGlobal('cancelIdleCallback', vi.fn());
  return {
    rappels,
    souffle: () => {
      for (const rappel of rappels) {
        rappel({ didTimeout: false, timeRemaining: () => 50 });
      }
    },
  };
}

/** Le visiteur a demandé d'épargner son forfait ; rend le geste qui l'annule. */
function epargnerLeForfait() {
  Object.defineProperty(navigator, 'connection', {
    value: { saveData: true },
    configurable: true,
  });
  return () => {
    delete (navigator as { connection?: unknown }).connection;
  };
}

/** Le temps que d'éventuels `import()` se règlent — pour prouver un « rien ». */
const laisserPasser = () => new Promise(resolve => setTimeout(resolve, 30));

function monter(chemin: string) {
  render(
    <I18nProvider>
      {/* Les mêmes fournisseurs que `main.tsx` : `Shell` lit la session et
          pousse des notifications. `authAdapter()` rend `null` sans backend
          distant, donc le fournisseur reste en mode local. */}
      <AuthProvider adapter={authAdapter()}>
        <ToastProvider>
          <MemoryRouter initialEntries={[chemin]}>
            <Shell />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </I18nProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('les écrans de la barre arrivent pendant le repos, avant le clic', () => {
  /*
   * EN PREMIER, et ce n'est pas un détail : passé après les tests suivants, les
   * modules seraient déjà en registre et « rien ne part » serait vrai à vide.
   */
  it('ne demande rien quand le visiteur épargne son forfait, même au repos', async () => {
    const rendreLeForfait = epargnerLeForfait();
    try {
      const { souffle } = tenirLeRepos();
      monter('/');

      souffle();
      await laisserPasser();

      expect(demandes.ecrans).toEqual([]);
    } finally {
      rendreLeForfait();
    }
  });

  it("hors d'un espace : les trois écrans de l'application au repos, pas au montage — et aucun de l'espace", async () => {
    const { rappels, souffle } = tenirLeRepos();
    monter('/');

    // Monté : UNE demande de repos est posée — celle de la barre affichée —
    // et rien n'est encore parti.
    expect(rappels).toHaveLength(1);
    expect(demandes.ecrans).toEqual([]);

    souffle();

    await waitFor(() =>
      expect([...demandes.ecrans].sort()).toEqual(ECRANS_DE_L_APPLICATION)
    );
    // Les écrans d'un espace ne sont pas sous le pouce depuis « Mes espaces » :
    // les précharger ferait payer à tout le monde ce que personne n'a demandé.
    expect(demandes.ecrans.some(e => ECRANS_D_UN_ESPACE.includes(e))).toBe(
      false
    );
  });

  it("dans un espace : les sept écrans de l'espace au repos, et seulement cette barre", async () => {
    const deja = demandes.ecrans.length;
    const { rappels, souffle } = tenirLeRepos();
    monter('/e/espace-inconnu/depenses');

    // Une seule barre est sous le pouce : une seule demande de repos.
    expect(rappels).toHaveLength(1);
    expect(demandes.ecrans).toHaveLength(deja);

    souffle();

    await waitFor(() =>
      expect(demandes.ecrans.slice(deja).sort()).toEqual(ECRANS_D_UN_ESPACE)
    );
  });
});
