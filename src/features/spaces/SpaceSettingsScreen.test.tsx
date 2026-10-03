import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import { I18nProvider } from '../../i18n/index.ts';
import { backend } from '../../backend/index.ts';
import { localDb } from '../../backend/local.ts';
import { useSpaces } from './store.ts';
import { SpaceSettingsScreen } from './SpaceSettingsScreen.tsx';

function renderAt(path: string) {
  return render(
    <I18nProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/e/:spaceId/reglages"
              element={<SpaceSettingsScreen />}
            />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </I18nProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('dwc_locale', 'fr');
  localDb.clear();
  useSpaces.setState({ spaces: [], ready: false, error: null });
});

describe('SpaceSettingsScreen', () => {
  it('organise Configurer / Partager / Cycle de vie, sans raccourci Stats', async () => {
    const space = await backend.spaces.create({
      name: 'Bretagne',
      currency: 'EUR',
    });
    await useSpaces.getState().load();

    renderAt(`/e/${space.id}/reglages`);

    expect(await screen.findByText('Configurer')).toBeInTheDocument();
    expect(screen.getByText(/Devise : EUR/)).toBeInTheDocument();
    expect(screen.getByText('Partager')).toBeInTheDocument();
    expect(screen.getByText('Cycle de vie')).toBeInTheDocument();
    expect(
      screen.queryByText('Statistiques et exports')
    ).not.toBeInTheDocument();
  });
});
