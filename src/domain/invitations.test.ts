import { describe, expect, it } from 'vitest';
import {
  invitationState,
  invitationUrl,
  tokenFromInput,
} from './invitations.ts';

const now = new Date('2026-09-07T12:00:00.000Z');
const base = {
  revokedAt: null,
  expiresAt: '2026-09-14T12:00:00.000Z',
  uses: 0,
  maxUses: 1,
};

describe('invitationState', () => {
  it('est actif tant que rien ne le retient', () => {
    expect(invitationState(base, now)).toBe('active');
  });

  it('révoqué prime sur expiré, qui prime sur épuisé', () => {
    expect(
      invitationState(
        {
          ...base,
          revokedAt: '2026-09-07T13:00:00.000Z',
          expiresAt: '2026-09-01T00:00:00.000Z',
          uses: 1,
        },
        now
      )
    ).toBe('revoked');
    expect(
      invitationState(
        { ...base, expiresAt: '2026-09-07T12:00:00.000Z', uses: 1 },
        now
      )
    ).toBe('expired');
    expect(invitationState({ ...base, uses: 1 }, now)).toBe('exhausted');
  });
});

describe('invitationUrl', () => {
  it('colle l’origine servie, la base de Vite et le jeton', () => {
    expect(invitationUrl('abc', 'https://x.test', '/')).toBe(
      'https://x.test/invitation/abc'
    );
    expect(invitationUrl('abc', 'https://x.test', '/mister-settle/')).toBe(
      'https://x.test/mister-settle/invitation/abc'
    );
    expect(invitationUrl('a b', 'https://x.test', '/app')).toBe(
      'https://x.test/app/invitation/a%20b'
    );
  });
});

describe('tokenFromInput', () => {
  it('relit le jeton depuis une adresse, ou le prend tel quel', () => {
    expect(
      tokenFromInput('https://x.test/mister-settle/invitation/a%20b?x=1')
    ).toBe('a b');
    expect(tokenFromInput('  deadbeef  ')).toBe('deadbeef');
  });
});
