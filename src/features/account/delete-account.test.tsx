import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../../i18n/index.ts';
import { supabase } from '../../backend/supabase.ts';
import { createLocalBackend, localDb } from '../../backend/local.ts';
import { deleteMyAccount, memeAdresse } from './delete-account.ts';
import { DangerZone } from './DangerZone.tsx';

/**
 * Ce que ces tests figent : l'ORDRE des trois gestes de l'effacement, et le
 * fait que le geste demandé à l'utilisateur soit délibéré.
 *
 * Le pgTAP (`supabase/tests/suppression-compte.test.sql`) prouve l'autre
 * moitié — que la base efface vraiment, et que le droit d'écrire dans
 * `auth.users` vient bien du propriétaire de la fonction. Les deux sont
 * nécessaires : une RPC qui efface tout et une interface qui l'appelle sur un
 * doigt qui glisse ne valent pas mieux l'une que l'autre.
 */

/** Un client Supabase de comptoir : juste ce que `deleteMyAccount` appelle. */
function clientFactice(erreurRpc?: string) {
  const rpc = vi.fn(async () => ({
    error: erreurRpc ? { message: erreurRpc } : null,
  }));
  const signOut = vi.fn(async () => ({ error: null }));
  return { rpc, signOut, client: { rpc, auth: { signOut } } };
}

function avecI18n(children: ReactNode) {
  return <I18nProvider>{children}</I18nProvider>;
}

beforeEach(() => {
  localStorage.clear();
  // La locale initiale suit `navigator.language` quand rien n'est stocké, et
  // jsdom démarre en anglais : sans cette ligne, un test qui cherche
  // « Supprimer mon compte » attend un bouton nommé « Delete my account ».
  localStorage.setItem('dwc_locale', 'fr');
  localDb.clear();
});

describe('deleteMyAccount', () => {
  it('appelle la fonction de la base, purge le miroir local, puis coupe la session SUR L’APPAREIL', async () => {
    const { rpc, signOut, client } = clientFactice();
    const getClient = vi
      .spyOn(supabase, 'getClient')
      .mockResolvedValue(client as never);
    await createLocalBackend().spaces.create({
      name: 'Écrit avant',
      currency: 'EUR',
    });

    await deleteMyAccount();

    expect(rpc).toHaveBeenCalledWith('delete_my_account');
    expect(localDb.load().spaces).toEqual([]);
    // `scope: 'local'` : une déconnexion globale demande au serveur de
    // révoquer les jetons d'un compte qui n'existe plus, échoue, et laisse
    // l'application avec une session qui ne mène nulle part.
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    getClient.mockRestore();
  });

  it('refusée par la base, elle ne déconnecte pas et n’efface rien', async () => {
    // Le défaut que cet ordre évite : déconnecter d'abord laisserait un compte
    // intact et quelqu'un dehors, sans moyen de recommencer.
    const { signOut, client } = clientFactice('permission denied');
    const getClient = vi
      .spyOn(supabase, 'getClient')
      .mockResolvedValue(client as never);
    await createLocalBackend().spaces.create({
      name: 'Intact',
      currency: 'EUR',
    });

    await expect(deleteMyAccount()).rejects.toThrow('permission denied');

    expect(signOut).not.toHaveBeenCalled();
    expect(localDb.load().spaces).toHaveLength(1);
    getClient.mockRestore();
  });
});

describe('memeAdresse', () => {
  it('tolère la casse et les espaces, refuse le vide et le reste', () => {
    expect(memeAdresse('  Alice@Exemple.test ', 'alice@exemple.test')).toBe(
      true
    );
    expect(memeAdresse('', '')).toBe(false);
    expect(memeAdresse('   ', 'alice@exemple.test')).toBe(false);
    expect(memeAdresse('bob@exemple.test', 'alice@exemple.test')).toBe(false);
  });
});

describe('la zone dangereuse', () => {
  it('demande de retaper l’adresse, et une adresse fausse n’efface RIEN', async () => {
    const user = userEvent.setup();
    const efface = vi.fn(async () => {});
    render(
      avecI18n(<DangerZone email="alice@exemple.test" onDelete={efface} />)
    );

    // Rien n'est armé au premier rendu : le geste commence par un choix.
    expect(
      screen.queryByLabelText(/Retapez votre adresse/)
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Supprimer mon compte' })
    );

    await user.type(
      screen.getByLabelText(/Retapez votre adresse/),
      'bob@exemple.test'
    );
    await user.click(
      screen.getByRole('button', { name: 'Supprimer définitivement' })
    );

    expect(efface).not.toHaveBeenCalled();
    // Et le refus est DIT : un bouton grisé sans explication laisse chercher.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /ne correspond pas/
    );
  });

  it('efface quand l’adresse du compte est retapée, à la casse près', async () => {
    const user = userEvent.setup();
    const efface = vi.fn(async () => {});
    render(
      avecI18n(<DangerZone email="alice@exemple.test" onDelete={efface} />)
    );

    await user.click(
      screen.getByRole('button', { name: 'Supprimer mon compte' })
    );
    await user.type(
      screen.getByLabelText(/Retapez votre adresse/),
      'Alice@Exemple.test'
    );
    await user.click(
      screen.getByRole('button', { name: 'Supprimer définitivement' })
    );

    await waitFor(() => expect(efface).toHaveBeenCalledTimes(1));
  });

  it('dit ce que la base a refusé, au lieu de laisser croire que c’est fait', async () => {
    const user = userEvent.setup();
    const efface = vi.fn(() => Promise.reject(new Error('permission denied')));
    render(
      avecI18n(<DangerZone email="alice@exemple.test" onDelete={efface} />)
    );

    await user.click(
      screen.getByRole('button', { name: 'Supprimer mon compte' })
    );
    await user.type(
      screen.getByLabelText(/Retapez votre adresse/),
      'alice@exemple.test'
    );
    await user.click(
      screen.getByRole('button', { name: 'Supprimer définitivement' })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /permission denied/
    );
  });
});
