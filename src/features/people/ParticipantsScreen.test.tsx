import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { I18nProvider } from '../../i18n/index.ts';
import { backend } from '../../backend/index.ts';
import { localDb } from '../../backend/local.ts';
import { useSpaces } from '../spaces/store.ts';
import { usePeople } from './store.ts';
import { ParticipantsScreen } from './ParticipantsScreen.tsx';

/**
 * L'écran des personnes, à travers le chemin complet : écran → magasin →
 * port local → magasin versionné. L'espace vient de la route, comme dans
 * l'application ; `AuthProvider` sans adaptateur dit « pas de compte », et
 * c'est la personne de l'appareil qui est « moi ».
 */
function renderAt(path: string) {
  return render(
    <I18nProvider>
      <AuthProvider adapter={null}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/e/:spaceId/personnes"
              element={<ParticipantsScreen />}
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </I18nProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('dwc_locale', 'fr');
  localDb.clear();
  useSpaces.setState({ spaces: [], ready: false, error: null });
  usePeople.setState({
    spaceId: null,
    participants: [],
    groups: [],
    ready: false,
    error: null,
  });
});

describe('ParticipantsScreen', () => {
  it('liste les personnes, me reconnaît, et en ajoute une', async () => {
    const space = await backend.spaces.create({
      name: 'Coloc',
      currency: 'EUR',
      meName: 'Alice',
    });
    renderAt(`/e/${space.id}/personnes`);
    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Moi')).toBeInTheDocument();
    expect(screen.getByText('1 personne')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Ajouter une personne' })
    );
    fireEvent.change(screen.getByLabelText('Nom affiché'), {
      target: { value: 'Bob' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(await screen.findByText('Bob')).toBeInTheDocument();
    expect(await screen.findByText('2 personnes')).toBeInTheDocument();
  });

  it('refuse un nom déjà pris, dans la langue de l’utilisateur', async () => {
    const space = await backend.spaces.create({
      name: 'Coloc',
      currency: 'EUR',
      meName: 'Alice',
    });
    renderAt(`/e/${space.id}/personnes`);
    await screen.findByText('Alice');
    fireEvent.click(
      screen.getByRole('button', { name: 'Ajouter une personne' })
    );
    fireEvent.change(screen.getByLabelText('Nom affiché'), {
      target: { value: 'alice' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(
      await screen.findByText('Ce nom est déjà pris dans cet espace.')
    ).toBeInTheDocument();
  });

  it('archive depuis la fiche, et range à part', async () => {
    const space = await backend.spaces.create({
      name: 'Coloc',
      currency: 'EUR',
      meName: 'Alice',
    });
    await backend.participants.create({
      spaceId: space.id,
      displayName: 'Bob',
    });
    renderAt(`/e/${space.id}/personnes`);
    await screen.findByText('Bob');
    fireEvent.click(screen.getByRole('button', { name: 'Modifier Bob' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archiver Bob' }));
    expect(
      await screen.findByText('Personnes archivées (1)')
    ).toBeInTheDocument();
    expect(screen.getByText('1 personne')).toBeInTheDocument();
  });
});
