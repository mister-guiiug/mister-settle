import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { I18nProvider } from '../../i18n/index.ts';
import { backend } from '../../backend/index.ts';
import { localDb } from '../../backend/local.ts';
import { useSpaces } from './store.ts';
import { HomeScreen } from './HomeScreen.tsx';

/**
 * L'accueil, à travers le chemin complet : écran → magasin → port → magasin
 * versionné. `I18nProvider` est indispensable — les libellés des composants
 * du socle en dépendent —, et la locale est FIGÉE en français avant le
 * montage : `createI18n` lirait sinon celle du navigateur de test.
 */
function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider adapter={null}>
        <MemoryRouter>{children}</MemoryRouter>
      </AuthProvider>
    </I18nProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('dwc_locale', 'fr');
  localDb.clear();
  useSpaces.setState({ spaces: [], ready: false, error: null });
});

describe('HomeScreen', () => {
  it('dit qu’il n’y a rien, et propose de créer', async () => {
    render(<HomeScreen />, { wrapper: Wrapper });
    expect(
      await screen.findByText('Aucun espace pour le moment.')
    ).toBeInTheDocument();
    // La création se fait par le bouton rond du bas — un LIEN, dont la légende
    // porte le nom accessible. Il n'y a plus d'autre chemin, et ce test le
    // dit : deux chemins pour un geste, c'était l'ancien écran.
    const creer = screen.getByRole('link', { name: 'Créer un espace' });
    expect(creer).toHaveAttribute('href', '/espaces/nouveau');
    expect(
      screen.queryByRole('button', { name: 'Créer un espace' })
    ).toBeNull();
  });

  it('liste les espaces ouverts, et range les archivés à part', async () => {
    const ouvert = await backend.spaces.create({
      name: 'Bretagne',
      currency: 'EUR',
    });
    const archive = await backend.spaces.create({
      name: 'Vieux voyage',
      currency: 'EUR',
    });
    await backend.spaces.archive(archive.id, true, archive.version);

    render(<HomeScreen />, { wrapper: Wrapper });
    expect(
      await screen.findByRole('link', { name: 'Ouvrir Bretagne' })
    ).toHaveAttribute('href', `/e/${ouvert.id}`);
    expect(screen.getByText('Espaces archivés (1)')).toBeInTheDocument();
    expect(screen.getAllByText('Propriétaire')).toHaveLength(2);
  });

  it('porte les trois liens de la famille', async () => {
    render(<HomeScreen />, { wrapper: Wrapper });
    await screen.findByText('Aucun espace pour le moment.');
    for (const nom of [
      'Code source',
      'M’offrir un café',
      'Signaler un problème',
    ]) {
      expect(screen.getByRole('link', { name: nom })).toBeInTheDocument();
    }
  });
});
