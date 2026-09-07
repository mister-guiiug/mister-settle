import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { I18nProvider } from '../../i18n/index.ts';
import { backend } from '../../backend/index.ts';
import { localDb } from '../../backend/local.ts';
import { useSpaces } from '../spaces/store.ts';
import { usePeople } from '../people/store.ts';
import { useExpenses } from '../expenses/store.ts';
import { BalancesScreen } from './BalancesScreen.tsx';

function renderAt(path: string) {
  return render(
    <I18nProvider>
      <AuthProvider adapter={null}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/e/:spaceId/soldes" element={<BalancesScreen />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </I18nProvider>
  );
}

/** Alice paie 30 pour Alice et Bob, à parts égales, validé. */
async function seed() {
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
  return { space, alice, bob };
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

describe('BalancesScreen', () => {
  it('recalcule les soldes par personne, puis les consolide par regroupement', async () => {
    const { space, alice, bob } = await seed();
    await backend.groups.create({
      spaceId: space.id,
      name: 'Nous',
      memberIds: [alice.id, bob.id],
    });
    renderAt(`/e/${space.id}/soldes`);

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.getByText(/^15,00/)).toBeInTheDocument();
    expect(screen.getByText(/^-15,00/)).toBeInTheDocument();
    expect(screen.getAllByText(/payé 30,00/)).toHaveLength(1);

    fireEvent.click(screen.getByRole('tab', { name: 'Regroupements' }));
    expect(await screen.findByText('Nous')).toBeInTheDocument();
    expect(screen.getByText(/2 membres/)).toBeInTheDocument();
    expect(screen.getByText(/^0,00/)).toBeInTheDocument();
  });

  it('dit que tout le monde est à zéro sans dépense validée', async () => {
    const space = await backend.spaces.create({
      name: 'Coloc',
      currency: 'EUR',
      meName: 'Alice',
    });
    renderAt(`/e/${space.id}/soldes`);
    expect(
      await screen.findByText(
        'Aucune dépense validée : tout le monde est à zéro.'
      )
    ).toBeInTheDocument();
  });
});
