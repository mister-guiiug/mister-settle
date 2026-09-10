import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { identifiantDeSession, identifiantRange } from './sessionUserId.ts';

/**
 * CE QUE CES CAS TIENNENT : que personne ne remette un appel réseau bloquant
 * sur le chemin de « qui suis-je ». `auth.getSession()` n'est pas une lecture —
 * jeton périmé, il part le renouveler et met une demi-minute à renoncer. Le
 * démarrage de l'application ne le rencontre plus depuis le socle 4.9.0 ; ici
 * c'est `me()`, qui l'appelait directement.
 */
const UID = '11111111-2222-3333-4444-555555555555';
const CASE_SUPABASE = 'sb-niqcmepnigldvuvivzlv-auth-token';

function ranger(id: string | undefined) {
  localStorage.setItem(
    CASE_SUPABASE,
    JSON.stringify({
      access_token: 'entete.charge.signature',
      refresh_token: 'jeton-de-rafraichissement',
      expires_at: Math.floor(Date.now() / 1000) - 7200,
      expires_in: 3600,
      token_type: 'bearer',
      user: id ? { id } : {},
    })
  );
}

let onLineOriginal: PropertyDescriptor | undefined;
function reseau(onLine: boolean) {
  onLineOriginal ??= Object.getOwnPropertyDescriptor(
    Navigator.prototype,
    'onLine'
  );
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => onLine,
  });
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  localStorage.clear();
  if (onLineOriginal) {
    Object.defineProperty(navigator, 'onLine', onLineOriginal);
  }
});

describe('l’identifiant rangé sur l’appareil', () => {
  it('est lu dans la session, même périmée', () => {
    ranger(UID);
    expect(identifiantRange()).toBe(UID);
  });

  it('est absent quand la session ne désigne personne', () => {
    ranger(undefined);
    expect(identifiantRange()).toBeUndefined();
  });

  it('est absent quand rien n’est rangé', () => {
    expect(identifiantRange()).toBeUndefined();
  });
});

describe('l’identifiant de session', () => {
  it('hors ligne : le stockage, sans rien demander au serveur', async () => {
    reseau(false);
    ranger(UID);
    let demande = false;
    const id = await identifiantDeSession(async () => {
      demande = true;
      return 'du-serveur';
    });
    expect(id).toBe(UID);
    // Le point du correctif.
    expect(demande).toBe(false);
  });

  it('hors ligne SANS session rangée : on demande quand même', async () => {
    // `navigator.onLine` peut mentir dans les deux sens ; sans rien à servir,
    // une tentative vaut mieux qu'un refus.
    reseau(false);
    const id = await identifiantDeSession(async () => 'du-serveur');
    expect(id).toBe('du-serveur');
  });

  it('en ligne : c’est le serveur qui fait foi', async () => {
    reseau(true);
    ranger(UID);
    expect(await identifiantDeSession(async () => 'du-serveur')).toBe(
      'du-serveur'
    );
  });

  it('réseau qui ment : l’attente est bornée, le stockage prend le relais', async () => {
    // Portail captif, Wi-Fi qui ne route rien : l'appel part et ne revient
    // jamais, sans lever — aucun `catch` ne servirait.
    reseau(true);
    ranger(UID);
    vi.useFakeTimers();
    try {
      const promesse = identifiantDeSession(() => new Promise(() => {}), 20);
      await vi.advanceTimersByTimeAsync(50);
      expect(await promesse).toBe(UID);
    } finally {
      vi.useRealTimers();
    }
  });

  it('appel qui lève : le stockage sait encore', async () => {
    reseau(true);
    ranger(UID);
    const id = await identifiantDeSession(async () => {
      throw new Error('Failed to fetch');
    });
    expect(id).toBe(UID);
  });

  it('ni serveur ni stockage : undefined, et l’appelant refusera', async () => {
    reseau(true);
    expect(await identifiantDeSession(async () => undefined)).toBeUndefined();
  });
});
