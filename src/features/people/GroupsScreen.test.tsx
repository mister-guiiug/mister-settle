import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { I18nProvider } from '../../i18n/index.ts';
import { backend } from '../../backend/index.ts';
import { localDb } from '../../backend/local.ts';
import { useSpaces } from '../spaces/store.ts';
import { usePeople } from './store.ts';
import { GroupsScreen } from './GroupsScreen.tsx';

function renderAt(path: string) {
  return render(
    <I18nProvider>
      <AuthProvider adapter={null}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/e/:spaceId/regroupements"
              element={<GroupsScreen />}
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

describe('GroupsScreen', () => {
  it('compose un regroupement, le déplie, et le supprime sans toucher aux personnes', async () => {
    const space = await backend.spaces.create({
      name: 'Coloc',
      currency: 'EUR',
      meName: 'Alice',
    });
    await backend.participants.create({
      spaceId: space.id,
      displayName: 'Bob',
    });
    renderAt(`/e/${space.id}/regroupements`);
    expect(await screen.findByText('Aucun regroupement.')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Créer un regroupement' })
    );
    fireEvent.change(screen.getByLabelText('Nom'), {
      target: { value: 'Nous' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Alice' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bob' }));
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    expect(await screen.findByText('Nous')).toBeInTheDocument();
    expect(screen.getByText('2 membres')).toBeInTheDocument();
    // Le dépliage : les personnes retenues, dans l'ordre d'affichage.
    expect(screen.getByText('Alice, Bob')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer Nous' }));
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(await screen.findByText('Aucun regroupement.')).toBeInTheDocument();
    const names = (await backend.participants.list(space.id)).map(
      p => p.displayName
    );
    expect(names).toEqual(['Alice', 'Bob']);
  });
});
