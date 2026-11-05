import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { createStore } from '@mister-guiiug/dev-pwa-config/storage';
import { I18nProvider } from '../../i18n/index.ts';
import { BackendError } from '../../backend/ports.ts';
import { createExpenseQueue, type QueuedExpense } from '../../backend/sync.ts';

/**
 * LA DÉCONNEXION PURGE CE QUE L'APPAREIL GARDE POUR LA SESSION — et demande
 * avant de jeter ce qui n'est pas parti.
 *
 * Relevé le 05/11/2026 : « Se déconnecter » ne touchait ni la copie des
 * lectures (IndexedDB) ni la file des créations. Sur un appareil partagé, le
 * compte suivant relisait hors ligne les espaces du précédent, et les rejeux
 * partaient sous sa session.
 */
vi.mock('../../backend/index.ts', async importOriginal => {
  const original =
    await importOriginal<typeof import('../../backend/index.ts')>();
  return {
    ...original,
    isRemote: true,
    coverage: { ...original.coverage, kind: 'supabase' },
  };
});

const { AccountScreen } = await import('./AccountScreen.tsx');
const { readCache } = await import('../../backend/index.ts');
const { unsentExpenses } = await import('../../backend/sync.ts');

const SPACE = '00000000-0000-4000-8000-000000000001';

function enFile(id: string): QueuedExpense {
  return {
    input: {
      id,
      spaceId: SPACE,
      label: 'Pain',
      amount: 300,
      currency: 'EUR',
      spentOn: '2026-11-04',
      splitMethod: 'equal',
      payers: [],
      beneficiaries: [],
    },
    spaceId: SPACE,
    label: 'Pain',
    form: null,
  };
}

function laisseEnFile(...ids: string[]) {
  const queue = createExpenseQueue({
    store: createStore('settle-sync'),
    isOnline: () => false,
    save: () => Promise.reject(new BackendError('network', 'coupé')),
  });
  for (const id of ids) queue.enqueue(enFile(id));
}

function connecte() {
  const signOut = vi.fn(async () => {});
  render(
    <I18nProvider>
      <AuthProvider
        adapter={{
          getSession: async () => ({
            user: { id: 'u1', email: 'alice@exemple.test' },
          }),
          onAuthStateChange: () => () => {},
          signOut,
        }}
      >
        <AccountScreen />
      </AuthProvider>
    </I18nProvider>
  );
  return signOut;
}

let videLaCopie: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('dwc_locale', 'fr');
  videLaCopie = vi.spyOn(readCache, 'clear').mockResolvedValue(true);
});

afterEach(() => {
  videLaCopie.mockRestore();
});

describe('la déconnexion', () => {
  it('sans rien en attente, purge la copie des lectures puis déconnecte', async () => {
    const user = userEvent.setup();
    const signOut = connecte();

    await user.click(
      await screen.findByRole('button', { name: 'Se déconnecter' })
    );

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(videLaCopie).toHaveBeenCalledTimes(1);
    // Une confirmation sans enjeu apprend à cliquer sans lire.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('avec des dépenses en attente, dit combien seront perdues, et n’efface rien sans accord', async () => {
    const user = userEvent.setup();
    laisseEnFile(
      '00000000-0000-4000-8000-0000000000b1',
      '00000000-0000-4000-8000-0000000000b2'
    );
    const signOut = connecte();

    await user.click(
      await screen.findByRole('button', { name: 'Se déconnecter' })
    );
    const boite = await screen.findByRole('alertdialog');
    expect(boite).toHaveTextContent(
      /2 dépenses ne sont pas encore parties à la base/
    );

    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(signOut).not.toHaveBeenCalled();
    expect(videLaCopie).not.toHaveBeenCalled();
    expect(unsentExpenses()).toBe(2);

    await user.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    await user.click(
      await screen.findByRole('button', {
        name: 'Se déconnecter et les perdre',
      })
    );

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(videLaCopie).toHaveBeenCalledTimes(1);
    expect(unsentExpenses()).toBe(0);
  });
});
