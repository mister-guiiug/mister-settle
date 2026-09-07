import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import { I18nProvider } from '../../i18n/index.ts';
import { localDb } from '../../backend/local.ts';
import { useInvitations } from './store.ts';
import { AcceptInvitationScreen } from './AcceptInvitationScreen.tsx';

function renderAt(path: string) {
  return render(
    <I18nProvider>
      <AuthProvider adapter={null}>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route
                path="/invitation/:token"
                element={<AcceptInvitationScreen />}
              />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </I18nProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('dwc_locale', 'fr');
  localDb.clear();
  useInvitations.setState({
    spaceId: null,
    invitations: [],
    ready: false,
    error: null,
  });
});

describe('AcceptInvitationScreen', () => {
  it('sans base partagée, explique et ramène à l’accueil', () => {
    renderAt('/invitation/deadbeef');
    expect(screen.getByText('Rejoindre un espace')).toBeInTheDocument();
    expect(
      screen.getByText(/demandent un compte et une base partagée/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Retour à l’accueil' })
    ).toHaveAttribute('href', '/');
  });
});
