import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseAuthAdapter } from '@mister-guiiug/dev-pwa-config/auth/supabase';

/**
 * HORS LIGNE, L'ADAPTATEUR LIT LA SESSION DE CE PROJET.
 *
 * Le client passé au socle est un `Proxy` : le SDK n'arrive qu'au premier
 * appel réel. Hors ligne, le socle lit la session sans rien appeler — il lui
 * faut donc le nom de la case tout de suite. Sans lui, il prenait la première
 * case `sb-*` du `localStorage`, que toute la famille partage.
 */
vi.mock('../backend/index.ts', () => ({ coverage: { kind: 'supabase' } }));
vi.mock('../backend/supabase.ts', () => ({
  supabase: {
    // Hors ligne et SDK pas encore là : rien ne doit l'attendre.
    getClient: () => new Promise(() => {}),
    storageKey: () => 'sb-niqcmepnigldvuvivzlv-auth-token',
  },
}));

const { authAdapter } = await import('./index.ts');

const CASE = 'sb-niqcmepnigldvuvivzlv-auth-token';
const session = (id: string) =>
  JSON.stringify({
    access_token: 'entete.charge.signature',
    refresh_token: 'jeton-de-rafraichissement',
    expires_at: 1,
    user: { id },
  });

let onLineOriginal: PropertyDescriptor | undefined;

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://niqcmepnigldvuvivzlv.supabase.co');
  onLineOriginal ??= Object.getOwnPropertyDescriptor(
    Navigator.prototype,
    'onLine'
  );
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => false,
  });
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllEnvs();
  if (onLineOriginal)
    Object.defineProperty(navigator, 'onLine', onLineOriginal);
});

const adaptateur = () => authAdapter() as SupabaseAuthAdapter;

describe('hors ligne, la session de ce projet', () => {
  it('la sienne, même rangée après celle d’une autre app', async () => {
    localStorage.setItem('sb-uneautreapp-auth-token', session('soeur'));
    localStorage.setItem(CASE, session('moi'));
    const lue = (await adaptateur().getSession()) as { user: { id: string } };
    expect(lue.user.id).toBe('moi');
  });

  it('celle d’une AUTRE app ne fait pas entrer', async () => {
    localStorage.setItem('sb-uneautreapp-auth-token', session('soeur'));
    expect(await adaptateur().getSession()).toBeNull();
  });
});
