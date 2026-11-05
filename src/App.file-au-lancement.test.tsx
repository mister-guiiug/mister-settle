import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { ToastProvider } from '@mister-guiiug/dev-pwa-config/react/toast';
import { createStore } from '@mister-guiiug/dev-pwa-config/storage';
import { I18nProvider } from './i18n/index.ts';
import { localDb } from './backend/local.ts';
import { BackendError } from './backend/ports.ts';
import { useSyncState } from './backend/sync-state.ts';
import { createExpenseQueue, type QueuedExpense } from './backend/sync.ts';

/**
 * LA FILE DES CRÉATIONS DÉMARRE AU LANCEMENT.
 *
 * Relevé le 05/11/2026 : elle n'était créée qu'au premier `expenseQueue()` —
 * l'assistant, l'écran de synchronisation. Une dépense mise en file, puis
 * l'application fermée : au lancement suivant, rien n'était rejoué, et la
 * pastille disait « Synchronisé ».
 *
 * La file laissée par le lancement précédent est écrite ici sous le préfixe
 * de l'application (`settle-sync`), exactement comme elle l'aurait été.
 */
vi.mock('./backend/index.ts', async importOriginal => ({
  ...(await importOriginal<typeof import('./backend/index.ts')>()),
  isRemote: true,
}));

const { Shell } = await import('./App.tsx');
const { backend } = await import('./backend/index.ts');

const ID = '00000000-0000-4000-8000-0000000000f1';

/** Ce qu'un lancement précédent a laissé en file, hors ligne. */
function laisseEnFile(payload: QueuedExpense) {
  createExpenseQueue({
    store: createStore('settle-sync'),
    isOnline: () => false,
    save: () => Promise.reject(new BackendError('network', 'coupé')),
  }).enqueue(payload);
}

/** Une session lue dans le stockage, comme au lancement d'une app connectée. */
const sessionStockee = {
  getSession: async () => ({ user: { id: 'u1', email: 'a@exemple.test' } }),
  onAuthStateChange: () => () => {},
  signOut: async () => {},
};

function lance(adapter: object | null) {
  return render(
    <I18nProvider>
      <AuthProvider adapter={adapter}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/']}>
            <Shell />
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
  useSyncState.setState({
    online: true,
    staleAt: null,
    pending: 0,
    dead: 0,
    doneCount: 0,
  });
});

describe('la file au lancement', () => {
  it('la pastille compte ce qui attend dès l’ouverture, même sans session', async () => {
    laisseEnFile({
      input: {
        id: ID,
        spaceId: '00000000-0000-4000-8000-000000000001',
        label: 'Pain',
        amount: 300,
        currency: 'EUR',
        spentOn: '2026-11-04',
        splitMethod: 'equal',
        payers: [],
        beneficiaries: [],
      },
      spaceId: '00000000-0000-4000-8000-000000000001',
      label: 'Pain',
      form: null,
    });

    lance(null);

    expect(await screen.findByText('En attente (1)')).toBeInTheDocument();
    // Sans session, rien ne part : la base refuserait, et la dépense
    // finirait en lettre morte au lieu d'attendre la reconnexion.
    expect(useSyncState.getState().dead).toBe(0);
  });

  it('rejoue au lancement ce qui attendait, dès que la session est lue', async () => {
    const space = await backend.spaces.create({
      name: 'Coloc',
      currency: 'EUR',
      meName: 'Alice',
    });
    const [alice] = await backend.participants.list(space.id);
    if (!alice) throw new Error('Alice manque');
    laisseEnFile({
      input: {
        id: ID,
        spaceId: space.id,
        label: 'Pain',
        amount: 300,
        currency: 'EUR',
        spentOn: '2026-11-04',
        splitMethod: 'equal',
        payers: [{ participantId: alice.id, amount: 300 }],
        beneficiaries: [{ participantId: alice.id, position: 0 }],
      },
      spaceId: space.id,
      label: 'Pain',
      form: null,
    });

    lance(sessionStockee);

    await waitFor(async () => {
      const expenses = await backend.expenses.list(space.id, {
        status: 'all',
      });
      expect(expenses.map(e => e.id)).toContain(ID);
    });
    await waitFor(() => expect(useSyncState.getState().pending).toBe(0));
  });
});
