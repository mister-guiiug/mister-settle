import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { AuthProvider } from '@mister-guiiug/dev-pwa-config/react/auth-provider';
import { useRole } from './index.ts';

/**
 * Ce que ce test fige : `useRole()` lit le rôle DANS LE JETON — et rien
 * d'autre. Jusqu'au 05/09/2026, rien n'écrivait `app_metadata.roles` ; le
 * badge admin ne pouvait jamais s'afficher, et ce test n'existait pas. Le
 * hook de `0004_role_dans_le_jeton.sql` recopie désormais `user_roles` dans
 * le jeton ; la moitié SQL est prouvée en pgTAP, celle-ci en est le crochet.
 */
function adapterAvec(session: unknown) {
  return {
    getSession: async () => session,
    onAuthStateChange: () => () => {},
  };
}

function wrapperPour(session: unknown) {
  const adapter = adapterAvec(session);
  return ({ children }: { children: ReactNode }) => (
    <AuthProvider adapter={adapter}>{children}</AuthProvider>
  );
}

describe('useRole', () => {
  it('voit un administrateur quand le jeton porte le rôle', async () => {
    const { result } = renderHook(() => useRole(), {
      wrapper: wrapperPour({
        user: { id: 'u1', app_metadata: { roles: ['admin'] } },
      }),
    });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.admin).toBe(true);
  });

  it('ne voit rien sans rôle — un tableau vide, ou un jeton muet', async () => {
    const vide = renderHook(() => useRole(), {
      wrapper: wrapperPour({ user: { id: 'u2', app_metadata: { roles: [] } } }),
    });
    await waitFor(() => expect(vide.result.current.ready).toBe(true));
    expect(vide.result.current.admin).toBe(false);

    // Le jeton d'un projet où le hook n'est PAS activé : `roles` absent.
    // C'est le cas silencieux que le README demande de régler à la main.
    const muet = renderHook(() => useRole(), {
      wrapper: wrapperPour({ user: { id: 'u3', app_metadata: {} } }),
    });
    await waitFor(() => expect(muet.result.current.ready).toBe(true));
    expect(muet.result.current.admin).toBe(false);
  });
});
