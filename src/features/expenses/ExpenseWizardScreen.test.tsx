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
import { useExpenses } from './store.ts';
import { ExpenseWizardScreen } from './ExpenseWizardScreen.tsx';

/**
 * L'assistant, de bout en bout sur l'adaptateur local : ce qu'on tape
 * devient une dépense écrite, puis validée — avec les allocations que le
 * moteur calcule, et le statut que le port décide (ADR 0013).
 */
function renderAt(path: string) {
  return render(
    <I18nProvider>
      <AuthProvider adapter={null}>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route
                path="/e/:spaceId/depenses/nouvelle"
                element={<ExpenseWizardScreen mode="new" />}
              />
              <Route
                path="/e/:spaceId/depenses/:expenseId/modifier"
                element={<ExpenseWizardScreen mode="edit" />}
              />
              <Route
                path="/e/:spaceId/depenses/:expenseId"
                element={<p>écran de détail</p>}
              />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </I18nProvider>
  );
}

async function seed() {
  const space = await backend.spaces.create({
    name: 'Coloc',
    currency: 'EUR',
    meName: 'Alice',
  });
  const people = await backend.participants.list(space.id);
  const alice = people[0];
  if (!alice) throw new Error('Alice manque');
  const bob = await backend.participants.create({
    spaceId: space.id,
    displayName: 'Bob',
  });
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

describe('ExpenseWizardScreen', () => {
  it('crée une dépense à parts égales, et la valide', async () => {
    const { space, alice, bob } = await seed();
    renderAt(`/e/${space.id}/depenses/nouvelle`);

    fireEvent.change(await screen.findByLabelText('Libellé'), {
      target: { value: 'Restaurant' },
    });
    fireEvent.change(screen.getByLabelText('Montant (EUR)'), {
      target: { value: '30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));

    expect(
      await screen.findByText('Personnes retenues (2)')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));

    expect(await screen.findByText('Par personne')).toBeInTheDocument();
    expect(screen.getAllByText(/15,00/).length).toBeGreaterThanOrEqual(2);
    fireEvent.click(
      screen.getByRole('button', { name: 'Valider cette répartition' })
    );

    expect(await screen.findByText('écran de détail')).toBeInTheDocument();
    const [expense] = await backend.expenses.list(space.id);
    expect(expense?.status).toBe('validated');
    expect(expense?.payers).toEqual([
      { participantId: alice.id, amount: 3000 },
    ]);
    expect(expense?.allocations).toEqual([
      { participantId: alice.id, amount: 1500 },
      { participantId: bob.id, amount: 1500 },
    ]);
  });

  it('par montants : l’écart se voit, le reliquat s’affecte d’un geste', async () => {
    const { space, alice, bob } = await seed();
    renderAt(`/e/${space.id}/depenses/nouvelle`);

    fireEvent.change(await screen.findByLabelText('Libellé'), {
      target: { value: 'Courses' },
    });
    fireEvent.change(screen.getByLabelText('Montant (EUR)'), {
      target: { value: '30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));

    fireEvent.click(await screen.findByRole('tab', { name: 'Montants' }));
    fireEvent.change(screen.getByLabelText('Montant pour Alice'), {
      target: { value: '10' },
    });
    expect(screen.getByText(/Reste à répartir/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Affecter le reliquat à Bob' })
    );
    expect(
      screen.getByText('Les montants font le compte.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));

    fireEvent.click(
      await screen.findByRole('button', { name: 'Valider cette répartition' })
    );
    expect(await screen.findByText('écran de détail')).toBeInTheDocument();
    const [expense] = await backend.expenses.list(space.id);
    expect(expense?.status).toBe('validated');
    expect(expense?.allocations).toEqual([
      { participantId: alice.id, amount: 1000 },
      { participantId: bob.id, amount: 2000 },
    ]);
  });

  it('rouvrir une dépense validée et changer le montant la repasse en brouillon', async () => {
    const { space, alice, bob } = await seed();
    const saved = await backend.expenses.save(
      {
        spaceId: space.id,
        label: 'Essence',
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

    renderAt(`/e/${space.id}/depenses/${saved.id}/modifier`);
    fireEvent.change(await screen.findByLabelText('Montant (EUR)'), {
      target: { value: '40' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continuer' }));
    expect(
      await screen.findByText(/La répartition a changé/)
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Enregistrer en brouillon' })
    );
    expect(await screen.findByText('écran de détail')).toBeInTheDocument();
    const expense = await backend.expenses.get(saved.id);
    expect(expense?.status).toBe('draft');
    expect(expense?.amount).toBe(4000);
  });
});
