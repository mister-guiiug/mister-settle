import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { createStore } from '@mister-guiiug/dev-pwa-config/storage';
import { I18nProvider } from '../../i18n/index.ts';
import { localDb } from '../../backend/local.ts';
import { BackendError } from '../../backend/ports.ts';
import { createExpenseQueue } from '../../backend/sync.ts';
import { useSyncState } from '../../backend/sync-state.ts';
import { useSpaces } from '../spaces/store.ts';
import { usePeople } from '../people/store.ts';
import { useExpenses } from './store.ts';

/**
 * UNE DÉPENSE EN FILE SE VOIT DANS LA LISTE.
 *
 * L'assistant met une création en file hors ligne, puis ramène à la liste.
 * Relevé le 05/11/2026 : elle n'y figurait pas — la liste ne lisait que la
 * base (ou sa copie), et rien ne disait que la dépense existait. Le mode
 * distant est forcé ici : en local, rien n'attend jamais.
 */
vi.mock('../../backend/index.ts', async importOriginal => ({
  ...(await importOriginal<typeof import('../../backend/index.ts')>()),
  isRemote: true,
}));

const { ExpensesScreen } = await import('./ExpensesScreen.tsx');
const { backend } = await import('../../backend/index.ts');

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
  useSyncState.setState({
    online: false,
    staleAt: null,
    pending: 0,
    dead: 0,
    doneCount: 0,
  });
});

describe('ExpensesScreen — la file', () => {
  it('montre les créations en attente de CET espace, marquées « en attente »', async () => {
    const space = await backend.spaces.create({
      name: 'Coloc',
      currency: 'EUR',
      meName: 'Alice',
    });
    const other = await backend.spaces.create({
      name: 'Vacances',
      currency: 'EUR',
      meName: 'Alice',
    });
    const [alice] = await backend.participants.list(space.id);
    if (!alice) throw new Error('Alice manque');
    const queue = createExpenseQueue({
      store: createStore('settle-sync'),
      isOnline: () => false,
      save: () => Promise.reject(new BackendError('network', 'coupé')),
    });
    const queued = (spaceId: string, id: string, label: string) => ({
      input: {
        id,
        spaceId,
        label,
        amount: 1250,
        currency: 'EUR',
        spentOn: '2026-11-04',
        splitMethod: 'equal' as const,
        payers: [{ participantId: alice.id, amount: 1250 }],
        beneficiaries: [{ participantId: alice.id, position: 0 }],
      },
      spaceId,
      label,
      form: null,
    });
    queue.enqueue(
      queued(space.id, '00000000-0000-4000-8000-0000000000a1', 'Pizza')
    );
    queue.enqueue(
      queued(other.id, '00000000-0000-4000-8000-0000000000a2', 'Péage')
    );

    renderAt(`/e/${space.id}/depenses`);

    const link = await screen.findByRole('link', {
      name: 'Pizza, en attente d’envoi : voir la synchronisation',
    });
    expect(link).toHaveAttribute('href', '/hors-ligne');
    expect(link).toHaveTextContent('En attente');
    expect(link).toHaveTextContent('Payé par Alice');
    expect(link).toHaveTextContent(/12,50/);
    // L'autre espace garde la sienne.
    expect(screen.queryByText('Péage')).not.toBeInTheDocument();
    // Une dépense en attente n'est pas « aucune dépense ».
    expect(
      screen.queryByText('Aucune dépense pour le moment.')
    ).not.toBeInTheDocument();
  });
});
