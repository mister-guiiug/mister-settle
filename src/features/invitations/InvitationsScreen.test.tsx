import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { I18nProvider } from '../../i18n/index.ts';
import { backend } from '../../backend/index.ts';
import { localDb } from '../../backend/local.ts';
import { useSpaces } from '../spaces/store.ts';
import { usePeople } from '../people/store.ts';
import { useInvitations } from './store.ts';
import { InvitationsScreen } from './InvitationsScreen.tsx';

/**
 * Sans compte ni base partagée, l'écran des invitations DIT ce qu'il lui
 * manque au lieu d'échouer sur un bouton : l'adaptateur local répond
 * `local-mode` à chaque geste, et l'écran n'en tente aucun.
 */
function renderAt(path: string) {
  return render(
    <I18nProvider>
      <AuthProvider adapter={null}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/e/:spaceId/invitations"
              element={<InvitationsScreen />}
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
  useInvitations.setState({
    spaceId: null,
    invitations: [],
    ready: false,
    error: null,
  });
});

describe('InvitationsScreen', () => {
  it('dit que les invitations demandent un compte, sur cet appareil', async () => {
    const space = await backend.spaces.create({
      name: 'Coloc',
      currency: 'EUR',
      meName: 'Alice',
    });
    renderAt(`/e/${space.id}/invitations`);
    expect(
      await screen.findByText('Les invitations demandent un compte.')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Créer un lien d’invitation' })
    ).not.toBeInTheDocument();
  });
});
