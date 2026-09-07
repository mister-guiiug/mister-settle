import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { I18nProvider } from '../../i18n/index.ts';
import { backend } from '../../backend/index.ts';
import { localDb } from '../../backend/local.ts';
import { useSpaces } from '../spaces/store.ts';
import { usePeople } from '../people/store.ts';
import { useExpenses } from './store.ts';
import { ExpensesScreen } from './ExpensesScreen.tsx';

function renderAt(path: string) {
  return render(
    <I18nProvider>
      <AuthProvider adapter={null}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/e/:spaceId/depenses" element={<ExpensesScreen />} />
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

describe('ExpensesScreen', () => {
  it('liste les dépenses, marque les brouillons, et cherche', async () => {
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
    const input = (label: string, spentOn: string) => ({
      spaceId: space.id,
      label,
      amount: 3000,
      currency: 'EUR',
      spentOn,
      splitMethod: 'equal' as const,
      payers: [{ participantId: alice.id, amount: 3000 }],
      beneficiaries: [
        { participantId: alice.id, position: 0 },
        { participantId: bob.id, position: 1 },
      ],
    });
    const courses = await backend.expenses.save(
      input('Courses', '2026-09-01'),
      null
    );
    await backend.expenses.validate(courses.id, courses.version);
    await backend.expenses.save(input('Essence', '2026-09-02'), null);

    renderAt(`/e/${space.id}/depenses`);
    expect(
      await screen.findByRole('link', { name: 'Ouvrir Essence' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Ouvrir Courses' })
    ).toBeInTheDocument();
    expect(screen.getAllByText('Brouillon')).toHaveLength(1);
    expect(screen.getByText('2 dépenses')).toBeInTheDocument();
    expect(screen.getAllByText(/Payé par Alice/)).toHaveLength(2);

    fireEvent.change(screen.getByLabelText('Rechercher'), {
      target: { value: 'ess' },
    });
    expect(
      screen.getByRole('link', { name: 'Ouvrir Essence' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Ouvrir Courses' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('1 dépense')).toBeInTheDocument();
  });

  it('dit quand il n’y a rien, et propose la première dépense', async () => {
    const space = await backend.spaces.create({
      name: 'Coloc',
      currency: 'EUR',
      meName: 'Alice',
    });
    renderAt(`/e/${space.id}/depenses`);
    expect(
      await screen.findByText('Aucune dépense pour le moment.')
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Nouvelle dépense' }).length
    ).toBeGreaterThan(0);
  });
});
