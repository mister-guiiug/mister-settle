import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import { I18nProvider } from './i18n/index.ts';

/**
 * L'ACCUEIL HORS SESSION, SUR UNE BASE PARTAGÉE.
 *
 * C'est tout ce que voit un premier visiteur, et tout ce que lit un moteur.
 * Relevé du 23/09/2026 : son h1 était « Mes espaces » - un titre vide de sens
 * sans espaces à montrer -, suivi d'une invitation à se connecter, et rien ne
 * disait ce que faisait l'app.
 *
 * `isRemote` est une constante de module, fixée par la configuration : le
 * reste de la suite tourne en mode LOCAL, où cet écran n'existe pas. On le
 * force ici, et `adapter={null}` donne une session prête et absente.
 */
vi.mock('./backend/index.ts', async importOriginal => ({
  ...(await importOriginal<typeof import('./backend/index.ts')>()),
  isRemote: true,
}));

const { Shell } = await import('./App.tsx');

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('dwc_locale', 'fr');
});

describe('accueil hors session', () => {
  it('titre la page du nom de l’app, et dit ce qu’elle fait', async () => {
    render(
      <I18nProvider>
        <AuthProvider adapter={null}>
          <ToastProvider>
            <MemoryRouter initialEntries={['/']}>
              <Shell />
            </MemoryRouter>
          </ToastProvider>
        </AuthProvider>
      </I18nProvider>
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mister Settle' })
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Partagez les dépenses entre proches/)
    ).toBeInTheDocument();
    // L'invitation à se connecter reste là, après la présentation.
    expect(
      screen.getByText('Connectez-vous pour retrouver vos espaces.')
    ).toBeInTheDocument();
  });
});
