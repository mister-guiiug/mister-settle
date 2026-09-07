import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { I18nProvider } from '../../i18n/index.ts';
import { backend } from '../../backend/index.ts';
import { localDb } from '../../backend/local.ts';
import { useSpaces } from '../spaces/store.ts';
import { usePeople } from '../people/store.ts';
import { ActivityScreen } from './ActivityScreen.tsx';

function renderAt(path: string) {
  return render(
    <I18nProvider>
      <AuthProvider adapter={null}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/e/:spaceId/activite" element={<ActivityScreen />} />
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

describe('ActivityScreen', () => {
  it('raconte ce qui s’est passé, les plus récents d’abord, signé « Moi »', async () => {
    const space = await backend.spaces.create({
      name: 'Coloc',
      currency: 'EUR',
      meName: 'Alice',
    });
    const [alice] = await backend.participants.list(space.id);
    if (!alice) throw new Error('Alice manque');
    await backend.participants.create({
      spaceId: space.id,
      displayName: 'Bob',
    });
    const saved = await backend.expenses.save(
      {
        spaceId: space.id,
        label: 'Restaurant',
        amount: 3000,
        currency: 'EUR',
        spentOn: '2026-09-01',
        splitMethod: 'equal',
        payers: [{ participantId: alice.id, amount: 3000 }],
        beneficiaries: [{ participantId: alice.id, position: 0 }],
      },
      null
    );
    await backend.expenses.validate(saved.id, saved.version);

    renderAt(`/e/${space.id}/activite`);
    expect(
      await screen.findByText(/Répartition de « Restaurant » validée/)
    ).toBeInTheDocument();
    expect(screen.getByText('Personne « Bob » ajoutée')).toBeInTheDocument();
    expect(screen.getByText('Espace « Coloc » créé')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('validée');
    expect(items[items.length - 1]).toHaveTextContent('Espace « Coloc » créé');
    expect(screen.getAllByText(/^Moi ·/).length).toBeGreaterThan(0);
  });

  it('dit quand il n’y a rien encore', async () => {
    const space = await backend.spaces.create({
      name: 'Vide',
      currency: 'EUR',
    });
    localDb.save({ ...localDb.load(), activity: [] });
    renderAt(`/e/${space.id}/activite`);
    expect(
      await screen.findByText(
        'Rien encore : l’activité de l’espace s’écrira ici.'
      )
    ).toBeInTheDocument();
  });
});
