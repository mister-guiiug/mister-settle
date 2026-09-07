import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import { I18nProvider } from '../../i18n/index.ts';
import { backend } from '../../backend/index.ts';
import { localDb } from '../../backend/local.ts';
import { useSpaces } from '../spaces/store.ts';
import { usePeople } from '../people/store.ts';
import { useExpenses } from '../expenses/store.ts';
import { SettlementsScreen } from './SettlementsScreen.tsx';

function renderAt(path: string) {
  return render(
    <I18nProvider>
      <AuthProvider adapter={null}>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route
                path="/e/:spaceId/remboursements"
                element={<SettlementsScreen />}
              />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </I18nProvider>
  );
}

/** Alice paie 30 pour Alice et Bob : Bob doit 15 à Alice. */
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

describe('SettlementsScreen', () => {
  it('suggère, déclare, puis annule — et les soldes suivent', async () => {
    const { space, alice, bob } = await seed();
    renderAt(`/e/${space.id}/remboursements`);

    // La suggestion : Bob rembourse 15 à Alice (R18, glouton déterministe).
    expect(await screen.findByText('Bob → Alice')).toBeInTheDocument();
    expect(screen.getByText(/^15,00/)).toBeInTheDocument();
    expect(
      screen.getByText('Aucun remboursement déclaré.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Déclarer' }));
    expect(
      (screen.getByLabelText('Montant (EUR)') as HTMLInputElement).value
    ).toBe('15.00');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(
      await screen.findByText('Rien à régler : tout le monde est à zéro.')
    ).toBeInTheDocument();
    expect(screen.getByText('Remboursement déclaré.')).toBeInTheDocument();
    const [recorded] = await backend.settlements.list(space.id);
    expect(recorded).toMatchObject({
      fromParticipantId: bob.id,
      toParticipantId: alice.id,
      amount: 1500,
      status: 'recorded',
    });

    // Annuler depuis l'historique : la suggestion revient.
    fireEvent.click(
      screen.getByRole('button', { name: 'Annuler ce remboursement' })
    );
    expect(await screen.findByText('Annulé')).toBeInTheDocument();
    expect(await screen.findByText('Bob → Alice')).toBeInTheDocument();
    const [cancelled] = await backend.settlements.list(space.id);
    expect(cancelled?.status).toBe('cancelled');
  });

  it('refuse un remboursement d’une personne à elle-même', async () => {
    const { space } = await seed();
    renderAt(`/e/${space.id}/remboursements`);
    await screen.findByText('Bob → Alice');
    fireEvent.click(
      screen.getByRole('button', { name: 'Déclarer un remboursement' })
    );
    fireEvent.change(screen.getByLabelText('À qui'), {
      target: {
        value: (screen.getByLabelText('Qui rembourse') as HTMLSelectElement)
          .value,
      },
    });
    fireEvent.change(screen.getByLabelText('Montant (EUR)'), {
      target: { value: '5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(
      await screen.findByText('Deux personnes différentes sont nécessaires.')
    ).toBeInTheDocument();
  });
});
