import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../i18n/index.ts';
import { localDb } from '../../backend/local.ts';
import { useSyncState } from '../../backend/sync-state.ts';
import { useSpaces } from '../spaces/store.ts';
import { OfflineScreen } from './OfflineScreen.tsx';

/**
 * Sur l'appareil seul, la page hors ligne dit ce qui marche sans réseau, et
 * qu'ici rien n'attend jamais : pas de file, pas de lettre morte.
 */
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('dwc_locale', 'fr');
  localDb.clear();
  useSpaces.setState({ spaces: [], ready: false, error: null });
  useSyncState.setState({
    online: true,
    staleAt: null,
    pending: 0,
    dead: 0,
    doneCount: 0,
  });
});

describe('OfflineScreen', () => {
  it('explique ce qui marche sans réseau, et que rien n’attend sur l’appareil', async () => {
    render(
      <I18nProvider>
        <MemoryRouter>
          <OfflineScreen />
        </MemoryRouter>
      </I18nProvider>
    );
    expect(await screen.findByText('Hors ligne')).toBeInTheDocument();
    expect(screen.getByText('Sans réseau, vous pouvez :')).toBeInTheDocument();
    expect(
      screen.getByText(/créer une dépense — elle attend le réseau/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Ici, tout vit sur cet appareil : rien n’attend le réseau.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('En attente de réseau')).not.toBeInTheDocument();
    expect(screen.getByText('Synchronisé')).toBeInTheDocument();
  });

  it('dit qu’on est hors ligne quand le réseau manque', async () => {
    useSyncState.setState({ online: false });
    render(
      <I18nProvider>
        <MemoryRouter>
          <OfflineScreen />
        </MemoryRouter>
      </I18nProvider>
    );
    expect(await screen.findAllByText('Hors ligne')).not.toHaveLength(0);
    expect(screen.queryByText('Synchronisé')).not.toBeInTheDocument();
  });
});
