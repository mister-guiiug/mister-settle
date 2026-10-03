import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../i18n/index.ts';
import { localDb } from '../../backend/local.ts';
import { useSyncState } from '../../backend/sync-state.ts';
import { useSpaces } from '../spaces/store.ts';

/**
 * Mode distant : file vide et en ligne → empty state « Rien à synchroniser »,
 * pas de cartes de file vides permanentes. `isRemote` est une constante de
 * module : on la force ici comme pour l'accueil hors session.
 */
vi.mock('../../backend/index.ts', async importOriginal => ({
  ...(await importOriginal<typeof import('../../backend/index.ts')>()),
  isRemote: true,
}));

vi.mock('../../backend/sync.ts', () => ({
  expenseQueue: () => ({
    list: () => [],
    deadLetters: () => [],
    remove: () => undefined,
    requeueDead: () => undefined,
    flush: async () => undefined,
  }),
  dropDeadLetter: () => undefined,
}));

const { OfflineScreen } = await import('./OfflineScreen.tsx');

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('dwc_locale', 'fr');
  localDb.clear();
  useSpaces.setState({ spaces: [], ready: true, error: null });
  useSyncState.setState({
    online: true,
    staleAt: null,
    pending: 0,
    dead: 0,
    doneCount: 0,
  });
});

describe('OfflineScreen (distant)', () => {
  it('état sain : empty state, pas de file vide affichée', async () => {
    render(
      <I18nProvider>
        <MemoryRouter>
          <OfflineScreen />
        </MemoryRouter>
      </I18nProvider>
    );
    expect(await screen.findByText('Rien à synchroniser')).toBeInTheDocument();
    expect(screen.getByText(/La file est vide/)).toBeInTheDocument();
    expect(screen.queryByText('En attente de réseau')).not.toBeInTheDocument();
    expect(screen.getByText('Sans réseau, vous pouvez')).toBeInTheDocument();
  });
});
