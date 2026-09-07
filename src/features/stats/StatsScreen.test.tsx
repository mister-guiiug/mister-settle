import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { I18nProvider } from '../../i18n/index.ts';
import { backend } from '../../backend/index.ts';
import { localDb } from '../../backend/local.ts';
import { useSpaces } from '../spaces/store.ts';
import { usePeople } from '../people/store.ts';
import { useExpenses } from '../expenses/store.ts';
import { StatsScreen } from './StatsScreen.tsx';

function renderAt(path: string) {
  return render(
    <I18nProvider>
      <AuthProvider adapter={null}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/e/:spaceId/statistiques" element={<StatsScreen />} />
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
  useExpenses.setState({
    spaceId: null,
    expenses: [],
    categories: [],
    settlements: [],
    ready: false,
    error: null,
  });
});

describe('StatsScreen', () => {
  it('compte les dépenses validées par catégorie, mois et personne, et propose les exports', async () => {
    const space = await backend.spaces.create({
      name: 'Coloc',
      currency: 'EUR',
      meName: 'Alice',
    });
    const [alice] = await backend.participants.list(space.id);
    if (!alice) throw new Error('Alice manque');
    const bob = await backend.participants.create({
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
        beneficiaries: [
          { participantId: alice.id, position: 0 },
          { participantId: bob.id, position: 1 },
        ],
      },
      null
    );
    await backend.expenses.validate(saved.id, saved.version);
    // Un brouillon ne compte pas.
    await backend.expenses.save(
      {
        spaceId: space.id,
        label: 'Brouillon',
        amount: 99999,
        currency: 'EUR',
        spentOn: '2026-09-02',
        splitMethod: 'equal',
        payers: [{ participantId: alice.id, amount: 99999 }],
        beneficiaries: [{ participantId: alice.id, position: 0 }],
      },
      null
    );

    renderAt(`/e/${space.id}/statistiques`);
    expect(await screen.findByText('Sans catégorie')).toBeInTheDocument();
    expect(screen.getByText('100 %')).toBeInTheDocument();
    expect(screen.getByText(/septembre 2026/)).toBeInTheDocument();
    expect(screen.getByText(/avancé 30,00/)).toBeInTheDocument();
    expect(screen.getAllByText(/dû 15,00/)).toHaveLength(2);
    expect(screen.queryByText(/999,99/)).not.toBeInTheDocument();
    for (const name of [
      'Dépenses (CSV)',
      'Dépenses (XLSX)',
      'Soldes (CSV)',
      'Soldes (XLSX)',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('dit qu’il n’y a rien à compter sans dépense validée', async () => {
    const space = await backend.spaces.create({
      name: 'Coloc',
      currency: 'EUR',
      meName: 'Alice',
    });
    renderAt(`/e/${space.id}/statistiques`);
    expect(
      await screen.findByText('Aucune dépense validée : rien à compter.')
    ).toBeInTheDocument();
  });
});
